import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import solc from 'solc';
import {sessionClients,assertPaymentTypedData,authorizationTypes,verifyValidatorCode} from '../runtime/session.js';
import artifact from '../runtime/validator-artifact.json' with {type:'json'};
test('session runtime rejects root key config before network access',()=>{
 assert.throws(()=>sessionClients({network:'eip155:84532',session:{},aa:{ownerPrivateKey:'secret'}}),/Remove owner keys/);
 assert.throws(()=>sessionClients({network:'eip155:8453',session:{}}),/Base Sepolia/);
});
test('deployed artifact matches checked-in Solidity and immutable locations',()=>{
 const source=fs.readFileSync(new URL('../contracts/MandateValidator.sol',import.meta.url),'utf8');
 const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'MandateValidator.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}})));
 const c=out.contracts['MandateValidator.sol'].MandateValidator;
 assert.equal(artifact.bytecode,'0x'+c.evm.bytecode.object);
 assert.equal(artifact.runtimeBytecode,'0x'+c.evm.deployedBytecode.object);
 assert.deepEqual(artifact.abi,c.abi);
 assert.deepEqual(artifact.immutableReferences,c.evm.deployedBytecode.immutableReferences);
});
test('validator code check accepts compiler immutables but rejects instruction changes',async()=>{
 let code=artifact.runtimeBytecode;
 for(const refs of Object.values(artifact.immutableReferences))for(const {start,length} of refs){const i=2+start*2;code=code.slice(0,i)+'1'.repeat(length*2)+code.slice(i+length*2);}
 await verifyValidatorCode({getCode:async()=>code},'0xunused');
 await assert.rejects(()=>verifyValidatorCode({getCode:async()=> '0xff'+code.slice(4)},'0xunused'),/bytecode mismatch/);
});
test('signer permits only exact USDC transfer schema and parties',()=>{
 const m={asset:'0x036cbd53842c5426634e7929541ec2318f3dcf7e',aaAddress:'0x1111111111111111111111111111111111111111',payTo:'0x2222222222222222222222222222222222222222'};
 const td={domain:{name:'USDC',version:'2',chainId:84532,verifyingContract:m.asset},types:authorizationTypes,primaryType:'TransferWithAuthorization',message:{from:m.aaAddress,to:m.payTo,value:1n,validAfter:1n,validBefore:100n,nonce:'0x'+'11'.repeat(32)}};
 assert.match(assertPaymentTypedData(td,m),/^0x[0-9a-f]{64}$/);
 assert.throws(()=>assertPaymentTypedData({...td,domain:{...td.domain,chainId:8453}},m));
 assert.throws(()=>assertPaymentTypedData({...td,message:{...td.message,to:m.aaAddress}},m));
 const changed={...td,types:{TransferWithAuthorization:authorizationTypes.TransferWithAuthorization.map(f=>f.name==='value'?{...f,type:'uint128'}:f)}};
 assert.throws(()=>assertPaymentTypedData(changed,m),/schema changed/);
});
