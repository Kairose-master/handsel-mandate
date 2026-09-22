import test from 'node:test';
import assert from 'node:assert/strict';
import {checkX402Risk,dambiCheckRequest,decodeX402Action,enforceDambiVerdict,evaluateX402Action} from '../runtime/dambi.js';

const mandate={network:'eip155:84532',asset:'0x036cbd53842c5426634e7929541ec2318f3dcf7e',aaAddress:'0x1111111111111111111111111111111111111111',payTo:'0x2222222222222222222222222222222222222222',perCall:1000,expiresAt:2_000_000_000_000};
const typedData=()=>({domain:{name:'USDC',version:'2',chainId:84532,verifyingContract:mandate.asset},primaryType:'TransferWithAuthorization',message:{from:mandate.aaAddress,to:mandate.payTo,value:500n,validAfter:1_999_999_800n,validBefore:2_000_000_000n,nonce:'0x'+'12'.repeat(32)}});

test('x402 typed data becomes a Dambi core request and EIP-3009 action',()=>{
  const td=typedData(),request=dambiCheckRequest(td),action=decodeX402Action(td);
  assert.equal(request.kind,'typed_signature');assert.equal(request.chainId,mandate.network);
  assert.equal(action.body.token.action,'eip3009_transfer_authorization');
  assert.equal(action.body.token.eip3009_transfer_authorization.amount,'500');
});
test('strict x402 evaluator authorizes only the exact mandate',async()=>{
  const td=typedData();assert.equal((await checkX402Risk(td,mandate)).verdict.decision,'allow');
  const wrong=decodeX402Action(td);wrong.body.token.eip3009_transfer_authorization.recipient=mandate.aaAddress;
  assert.equal((await evaluateX402Action({action:wrong,mandate})).decision,'deny');
});
test('agent gate rejects warn, deny, advisory, fail-closed and malformed verdicts',()=>{
  const base={decision:'allow',source:'evaluated',enforcement:'enforcing',reasons:[],facts:[]};assert.equal(enforceDambiVerdict(base),base);
  for(const patch of [{decision:'warn'},{decision:'deny'},{source:'fail_closed'},{enforcement:'advisory'}])assert.throws(()=>enforceDambiVerdict({...base,...patch}));
  assert.throws(()=>enforceDambiVerdict({decision:'allow'}));
});
test('external evaluator cannot silently authorize unknown output',async()=>{
  await assert.rejects(()=>checkX402Risk(typedData(),mandate,async()=>({decision:'warn',source:'evaluated',enforcement:'enforcing',reasons:[],facts:[]})),/blocked/);
});
