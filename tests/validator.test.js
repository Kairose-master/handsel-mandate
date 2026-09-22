import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pad,encodeFunctionData,hashTypedData} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {bytesToHex} from '@ethereumjs/util';
import solcWallet from 'solc-wallet';
import {compile,evm} from './helpers/evm.js';
import {wrapValidatorSignature,authorizationTypes} from '../runtime/session.js';
import {x402Client} from '@x402/core/client';
import {ExactEvmScheme} from '@x402/evm/exact/client';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/coinbase-sources.json',import.meta.url)));
const walletContract=compile(fixture.sources,solcWallet).CoinbaseSmartWallet;
const compiled=compile(Object.fromEntries(['../contracts/MandateValidator.sol','./fixtures/MockUSDC.sol'].map(p=>[p,{content:fs.readFileSync(new URL(p,import.meta.url),'utf8')}] )));
const validatorContract=compiled.MandateValidator,tokenContract=compiled.MockUSDC;
const wallet='0x1000000000000000000000000000000000000000',token='0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const id='0x'+'01'.repeat(32),nonce=n=>'0x'+n.toString(16).padStart(64,'0');
const signature=wrapValidatorSignature(1,'0x');
async function setup(time=1000){
 const h=await evm(),[human,agent,seller,attacker]=h.users;
 h.time=time;
 await h.etch(wallet,walletContract);await h.etch(token,tokenContract);
 assert.ok((await h.call(human,wallet,walletContract,'initialize',[[pad(human.hex)]])).ok);
 const validator=await h.deploy(human,validatorContract,[wallet]);
 assert.ok((await h.call(human,wallet,walletContract,'addOwnerAddress',[validator])).ok);
 const execute=(fn,args)=>h.call(human,wallet,walletContract,'execute',[validator,0n,encodeFunctionData({abi:validatorContract.abi,functionName:fn,args})]);
 assert.ok((await execute('grant',[id,agent.hex,seller.hex,2000n,1000n,BigInt(time+300),id])).ok);
 await h.call(human,token,tokenContract,'mint',[wallet,10000n]);
 const auth=(n=1,changes={})=>({from:wallet,to:seller.hex,value:1000n,validAfter:BigInt(time-100),validBefore:BigInt(time+250),nonce:nonce(n),...changes});
 const reserve=(a,user=agent)=>h.call(user,validator,validatorContract,'reserve',[id,a]);
 const sign=async a=>{
  const digest=hashTypedData({domain:{name:'USDC',version:'2',chainId:84532,verifyingContract:token},types:authorizationTypes,primaryType:'TransferWithAuthorization',message:a});
  const replay=await h.call(agent,wallet,walletContract,'replaySafeHash',[digest]);
  return wrapValidatorSignature(1,await privateKeyToAccount(bytesToHex(agent.pk)).sign({hash:replay.value}));
 };
 const pay=async(a,sig)=>h.call(seller,token,tokenContract,'transferWithAuthorization',[a.from,a.to,a.value,a.validAfter,a.validBefore,a.nonce,sig??await sign(a)]);
 return {h,human,agent,seller,attacker,validator,execute,auth,reserve,pay,sign};
}
test('actual Coinbase wallet + validator + EIP-3009 token: one authorized payment, no replay',async()=>{
 const {h,seller,auth,reserve,pay}=await setup();const a=auth();
 assert.equal((await pay(a)).ok,false,'cannot pay before reservation');
 assert.equal((await reserve(a)).ok,true);
 assert.equal((await pay(a,signature)).ok,false,'reservation alone cannot settle');
 assert.equal((await pay(a)).ok,true);
 assert.equal((await pay(a)).ok,false,'token nonce prevents double settlement');
 assert.equal((await h.call(seller,token,tokenContract,'balanceOf',[seller.hex])).value,1000n);
});
test('onchain caps cannot be bypassed by fresh request ids or local state reset',async()=>{
 const {reserve,auth}=await setup();
 assert.equal((await reserve(auth(1))).ok,true);
 assert.equal((await reserve(auth(2))).ok,true);
 assert.equal((await reserve(auth(3))).ok,false);
});
test('recipient, from, amount, nonce, time and agent restrictions enforced by EVM',async()=>{
 const {reserve,auth,attacker}=await setup();
 for(const patch of [{to:attacker.hex},{from:attacker.hex},{value:1001n},{value:0n},{validBefore:1400n},{validBefore:1000n},{validAfter:1000n}])assert.equal((await reserve(auth(1,patch))).ok,false,JSON.stringify(patch,(_,v)=>typeof v==='bigint'?String(v):v));
 assert.equal((await reserve(auth(),attacker)).ok,false);
 assert.equal((await reserve(auth())).ok,true);
 assert.equal((await reserve(auth())).ok,false);
});
test('agent cannot grant new authority or call arbitrary wallet execute',async()=>{
 const {h,agent,validator,auth}=await setup();
 assert.equal((await h.call(agent,validator,validatorContract,'grant',[nonce(2),agent.hex,auth().to,2000n,1000n,1300n,id])).ok,false);
 assert.equal((await h.call(agent,wallet,walletContract,'execute',[agent.hex,0n,'0x'])).ok,false);
 const digest=hashTypedData({domain:{name:'USDC',version:'2',chainId:84532,verifyingContract:token},types:authorizationTypes,primaryType:'TransferWithAuthorization',message:auth()});
 assert.equal((await h.call(agent,wallet,walletContract,'isValidSignature',[digest,signature])).value,'0xffffffff');
});
test('revocation invalidates already reserved but unsettled payments',async()=>{
 const {reserve,auth,pay,execute}=await setup();const a=auth();await reserve(a);
 assert.ok((await execute('revoke',[id])).ok);
 assert.equal((await pay(a)).ok,false);
 assert.equal((await reserve(auth(2))).ok,false);
});
test('expiry invalidates pending signature and tampering cannot reuse reservation',async()=>{
 const {h,reserve,auth,pay,attacker}=await setup();await reserve(auth());
 assert.equal((await pay(auth(1,{to:attacker.hex}))).ok,false);
 assert.equal((await pay(auth(1,{value:999n}))).ok,false);
 h.time=1300;assert.equal((await pay(auth())).ok,false);
});
test('real x402 SDK payload settles through actual Coinbase EIP-1271 wallet',async()=>{
 const {auth,reserve,pay,sign}=await setup(Math.floor(Date.now()/1000));
 const signer={address:wallet,async signTypedData(td){
   assert.equal((await reserve(td.message)).ok,true);
   return sign(td.message);
 }};
 const client=new x402Client().register('eip155:84532',new ExactEvmScheme(signer));
 const payload=await client.createPaymentPayload({x402Version:2,resource:{url:'https://seller.test'},accepts:[{scheme:'exact',network:'eip155:84532',asset:token,amount:'1000',payTo:auth().to,maxTimeoutSeconds:60,extra:{name:'USDC',version:'2'}}]});
 assert.equal((await pay(payload.payload.authorization,payload.payload.signature)).ok,true);
});
