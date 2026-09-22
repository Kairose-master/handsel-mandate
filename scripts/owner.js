// Human-only administration. Never put OWNER_PRIVATE_KEY in agent config.
import fs from 'node:fs';
import {createPublicClient,createWalletClient,http,encodeFunctionData,pad} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {baseSepolia} from 'viem/chains';
import {walletAbi,validatorAbi,verifyValidatorCode} from '../runtime/session.js';
import {assertWorkflowBinding,compileMandateWorkflow} from '../runtime/blockflow.js';
import artifact from '../runtime/validator-artifact.json' with {type:'json'};
const configFile=new URL('../runtime/config.local.json',import.meta.url);
const stateFile=new URL('../runtime/state.local.json',import.meta.url);
const lock=new URL('../runtime/state.lock',import.meta.url);
const config=JSON.parse(fs.readFileSync(configFile,'utf8')),s=config.session;
const [cmd,expected]=process.argv.slice(2);
if(!['install','review','grant','revoke'].includes(cmd))throw Error('Usage: node scripts/owner.js install | review | grant <binding> | revoke <binding>');
if(config.network!=='eip155:84532'||!s||new URL(s.rpcUrl).protocol!=='https:')throw Error('Base Sepolia session config required');
fs.mkdirSync(lock);
try{
  const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{};
  const m=state.mandate;
  if(cmd==='review'){
    assertWorkflowBinding(m);
    console.log(JSON.stringify({wallet:m.aaAddress,validator:m.validator,agent:m.agent,recipient:m.payTo,endpoint:m.endpoint,totalMicroUSDC:m.total,perCallMicroUSDC:m.perCall,expiresAt:new Date(m.expiresAt).toISOString(),binding:m.workflow.binding},null,2));
  }else{
    const owner=privateKeyToAccount(process.env.OWNER_PRIVATE_KEY);
    const client=createPublicClient({chain:baseSepolia,transport:http(s.rpcUrl)});
    const writer=createWalletClient({account:owner,chain:baseSepolia,transport:http(s.rpcUrl)});
    if(await client.getChainId()!==84532)throw Error('RPC chain mismatch');
    const confirmed=async hash=>{console.log('Transaction:',hash);const r=await client.waitForTransactionReceipt({hash,timeout:45000});if(r.status!=='success')throw Error('Transaction reverted');return r;};
    const execute=async(to,data)=>{
      const {request}=await client.simulateContract({account:owner,address:s.wallet,abi:walletAbi,functionName:'execute',args:[to,0n,data]});
      return confirmed(await writer.writeContract(request));
    };
    if(cmd==='install'){
      if(!s.validator){
        const r=await confirmed(await writer.deployContract({abi:artifact.abi,bytecode:artifact.bytecode,args:[s.wallet]}));
        s.validator=r.contractAddress;
        fs.writeFileSync(configFile,JSON.stringify(config,null,2)+'\n',{mode:0o600});
      }
      await verifyValidatorCode(client,s.validator);
      const bound=await client.readContract({address:s.validator,abi:validatorAbi,functionName:'wallet'});
      if(bound.toLowerCase()!==s.wallet.toLowerCase())throw Error('Validator wallet mismatch');
      const next=await client.readContract({address:s.wallet,abi:walletAbi,functionName:'nextOwnerIndex'});
      let index;
      for(let i=0n;i<next;i++){
        const bytes=await client.readContract({address:s.wallet,abi:walletAbi,functionName:'ownerAtIndex',args:[i]});
        if(bytes.toLowerCase()===pad(s.validator).toLowerCase()){index=i;break;}
      }
      if(index===undefined){index=next;await execute(s.wallet,encodeFunctionData({abi:walletAbi,functionName:'addOwnerAddress',args:[s.validator]}));}
      s.ownerIndex=index.toString();fs.writeFileSync(configFile,JSON.stringify(config,null,2)+'\n',{mode:0o600});
      console.log('Installed validator:',s.validator,'owner index:',s.ownerIndex);
    }else{
      assertWorkflowBinding(m);
      if(expected!==m.workflow.binding)throw Error('Run review, then pass the exact reviewed binding');
      if(m.aaAddress.toLowerCase()!==s.wallet.toLowerCase()||m.validator.toLowerCase()!==s.validator.toLowerCase())throw Error('Configuration changed');
      if(cmd==='grant'){
        await verifyValidatorCode(client,s.validator);
        if(m.revoked||Date.now()>=m.expiresAt)throw Error('Mandate inactive');
        if(compileMandateWorkflow(config,m).binding!==expected)throw Error('Recompiled workflow changed');
        await execute(s.validator,encodeFunctionData({abi:validatorAbi,functionName:'grant',args:['0x'+expected,m.agent,m.payTo,BigInt(m.total),BigInt(m.perCall),BigInt(m.expiresAt/1000),'0x'+expected]}));
        m.approval='owner-granted';
      }else{
        await execute(s.validator,encodeFunctionData({abi:validatorAbi,functionName:'revoke',args:['0x'+expected]}));m.revoked=true;
      }
      fs.writeFileSync(stateFile,JSON.stringify(state),{mode:0o600});
    }
  }
}finally{fs.rmdirSync(lock);}
