import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeEventTopics,encodeAbiParameters,parseAbi} from 'viem';
import {verifySettlement} from '../runtime/settlement.js';
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)','event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)']);
const asset='0x036cbd53842c5426634e7929541ec2318f3dcf7e',from='0x1111111111111111111111111111111111111111',to='0x2222222222222222222222222222222222222222',nonce='0x'+'11'.repeat(32),hash='0x'+'22'.repeat(32);
function fixture(){
 const receipt={asset,authorization:{from,to,value:'1000',nonce,validAfter:'900',validBefore:'1200'},settlement:{success:true,network:'eip155:84532',transaction:hash}};
 const tx={status:'success',blockNumber:10n,blockHash:hash,logs:[
  {address:asset,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[1000n])},
  {address:asset,topics:encodeEventTopics({abi,eventName:'AuthorizationUsed',args:{authorizer:from,nonce}}),data:'0x'}
 ]};
 const client={getChainId:async()=>84532,getTransactionReceipt:async()=>tx,getBlock:async()=>({hash,timestamp:1000n}),getBlockNumber:async()=>11n};
 return {receipt,tx,client};
}
test('settlement requires matching USDC transfer plus exact authorization nonce',async()=>{
 const {receipt,client}=fixture();assert.equal((await verifySettlement({},receipt,{client})).transaction,hash);
});
for(const name of ['wrong chain','revert','wrong token','missing nonce','wrong amount','unconfirmed','reorg'])test('reject settlement '+name,async()=>{
 const {receipt,client,tx}=fixture();
 if(name==='wrong chain')client.getChainId=async()=>8453;
 if(name==='revert')tx.status='reverted';
 if(name==='wrong token')tx.logs[0].address=to;
 if(name==='missing nonce')tx.logs.pop();
 if(name==='wrong amount')receipt.authorization.value='999';
 if(name==='unconfirmed')client.getBlockNumber=async()=>10n;
 if(name==='reorg')client.getBlock=async()=>({hash:nonce,timestamp:1000n});
 await assert.rejects(()=>verifySettlement({},receipt,{client}));
});
