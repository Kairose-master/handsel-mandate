import {catalog,createMandate,purchase} from './policy.js';
chrome.runtime.onInstalled.addListener(()=>{
  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(console.error);
  chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(console.error);
});
let queue=Promise.resolve();
async function dispatch(msg,sender,external=false) {
  if (!msg || typeof msg.type!=='string') throw Error('Invalid message');
  const {state={mandate:null,receipts:[],agentId:''}}=await chrome.storage.local.get('state');
  if (external && (!state.agentId || sender.id!==state.agentId)) throw Error('Agent extension is not paired');
  if (external && !['status','catalog','purchase'].includes(msg.type)) throw Error('Human-only operation');
  let result;
  switch(msg.type) {
    case 'status': return state;
    case 'catalog': return catalog;
    case 'pair':
      if (msg.agentId!==''&&!/^[a-p]{32}$/.test(msg.agentId)) throw Error('Chrome extension ID 형식이 아닙니다.');
      state.agentId=msg.agentId;
      if (state.mandate) state.mandate.revoked=true;
      result=state; break;
    case 'create': state.mandate=createMandate(msg.input); result=state.mandate; break;
    case 'revoke': if(state.mandate) state.mandate.revoked=true; result=state; break;
    case 'purchase': result=purchase(state,msg); break;
    default: throw Error('Unknown operation');
  }
  await chrome.storage.local.set({state});
  return result;
}
function handle(msg,sender,reply,external) {
  const job=queue.then(()=>dispatch(msg,sender,external));
  queue=job.catch(()=>{});
  job.then(result=>reply({ok:true,result}),error=>reply({ok:false,error:error.message}));
  return true;
}
chrome.runtime.onMessage.addListener((m,s,r)=>{
  if (s.id!==chrome.runtime.id || !s.url?.startsWith(chrome.runtime.getURL(''))) {r({ok:false,error:'Untrusted sender'});return false;}
  return handle(m,s,r,false);
});
chrome.runtime.onMessageExternal.addListener((m,s,r)=>handle(m,s,r,true));
