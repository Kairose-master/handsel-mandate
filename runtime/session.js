import {createPublicClient,createWalletClient,http,encodeAbiParameters,parseAbi,hashTypedData,pad,keccak256,toBytes} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {base,baseSepolia} from 'viem/chains';
import testnetArtifact from './validator-artifact.json' with {type:'json'};
import mainnetArtifact from './validator-mainnet-artifact.json' with {type:'json'};
import {checkX402Risk} from './dambi.js';
export const validatorAbi=testnetArtifact.abi;
export const MAINNET_USDC='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
export const SESSION_NETWORKS={
  'eip155:84532':{chain:baseSepolia,chainId:84532,asset:'0x036cbd53842c5426634e7929541ec2318f3dcf7e',domainName:'USDC',artifact:testnetArtifact},
  'eip155:8453':{chain:base,chainId:8453,asset:MAINNET_USDC,domainName:'USD Coin',artifact:mainnetArtifact},
};
export const walletAbi=parseAbi([
  'function ownerAtIndex(uint256) view returns (bytes)',
  'function nextOwnerIndex() view returns (uint256)',
  'function addOwnerAddress(address)',
  'function execute(address,uint256,bytes) payable',
  'function replaySafeHash(bytes32) view returns (bytes32)',
  'function isValidSignature(bytes32,bytes) view returns (bytes4)'
]);
export const authorizationTypes={TransferWithAuthorization:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}]};
export async function verifyValidatorCode(client,address,network='eip155:84532'){
  const artifact=SESSION_NETWORKS[network]?.artifact;
  if(!artifact)throw Error(`Unsupported validator network ${network}`);
  let code=await client.getCode({address});
  if(!code||code.length!==artifact.runtimeBytecode.length)throw Error('Validator bytecode mismatch');
  for(const refs of Object.values(artifact.immutableReferences))for(const {start,length} of refs){
    const offset=2+start*2;code=code.slice(0,offset)+'0'.repeat(length*2)+code.slice(offset+length*2);
  }
  if(code.toLowerCase()!==artifact.runtimeBytecode.toLowerCase())throw Error('Validator bytecode mismatch');
}
export function expectedTokenDomain(network){
  const net=SESSION_NETWORKS[network];if(!net)throw Error(`Unsupported validator network ${network}`);
  return keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'bytes32'},{type:'uint256'},{type:'address'}],[keccak256(toBytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),keccak256(toBytes(net.domainName)),keccak256(toBytes('2')),BigInt(net.chainId),net.asset]));
}
export async function verifyValidatorConfiguration(client,address,wallet,network){
  const net=SESSION_NETWORKS[network];if(!net)throw Error(`Unsupported validator network ${network}`);
  await verifyValidatorCode(client,address,network);
  const [boundWallet,token,chainId,domain]=await Promise.all([
    client.readContract({address,abi:validatorAbi,functionName:'wallet'}),
    client.readContract({address,abi:validatorAbi,functionName:'token'}),
    client.readContract({address,abi:validatorAbi,functionName:'networkChainId'}),
    client.readContract({address,abi:validatorAbi,functionName:'tokenDomain'}),
  ]);
  if(boundWallet.toLowerCase()!==wallet.toLowerCase()||token.toLowerCase()!==net.asset||chainId!==BigInt(net.chainId)||domain.toLowerCase()!==expectedTokenDomain(network).toLowerCase())throw Error('Validator immutable configuration mismatch');
}
export function sessionClients(config){
  const net=SESSION_NETWORKS[config.network];
  if(!net||!config.session)throw Error('Supported session configuration required');
  if(config.network==='eip155:8453'&&config.allowMainnet!==true)throw Error('Set allowMainnet=true to enable real-asset signing');
  if(config.aa?.ownerPrivateKey||config.privateKey)throw Error('Remove owner keys from agent runtime configuration');
  const s=config.session;
  for(const field of ['wallet','validator'])if(!/^0x[0-9a-fA-F]{40}$/.test(s[field]??''))throw Error(`Invalid session ${field}`);
  const url=new URL(s.rpcUrl);
  if(url.protocol!=='https:')throw Error('HTTPS RPC required');
  const account=privateKeyToAccount(s.agentPrivateKey);
  const client=createPublicClient({chain:net.chain,transport:http(s.rpcUrl,{timeout:15000,retryCount:0})});
  const writer=createWalletClient({account,chain:net.chain,transport:http(s.rpcUrl,{timeout:15000,retryCount:0})});
  return {s,account,client,writer};
}
export async function checkSession(config,{clientsFactory=sessionClients}={}){
  const net=SESSION_NETWORKS[config.network];
  if(config.network==='eip155:8453'&&config.allowMainnet!==true)throw Error('Set allowMainnet=true to enable real-asset signing');
  const ctx=clientsFactory(config),{s,client}=ctx;
  if(await client.getChainId()!==net.chainId)throw Error('RPC chain mismatch');
  await verifyValidatorConfiguration(client,s.validator,s.wallet,config.network);
  const code=await client.getCode({address:s.wallet});
  if(!code||code==='0x')throw Error('Smart account not deployed');
  const owner=await client.readContract({address:s.wallet,abi:walletAbi,functionName:'ownerAtIndex',args:[BigInt(s.ownerIndex)]});
  if(owner.toLowerCase()!==pad(s.validator).toLowerCase())throw Error('Validator not installed at configured owner index');
  return ctx;
}
export async function checkGrant(config,m){
  const ctx=await checkSession(config),{client,s,account}=ctx;
  const net=SESSION_NETWORKS[config.network];
  if(m.network!==config.network||m.asset?.toLowerCase()!==net.asset||m.aaAddress.toLowerCase()!==s.wallet.toLowerCase()||m.validator?.toLowerCase()!==s.validator.toLowerCase())throw Error('Mandate account or network changed');
  const g=await client.readContract({address:s.validator,abi:validatorAbi,functionName:'grants',args:['0x'+m.workflow.binding]});
  if(g[0].toLowerCase()!==account.address.toLowerCase()||g[1].toLowerCase()!==m.payTo.toLowerCase()||g[2]!==BigInt(m.total)||g[3]!==BigInt(m.perCall)||g[5]!==BigInt(Math.floor(m.expiresAt/1000))||g[6]!=='0x'+m.workflow.binding||g[7])throw Error('Human grant missing, revoked, or mismatched; run owner grant command');
  return ctx;
}
export function assertPaymentTypedData(td,m){
  const net=SESSION_NETWORKS[m.network??'eip155:84532'];
  const d=td.domain;
  if(!net||td.primaryType!=='TransferWithAuthorization'||d.name!==net.domainName||d.version!=='2'||Number(d.chainId)!==net.chainId||d.verifyingContract?.toLowerCase()!==m.asset.toLowerCase()||m.asset.toLowerCase()!==net.asset)throw Error('Unsupported payment typed data');
  const expected=hashTypedData({...td,types:authorizationTypes});
  if(hashTypedData(td)!==expected)throw Error('Payment schema changed');
  if(td.message.from.toLowerCase()!==m.aaAddress.toLowerCase()||td.message.to.toLowerCase()!==m.payTo.toLowerCase())throw Error('Payment parties changed');
  return expected;
}
export function wrapValidatorSignature(index,signatureData){
  return encodeAbiParameters([{type:'tuple',components:[{name:'ownerIndex',type:'uint256'},{name:'signatureData',type:'bytes'}]}],[{ownerIndex:BigInt(index),signatureData}]);
}
export async function sessionSigner(config,m,record,{riskEvaluator}={}){
  const {s,client,writer,account}=await checkGrant(config,m);
  return {account:{address:s.wallet,async signTypedData(td){
    const digest=assertPaymentTypedData(td,m);
    const risk=await checkX402Risk(td,m,riskEvaluator);
    await record({risk:{decision:risk.verdict.decision,source:risk.verdict.source,enforcement:risk.verdict.enforcement,action:risk.action.body.token.action}});
    const a=Object.fromEntries(Object.entries(td.message).map(([k,v])=>[k,['value','validAfter','validBefore'].includes(k)?BigInt(v):v]));
    // Persist the authorization before the onchain reservation. No EIP-1271 signing
    // can mutate state, hence reservations are separate, serial, nonrefundable txs.
    await record({authorization:Object.fromEntries(Object.entries(a).map(([k,v])=>[k,typeof v==='bigint'?v.toString():v]))});
    const {request}=await client.simulateContract({account,address:s.validator,abi:validatorAbi,functionName:'reserve',args:['0x'+m.workflow.binding,a]});
    const hash=await writer.writeContract(request);
    await record({reservationTransaction:hash});
    const receipt=await client.waitForTransactionReceipt({hash,timeout:45000});
    if(receipt.status!=='success')throw Error('Onchain reservation reverted');
    const replayHash=await client.readContract({address:s.wallet,abi:walletAbi,functionName:'replaySafeHash',args:[digest]});
    const signature=wrapValidatorSignature(s.ownerIndex,await account.sign({hash:replayHash}));
    const magic=await client.readContract({address:s.wallet,abi:walletAbi,functionName:'isValidSignature',args:[digest,signature]});
    if(magic!=='0x1626ba7e')throw Error('Wallet rejected reserved authorization');
    return signature;
  }}};
}
export async function revokeSession(config,m){
  const {s,client,writer}=await checkSession(config);
  const g=await client.readContract({address:s.validator,abi:validatorAbi,functionName:'grants',args:['0x'+m.workflow.binding]});
  if(g[0]==='0x0000000000000000000000000000000000000000'||g[7])return null;
  const hash=await writer.writeContract({address:s.validator,abi:validatorAbi,functionName:'revoke',args:['0x'+m.workflow.binding]});
  const r=await client.waitForTransactionReceipt({hash,timeout:45000});
  if(r.status!=='success')throw Error('Onchain revoke failed');
  return hash;
}
