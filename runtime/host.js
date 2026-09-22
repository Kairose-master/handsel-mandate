#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {privateKeyToAccount} from 'viem/accounts';
import {buy,liveMandate} from './buyer.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const configPath=path.join(root,'config.local.json'),statePath=path.join(root,'state.local.json'),lock=path.join(root,'state.lock');
function save(s){const temp=statePath+'.tmp';const fd=fs.openSync(temp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(s));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,statePath);}
async function dispatch(msg){
  const c=JSON.parse(fs.readFileSync(configPath,'utf8'));
  if(c.network!=='eip155:84532')throw Error('Mainnet is disabled');
  const u=new URL(c.endpoint);
  if(u.protocol!=='https:'||u.username||u.password||u.hash)throw Error('Configure an HTTPS endpoint');
  if(!/^0x[0-9a-fA-F]{40}$/.test(c.payTo))throw Error('Invalid recipient');
  const account=privateKeyToAccount(c.privateKey);
  fs.mkdirSync(lock); // Cross-process exclusion; fail closed after a crashed host.
  try {
    const s=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{mandate:null,receipts:[]};
    if(msg.type==='live.status')return {...s,address:account.address,endpoint:c.endpoint,payTo:c.payTo};
    if(msg.type==='live.create'){
      if(s.mandate && !s.mandate.revoked && Date.now()<s.mandate.expiresAt)throw Error('Revoke the previous mandate first');
      s.mandate=liveMandate(msg.input,c);save(s);return s.mandate;
    }
    if(msg.type==='live.revoke'){if(s.mandate)s.mandate.revoked=true;save(s);return s;}
    if(msg.type==='live.purchase')return await buy(c,s,msg,save);
    throw Error('Unknown operation');
  }finally{fs.rmdirSync(lock);}
}
let input=Buffer.alloc(0),handled=false;
process.stdin.on('data',async chunk=>{
  if(handled)return;input=Buffer.concat([input,chunk]);
  if(input.length<4)return;const size=input.readUInt32LE(0);
  if(size>65536){process.exitCode=1;process.stdin.destroy();return;}
  if(input.length<size+4)return;handled=true;process.stdin.pause();
  let result;try{result={ok:true,result:await dispatch(JSON.parse(input.subarray(4,4+size).toString()))};}catch(e){result={ok:false,error:e.code==='EEXIST'?'Host locked. Stop other hosts; inspect pending payments before removing runtime/state.lock.':e.message};}
  const body=Buffer.from(JSON.stringify(result));const h=Buffer.alloc(4);h.writeUInt32LE(body.length);process.stdout.write(Buffer.concat([h,body]),()=>process.exit(0));
});
