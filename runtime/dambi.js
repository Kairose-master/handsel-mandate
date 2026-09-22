const CHAIN='eip155:84532';

function address(value,label){
  if(!/^0x[0-9a-fA-F]{40}$/.test(value??''))throw Error(`Invalid ${label}`);
  return value.toLowerCase();
}
function uint(value,label){
  const text=typeof value==='bigint'?value.toString():String(value);
  if(!/^(0|[1-9]\d*)$/.test(text))throw Error(`Invalid ${label}`);
  return text;
}

// Browser-free request contract published by @dambi/core 0.0.1.
export function dambiCheckRequest(typedData){
  return {kind:'typed_signature',chainId:CHAIN,from:address(typedData.message?.from,'payment sender'),typedData};
}

export function decodeX402Action(typedData){
  const m=typedData.message??{};
  if(!/^0x[0-9a-fA-F]{64}$/.test(m.nonce??''))throw Error('Invalid payment nonce');
  return {
    meta:{submission:'offchain_sig',chainId:CHAIN,signer:address(m.from,'payment sender')},
    body:{domain:'token',token:{action:'eip3009_transfer_authorization',eip3009_transfer_authorization:{
      token:{key:{standard:'erc20',chain:CHAIN,address:address(typedData.domain?.verifyingContract,'payment token')}},
      owner:address(m.from,'payment sender'),recipient:address(m.to,'payment recipient'),amount:uint(m.value,'payment amount'),
      valid_after:uint(m.validAfter,'validAfter'),valid_before:uint(m.validBefore,'validBefore'),nonce:m.nonce.toLowerCase()
    }}}
  };
}

function matched(policyId,reason,source='evaluated'){
  return {decision:'deny',source,enforcement:'enforcing',reasons:[{policyId,reason,severity:'deny',origin:source==='evaluated'?'action':'engine_error'}],facts:[]};
}

// Executable baseline for the single action Handsel signs today. It is
// intentionally narrower than Cedar and is replaceable through the evaluator port.
export async function evaluateX402Action({action,mandate}){
  try{
    const a=action.body.token.eip3009_transfer_authorization;
    const expires=Math.floor(mandate.expiresAt/1000);
    if(action.body.domain!=='token'||action.body.token.action!=='eip3009_transfer_authorization')return matched('__handsel::unknown_action','Unknown signing action','fail_closed');
    if(a.token.key.chain!==mandate.network||a.token.key.address!==mandate.asset.toLowerCase())return matched('handsel-x402-token','Payment token or chain is outside the mandate');
    if(a.owner!==mandate.aaAddress.toLowerCase()||a.recipient!==mandate.payTo.toLowerCase())return matched('handsel-x402-parties','Payment sender or recipient is outside the mandate');
    const amount=BigInt(a.amount),validAfter=BigInt(a.valid_after),validBefore=BigInt(a.valid_before);
    if(amount<=0n||amount>BigInt(mandate.perCall))return matched('handsel-x402-per-call','Payment exceeds the per-call mandate cap');
    if(validBefore<=validAfter||validBefore>BigInt(expires)||validBefore-validAfter>300n)return matched('handsel-x402-window','Payment authorization time window is outside the mandate');
    return {decision:'allow',source:'evaluated',enforcement:'enforcing',reasons:[],facts:[]};
  }catch(e){return matched('__handsel::evaluation_error',e instanceof Error?e.message:String(e),'fail_closed');}
}

export function enforceDambiVerdict(verdict){
  if(!verdict||!['allow','warn','deny'].includes(verdict.decision)||!['evaluated','fail_closed'].includes(verdict.source)||!['advisory','enforcing'].includes(verdict.enforcement))throw Error('Invalid risk-engine verdict');
  if(verdict.enforcement!=='enforcing')throw Error('Advisory risk verdict cannot authorize an agent payment');
  if(verdict.source!=='evaluated')throw Error('Risk evaluation failed closed');
  if(verdict.decision!=='allow')throw Error(`Agent payment blocked by risk policy: ${verdict.reasons?.[0]?.reason??verdict.decision}`);
  return verdict;
}

export async function checkX402Risk(typedData,mandate,evaluator=evaluateX402Action){
  const request=dambiCheckRequest(typedData),action=decodeX402Action(typedData);
  const verdict=await evaluator({request,action,mandate});
  enforceDambiVerdict(verdict);
  return {request,action,verdict};
}
