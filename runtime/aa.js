import {createPublicClient,http,hashTypedData} from 'viem';
import {baseSepolia} from 'viem/chains';
import {privateKeyToAccount} from 'viem/accounts';
import {createBundlerClient,toCoinbaseSmartAccount} from 'viem/account-abstraction';

const MAGIC='0x1626ba7e';
const eip1271Abi=[{type:'function',name:'isValidSignature',stateMutability:'view',inputs:[{name:'hash',type:'bytes32'},{name:'signature',type:'bytes'}],outputs:[{name:'magicValue',type:'bytes4'}]}];

function aaConfig(config){
  const aa=config.aa;
  if(!aa||aa.type!=='coinbase-smart-account'||aa.version!=='1.1')throw Error('Configure aa.type=coinbase-smart-account and aa.version=1.1');
  if(!/^https:\/\//.test(aa.rpcUrl??''))throw Error('AA rpcUrl must use HTTPS');
  if(!/^0x[0-9a-fA-F]{64}$/.test(aa.ownerPrivateKey??''))throw Error('Invalid dedicated AA owner key');
  return aa;
}

export async function createAASigner(config,{requireDeployed=true,transport}={}){
  const aa=aaConfig(config),owner=privateKeyToAccount(aa.ownerPrivateKey);
  const client=createPublicClient({chain:baseSepolia,transport:transport??http(aa.rpcUrl)});
  const account=await toCoinbaseSmartAccount({client,owners:[owner],version:'1.1'});
  const address=await account.getAddress();
  if(aa.address&&address.toLowerCase()!==aa.address.toLowerCase())throw Error('Configured AA address does not match derived account');
  const code=requireDeployed?await client.getCode({address}):undefined;
  if(requireDeployed&&(!code||code==='0x'))throw Error('AA account is not deployed; run aa.provision first');
  return {account,client,ownerAddress:owner.address,address,deployed:!!code&&code!=='0x'};
}

export async function verifyAASigner(config){
  const aa=await createAASigner(config);
  const typedData={domain:{name:'Handsel AA compatibility',version:'1',chainId:baseSepolia.id,verifyingContract:aa.address},types:{Probe:[{name:'value',type:'bytes32'}]},primaryType:'Probe',message:{value:'0x0000000000000000000000000000000000000000000000000000000000000001'}};
  const signature=await aa.account.signTypedData(typedData);
  const magic=await aa.client.readContract({address:aa.address,abi:eip1271Abi,functionName:'isValidSignature',args:[hashTypedData(typedData),signature]});
  if(magic.toLowerCase()!==MAGIC)throw Error('AA account failed EIP-1271 compatibility probe');
  return aa;
}

export async function aaStatus(config){
  const aa=await createAASigner(config,{requireDeployed:false});
  const code=await aa.client.getCode({address:aa.address});
  return {type:'erc-4337/coinbase-smart-account',network:'eip155:84532',address:aa.address,ownerAddress:aa.ownerAddress,deployed:!!code&&code!=='0x'};
}

export async function provisionAA(config){
  const aaConfigValue=aaConfig(config);
  if(!/^https:\/\//.test(aaConfigValue.bundlerUrl??''))throw Error('AA bundlerUrl must use HTTPS');
  const aa=await createAASigner(config,{requireDeployed:false});
  const code=await aa.client.getCode({address:aa.address});
  if(code&&code!=='0x')return {address:aa.address,alreadyDeployed:true};
  const bundler=createBundlerClient({account:aa.account,client:aa.client,chain:baseSepolia,transport:http(aaConfigValue.bundlerUrl),...(aaConfigValue.usePaymaster?{paymaster:true}:{})});
  const hash=await bundler.sendUserOperation({calls:[{to:aa.ownerAddress,value:0n,data:'0x'}]});
  const receipt=await bundler.waitForUserOperationReceipt({hash,timeout:120000});
  const deployedCode=await aa.client.getCode({address:aa.address});
  if(!deployedCode||deployedCode==='0x')throw Error('UserOperation included but AA account code is missing');
  return {address:aa.address,userOperationHash:hash,transactionHash:receipt.receipt.transactionHash,success:receipt.success};
}
