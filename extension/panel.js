const $=s=>document.querySelector(s);
async function send(type,data={}){const r=await chrome.runtime.sendMessage({type,...data});if(!r.ok)throw Error(r.error);return r.result;}
const money=n=>(n/1000000).toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
async function render(){const s=await send('status'),m=s.mandate;$('#balance').textContent=m?`${m.revoked?'회수됨':Date.now()>=m.expiresAt?'만료됨':'활성'} · ${money(m.spent)} / ${money(m.total)} 모의 USDC`:'위임장 없음';$('#agentId').value=s.agentId;$('#receipts').replaceChildren();for(const r of [...s.receipts].reverse().slice(0,30)){const li=document.createElement('li');li.textContent=`${r.serviceId} · ${money(r.amount)} 모의 USDC — ${r.result}`;$('#receipts').append(li);}}
async function act(fn){try{await fn();$('#message').textContent='완료';}catch(e){$('#message').textContent=e.message;}finally{await render();}}
$('#mandate').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);act(async()=>{const input=Object.fromEntries(f);input.services=f.getAll('services');if(confirm(`모의 총예산 ${input.total} USDC / 건당 ${input.perCall} USDC / ${input.minutes}분. 활성화할까요?`))await send('create',{input});});});
$('#revoke').onclick=()=>act(()=>send('revoke'));
$('#pair').onclick=()=>act(()=>send('pair',{agentId:$('#agentId').value.trim()}));
$('#run').onclick=()=>act(async()=>{const {mandate}=await send('status');for(const serviceId of ['search','extract'])await send('purchase',{mandateId:mandate?.id,serviceId,requestId:crypto.randomUUID()});});
$('#export').onclick=()=>act(async()=>{const {mandate}=await send('status');if(!mandate)throw Error('위임장을 먼저 작성하세요.');const url=URL.createObjectURL(new Blob([JSON.stringify(mandate,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mandate.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
chrome.storage.onChanged.addListener(()=>render());
setInterval(render,10000);
render().catch(e=>$('#message').textContent=e.message);
