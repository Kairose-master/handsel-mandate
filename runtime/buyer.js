import {x402Client} from '@x402/core/client';
import {decodePaymentRequiredHeader, encodePaymentSignatureHeader, decodePaymentResponseHeader} from '@x402/core/http';
import {ExactEvmScheme} from '@x402/evm/exact/client';
import {privateKeyToAccount} from 'viem/accounts';
import {units} from '../extension/policy.js';

export const NETWORK='eip155:84532';
export const ASSET='0x036cbd53842c5426634e7929541ec2318f3dcf7e';
export function validateQuote(required, config, mandate, now=Date.now()) {
  if (!mandate || mandate.revoked || now>=mandate.expiresAt) throw Error('Mandate inactive or expired');
  if(mandate.endpoint!==config.endpoint || mandate.payTo.toLowerCase()!==config.payTo.toLowerCase()) throw Error('Seller configuration changed; issue a new mandate');
  if(required.x402Version!==2 || required.resource?.url!==config.endpoint) throw Error('Unsupported version or resource');
  const q=required.accepts?.find(q=>q.scheme==='exact' && q.network===NETWORK && q.asset?.toLowerCase()===ASSET && q.payTo?.toLowerCase()===config.payTo.toLowerCase());
  if(!q || !/^[1-9]\d{0,12}$/.test(q.amount)) throw Error('No approved payment option');
  const amount=Number(q.amount);
  if(q.extra?.assetTransferMethod && q.extra.assetTransferMethod!=='eip3009') throw Error('Only EIP-3009 supported');
  if(q.extra?.name!=='USDC' || q.extra?.version!=='2') throw Error('Unexpected token domain');
  if(!Number.isInteger(q.maxTimeoutSeconds)||q.maxTimeoutSeconds<1||q.maxTimeoutSeconds>300) throw Error('Authorization timeout outside 1–300 seconds');
  if(now+q.maxTimeoutSeconds*1000>mandate.expiresAt) throw Error('Authorization would outlive mandate');
  if(amount>mandate.perCall || mandate.reserved+amount>mandate.total) throw Error('Budget exceeded');
  return q;
}
export function liveMandate(input,config,now=Date.now()) {
  const total=units(input.total),perCall=units(input.perCall),minutes=Number(input.minutes);
  if(total>1000000||perCall>total||!Number.isInteger(minutes)||minutes<1||minutes>60) throw Error('Testnet maximum: 1 USDC and 60 minutes');
  return {id:crypto.randomUUID(),mode:'base-sepolia',endpoint:config.endpoint,payTo:config.payTo,total,perCall,reserved:0,expiresAt:now+minutes*60000,revoked:false};
}
async function limitedText(response){
  const reader=response.body?.getReader();if(!reader)return '';
  let size=0;const chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>128000){await reader.cancel();throw Error('Response too large');}chunks.push(Buffer.from(value));}
  return Buffer.concat(chunks).toString('utf8');
}
export async function buy(config,state,request,save,{fetcher=fetch}={}) {
  if(!/^[\w-]{1,100}$/.test(request.requestId??'')) throw Error('Invalid request ID');
  const m=state.mandate;
  if(!m||request.mandateId!==m.id) throw Error('Stale mandate');
  const old=state.receipts.find(r=>r.requestId===request.requestId && r.mandateId===m.id);if(old)return old;
  if(m.revoked||Date.now()>=m.expiresAt)throw Error('Mandate inactive');
  const options={method:'GET',redirect:'error',signal:AbortSignal.timeout(20000)};
  const initial=await fetcher(config.endpoint,options);
  if(initial.status!==402){await initial.body?.cancel();throw Error('Expected HTTP 402; no payment signed');}
  const header=initial.headers.get('PAYMENT-REQUIRED');await initial.body?.cancel();
  if(!header||header.length>20000)throw Error('Missing or oversized PAYMENT-REQUIRED');
  const required=decodePaymentRequiredHeader(header);
  const q=validateQuote(required,config,m);
  const receipt={requestId:request.requestId,mandateId:m.id,amount:Number(q.amount),status:'reserved',at:Date.now(),network:NETWORK};
  m.reserved+=receipt.amount;state.receipts.push(receipt);await save(state);
  // Reservations remain consumed after errors: a signed authorization might settle later.
  try {
    const signer=privateKeyToAccount(config.privateKey);
    const client=new x402Client().register(NETWORK,new ExactEvmScheme(signer));
    const payment=await client.createPaymentPayload({...required,accepts:[q],extensions:undefined});
    const response=await fetcher(config.endpoint,{...options,signal:AbortSignal.timeout(20000),headers:{'PAYMENT-SIGNATURE':encodePaymentSignatureHeader(payment)}});
    receipt.httpStatus=response.status;
    const settlement=response.headers.get('PAYMENT-RESPONSE');
    if(settlement && settlement.length<20000) receipt.settlement=decodePaymentResponseHeader(settlement);
    receipt.result=await limitedText(response);
    receipt.status=response.ok && receipt.settlement?.success===true?'seller-reported-settled':'uncertain';
    // Seller receipt is not independently verified onchain.
  } catch(e) {receipt.status='uncertain';receipt.error=e.message;}
  await save(state);return receipt;
}
