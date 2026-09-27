import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import solc from 'solc';
import {pad} from 'viem';
import {sessionClients,checkSession,assertPaymentTypedData,authorizationTypes,verifyValidatorCode,verifyValidatorConfiguration,expectedTokenDomain,MAINNET_USDC,SESSION_NETWORKS} from '../runtime/session.js';
import artifact from '../runtime/validator-artifact.json' with {type:'json'};
import mainnetArtifact from '../runtime/validator-mainnet-artifact.json' with {type:'json'};
test('session runtime rejects root key config before network access',()=>{
 assert.throws(()=>sessionClients({network:'eip155:84532',session:{},aa:{ownerPrivateKey:'secret'}}),/Remove owner keys/);
 assert.throws(()=>sessionClients({network:'eip155:8453',session:{}}),/allowMainnet/);
 const mainnet=sessionClients({network:'eip155:8453',allowMainnet:true,session:{wallet:'0x1111111111111111111111111111111111111111',validator:'0x2222222222222222222222222222222222222222',rpcUrl:'https://rpc.example',agentPrivateKey:'0x'+'01'.padStart(64,'0')}});
 assert.equal(mainnet.client.chain.id,8453);
});
test('deployed artifact matches checked-in Solidity and immutable locations',()=>{
 const source=fs.readFileSync(new URL('../contracts/MandateValidator.sol',import.meta.url),'utf8');
 const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'MandateValidator.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}})));
 const c=out.contracts['MandateValidator.sol'].MandateValidator;
 const mc=out.contracts['MandateValidator.sol'].MandateValidatorMainnet;
 assert.equal(artifact.bytecode,'0x'+c.evm.bytecode.object);
 assert.equal(artifact.runtimeBytecode,'0x'+c.evm.deployedBytecode.object);
 assert.deepEqual(artifact.abi,c.abi);
 assert.deepEqual(artifact.immutableReferences,c.evm.deployedBytecode.immutableReferences);
 assert.equal(mainnetArtifact.bytecode,'0x'+mc.evm.bytecode.object);
 assert.equal(mainnetArtifact.runtimeBytecode,'0x'+mc.evm.deployedBytecode.object);
 assert.deepEqual(mainnetArtifact.abi,mc.abi);
 assert.deepEqual(mainnetArtifact.immutableReferences,mc.evm.deployedBytecode.immutableReferences);
});
test('validator code check accepts compiler immutables but rejects instruction changes',async()=>{
 let code=artifact.runtimeBytecode;
 for(const refs of Object.values(artifact.immutableReferences))for(const {start,length} of refs){const i=2+start*2;code=code.slice(0,i)+'1'.repeat(length*2)+code.slice(i+length*2);}
 await verifyValidatorCode({getCode:async()=>code},'0xunused');
 await assert.rejects(()=>verifyValidatorCode({getCode:async()=> '0xff'+code.slice(4)},'0xunused'),/bytecode mismatch/);
});
test('mainnet validator verification checks wallet, native USDC, chain and EIP-712 domain immutables',async()=>{
 const values={wallet:'0x1111111111111111111111111111111111111111',token:MAINNET_USDC,networkChainId:8453n,tokenDomain:expectedTokenDomain('eip155:8453')};
 const client={getCode:async()=>mainnetArtifact.runtimeBytecode,readContract:async({functionName})=>values[functionName]};
 await verifyValidatorConfiguration(client,'0x2222222222222222222222222222222222222222',values.wallet,'eip155:8453');
 await assert.rejects(()=>verifyValidatorConfiguration({...client,readContract:async({functionName})=>functionName==='token'?'0x036cbd53842c5426634e7929541ec2318f3dcf7e':values[functionName]},'0x2222222222222222222222222222222222222222',values.wallet,'eip155:8453'),/immutable configuration mismatch/);
});
test('session status validates mainnet RPC, contract immutables and installed owner slot',async()=>{
 const wallet='0x1111111111111111111111111111111111111111',validator='0x2222222222222222222222222222222222222222',agentKey='0x'+'01'.padStart(64,'0');
 const config={network:'eip155:8453',allowMainnet:true,session:{wallet,validator,ownerIndex:'0',rpcUrl:'https://rpc.example',agentPrivateKey:agentKey}};
 const net=SESSION_NETWORKS[config.network];
 const client={getChainId:async()=>8453,getCode:async({address})=>address.toLowerCase()===validator.toLowerCase()?mainnetArtifact.runtimeBytecode:'0x6000',readContract:async({functionName})=>({wallet,token:net.asset,networkChainId:8453n,tokenDomain:expectedTokenDomain(config.network),ownerAtIndex:pad(validator)})[functionName]};
 const ctx=await checkSession(config,{clientsFactory:()=>({s:config.session,account:{address:'0x3333333333333333333333333333333333333333'},client,writer:{}})});
 assert.equal(ctx.s.validator,validator);
 await assert.rejects(()=>checkSession({...config,allowMainnet:false},{clientsFactory:()=>{throw Error('must fail before network access')}}),/allowMainnet/);
});
test('signer permits only exact USDC transfer schema and parties',()=>{
 const m={asset:'0x036cbd53842c5426634e7929541ec2318f3dcf7e',aaAddress:'0x1111111111111111111111111111111111111111',payTo:'0x2222222222222222222222222222222222222222'};
 const td={domain:{name:'USDC',version:'2',chainId:84532,verifyingContract:m.asset},types:authorizationTypes,primaryType:'TransferWithAuthorization',message:{from:m.aaAddress,to:m.payTo,value:1n,validAfter:1n,validBefore:100n,nonce:'0x'+'11'.repeat(32)}};
 assert.match(assertPaymentTypedData(td,m),/^0x[0-9a-f]{64}$/);
 assert.throws(()=>assertPaymentTypedData({...td,domain:{...td.domain,chainId:8453}},m));
 assert.throws(()=>assertPaymentTypedData({...td,message:{...td.message,to:m.aaAddress}},m));
 const changed={...td,types:{TransferWithAuthorization:authorizationTypes.TransferWithAuthorization.map(f=>f.name==='value'?{...f,type:'uint128'}:f)}};
 assert.throws(()=>assertPaymentTypedData(changed,m),/schema changed/);
 const mainnetMandate={...m,network:'eip155:8453',asset:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'};
 const mainnetTd={...td,domain:{name:'USD Coin',version:'2',chainId:8453,verifyingContract:mainnetMandate.asset}};
 assert.match(assertPaymentTypedData(mainnetTd,mainnetMandate),/^0x[0-9a-f]{64}$/);
 assert.throws(()=>assertPaymentTypedData({...mainnetTd,domain:{...mainnetTd.domain,name:'USDC'}},mainnetMandate));
});
