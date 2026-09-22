import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const BLOCKFLOW_COMMIT='a43efa3788115a16e12f0ebea22416ed61de053d';
const here=path.dirname(fileURLToPath(import.meta.url));
const workflowFile=path.resolve(here,'../blockflow/mandate-payment.bpmn');
const sha=value=>createHash('sha256').update(value).digest('hex');

function canonical(value){
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function workflowPolicy(mandate){
  return {id:mandate.id,network:mandate.network??'eip155:84532',endpoint:mandate.endpoint,payTo:mandate.payTo.toLowerCase(),asset:mandate.asset,total:mandate.total,perCall:mandate.perCall,expiresAt:mandate.expiresAt,aaAddress:mandate.aaAddress.toLowerCase(),...(mandate.validator?{validator:mandate.validator.toLowerCase(),agent:mandate.agent.toLowerCase()}: {})};
}

export function assertWorkflowBinding(mandate){
  const w=mandate?.workflow;
  if(!w||w.compilerCommit!==BLOCKFLOW_COMMIT)throw Error('Missing or untrusted BlockFlow workflow');
  const binding=sha(canonical({policy:workflowPolicy(mandate),compilerCommit:w.compilerCommit,bpmnSha256:w.bpmnSha256,irSha256:w.irSha256,soliditySha256:w.soliditySha256}));
  if(binding!==w.binding)throw Error('Mandate no longer matches its BlockFlow artifact');
  return true;
}

export function compileMandateWorkflow(config,mandate){
  const root=path.resolve(config.blockflowRoot??'');
  if(!config.blockflowRoot||!fs.existsSync(path.join(root,'package.json')))throw Error('Configure blockflowRoot to a checked-out BlockFlow repository');
  const commit=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',timeout:5000}).trim();
  if(commit!==BLOCKFLOW_COMMIT)throw Error(`BlockFlow commit mismatch: expected ${BLOCKFLOW_COMMIT}, got ${commit}`);
  if(execFileSync('git',['-C',root,'status','--porcelain','--untracked-files=normal'],{encoding:'utf8',timeout:5000}).trim())throw Error('BlockFlow checkout must be clean');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'handsel-blockflow-'));
  try{
    const irFile=path.join(temp,'mandate.ir.json'),solFile=path.join(temp,'Mandate.sol'),testFile=path.join(temp,'Mandate.t.sol');
    const cli=path.join(root,'packages/bpmn/src/cli.ts');
    if(!fs.existsSync(path.join(root,'node_modules/tsx')))throw Error('BlockFlow dependencies missing; run pnpm install in blockflowRoot');
    execFileSync(process.execPath,['--import','tsx',cli,'compile',workflowFile,'--ir',irFile,'--sol',solFile,'--test',testFile],{cwd:root,encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
    const bpmn=fs.readFileSync(workflowFile),ir=fs.readFileSync(irFile),sol=fs.readFileSync(solFile),foundry=fs.readFileSync(testFile);
    const workflow={compiler:'BlockFlow',compilerCommit:commit,processId:JSON.parse(ir).process.id,bpmnSha256:sha(bpmn),irSha256:sha(ir),soliditySha256:sha(sol),foundryTestSha256:sha(foundry)};
    workflow.binding=sha(canonical({policy:workflowPolicy(mandate),compilerCommit:commit,bpmnSha256:workflow.bpmnSha256,irSha256:workflow.irSha256,soliditySha256:workflow.soliditySha256}));
    return workflow;
  }catch(error){
    const detail=error.stderr?.toString().trim()||error.stdout?.toString().trim()||error.message;
    throw Error(`BlockFlow compilation failed${detail?`: ${detail}`:''}`);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
