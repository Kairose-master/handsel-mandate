export const catalog = Object.freeze([
  {id:'search',name:'Research Search',price:30000,category:'search'},
  {id:'extract',name:'Document Extract',price:50000,category:'extract'},
  {id:'premium',name:'Premium Analysis',price:300000,category:'analysis'}
]);
export function units(value) {
  if (!/^\d{1,6}(\.\d{1,6})?$/.test(String(value))) throw Error('금액은 소수점 6자리 이하의 양수여야 합니다.');
  const [a,b=''] = String(value).split('.');
  const n = Number(a)*1000000+Number(b.padEnd(6,'0'));
  if (!Number.isSafeInteger(n) || n<=0) throw Error('금액을 확인하세요.');
  return n;
}
export function authorize(m, service, now=Date.now()) {
  if (!m || m.revoked) throw Error('활성 위임장이 없습니다.');
  if (!Number.isFinite(m.expiresAt) || now>=m.expiresAt) throw Error('위임장이 만료됐습니다.');
  if (!m.services.includes(service.id)) throw Error('허용되지 않은 서비스입니다.');
  if (service.price>m.perCall) throw Error('건당 한도를 초과했습니다.');
  if (m.spent+service.price>m.total) throw Error('총예산을 초과했습니다.');
}
export function createMandate(input, now=Date.now()) {
  const total=units(input.total), perCall=units(input.perCall);
  if (perCall>total) throw Error('건당 한도는 총예산 이하여야 합니다.');
  if (typeof input.goal!=='string' || !input.goal.trim() || input.goal.length>2000) throw Error('목표를 1~2000자로 작성하세요.');
  const minutes=Number(input.minutes);
  if (!Number.isInteger(minutes)||minutes<1||minutes>1440) throw Error('유효기간은 1~1440분입니다.');
  if (!Array.isArray(input.services)||!input.services.length||input.services.some(id=>!catalog.some(s=>s.id===id))) throw Error('서비스를 선택하세요.');
  return {id:crypto.randomUUID(),version:'0.1',mode:'simulation',goal:input.goal.trim(),total,perCall,spent:0,services:[...new Set(input.services)],expiresAt:now+minutes*60000,revoked:false};
}
export function purchase(state, request, now=Date.now()) {
  if (typeof request.requestId!=='string'||!/^[-\w]{1,100}$/.test(request.requestId)) throw Error('requestId가 필요합니다.');
  if (!state.mandate || request.mandateId!==state.mandate.id) throw Error('위임장 ID가 일치하지 않습니다.');
  const prior=state.receipts.find(r=>r.requestId===request.requestId && r.mandateId===request.mandateId);
  if (prior) { if (prior.serviceId!==request.serviceId) throw Error('requestId 재사용 충돌'); return prior; }
  const service=catalog.find(s=>s.id===request.serviceId);
  if (!service) throw Error('알 수 없는 서비스');
  authorize(state.mandate,service,now);
  const receipt={requestId:request.requestId,mandateId:request.mandateId,serviceId:service.id,amount:service.price,at:now,mode:'simulation',result:`[MOCK] ${service.name}: 데모 응답입니다. 실제 검색이나 결제는 수행하지 않았습니다.`};
  state.mandate.spent+=service.price;
  state.receipts.push(receipt);
  return receipt;
}
