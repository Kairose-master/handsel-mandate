import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {recoverTypedDataAddress} from 'viem';
import {buy,liveMandate,validateQuote,NETWORK,ASSET} from '../runtime/buyer.js';
const config={endpoint:'https://seller.example/paid',payTo:'0x1111111111111111111111111111111111111111',privateKey:generatePrivateKey()};
const required=()=>({x402Version:2,resource:{url:config.endpoint},accepts:[{scheme:'exact',network:NETWORK,asset:ASSET,amount:'1000',payTo:config.payTo,maxTimeoutSeconds:60,extra:{name:'USDC',version:'2'}}]});
const state=()=>({mandate:liveMandate({total:'0.01',perCall:'0.005',minutes:30},config),receipts:[]});
test('testnet quote accepted',()=>assert.equal(validateQuote(required(),config,state().mandate).amount,'1000'));
for(const [field,value] of [['network','eip155:8453'],['asset',config.payTo],['payTo',ASSET],['amount','9999999'],['maxTimeoutSeconds',999999]])test('reject changed '+field,()=>{const r=required();r.accepts[0][field]=value;assert.throws(()=>validateQuote(r,config,state().mandate));});
test('real SDK produces verifiable EIP-3009 signature across 402 retry',async()=>{
 const s=state();let calls=0,saves=0;
 const fetcher=async(url,opts)=>{
  assert.equal(url,config.endpoint);assert.equal(opts.redirect,'error');calls++;
  if(calls===1)return new Response('',{status:402,headers:{'PAYMENT-REQUIRED':Buffer.from(JSON.stringify(required())).toString('base64')}});
  assert.ok(saves>=1,'budget must persist before signature leaves host');
  const p=JSON.parse(Buffer.from(opts.headers['PAYMENT-SIGNATURE'],'base64').toString());
  const a=p.payload.authorization;
  const recovered=await recoverTypedDataAddress({domain:{name:'USDC',version:'2',chainId:84532,verifyingContract:ASSET},types:{TransferWithAuthorization:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}]},primaryType:'TransferWithAuthorization',message:a,signature:p.payload.signature});
  assert.equal(recovered.toLowerCase(),privateKeyToAccount(config.privateKey).address.toLowerCase());
  assert.equal(a.to.toLowerCase(),config.payTo);assert.equal(a.value,'1000');
  return new Response('{"answer":42}',{headers:{'PAYMENT-RESPONSE':Buffer.from(JSON.stringify({success:true,network:NETWORK,transaction:'fixture-not-onchain'})).toString('base64')}});
 };
 const r=await buy(config,s,{mandateId:s.mandate.id,requestId:'one'},async()=>{saves++;},{fetcher});
 assert.equal(r.status,'seller-reported-settled');assert.equal(s.mandate.reserved,1000);
 await buy(config,s,{mandateId:s.mandate.id,requestId:'one'},async()=>{},{fetcher});assert.equal(calls,2);
});
test('uncertain network failure retains budget reservation',async()=>{const s=state();let n=0;const r=await buy(config,s,{mandateId:s.mandate.id,requestId:'fail'},async()=>{},{fetcher:async()=>{if(n++)throw Error('Timeout');return new Response('',{status:402,headers:{'PAYMENT-REQUIRED':Buffer.from(JSON.stringify(required())).toString('base64')}});}});assert.equal(r.status,'uncertain');assert.equal(s.mandate.reserved,1000);});
test('revoked mandate never makes request',async()=>{const s=state();s.mandate.revoked=true;await assert.rejects(()=>buy(config,s,{mandateId:s.mandate.id,requestId:'no'},async()=>{},{fetcher:()=>assert.fail('network called')}));});
