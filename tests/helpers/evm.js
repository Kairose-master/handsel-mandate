import {createCustomCommon,Mainnet,Hardfork} from '@ethereumjs/common';
import {createLegacyTx} from '@ethereumjs/tx';
import {createAccount,createAddressFromPrivateKey,createAddressFromString,hexToBytes,bytesToHex} from '@ethereumjs/util';
import {createVM,runTx} from '@ethereumjs/vm';
import {createBlock} from '@ethereumjs/block';
import {encodeFunctionData,encodeDeployData,decodeFunctionResult} from 'viem';
import solc from 'solc';
export function compile(sources,compiler=solc){
 const out=JSON.parse(compiler.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}})));
 if(out.errors?.some(e=>e.severity==='error'))throw Error(out.errors.map(e=>e.formattedMessage).join('\n'));
 return Object.assign({},...Object.values(out.contracts));
}
export async function evm(){
 const common=createCustomCommon({...Mainnet,chainId:84532},{hardfork:Hardfork.Cancun}),vm=await createVM({common});
 const users=[];
 for(let i=1;i<=4;i++){
  const pk=hexToBytes('0x'+i.toString(16).padStart(64,'0')),address=createAddressFromPrivateKey(pk);
  users.push({pk,address,hex:address.toString(),nonce:0n});
  await vm.stateManager.putAccount(address,createAccount({balance:10n**21n}));
 }
 let height=0n;
 const h={vm,users,time:1000,
  async etch(address,c){await vm.stateManager.putAccount(createAddressFromString(address),createAccount({}));await vm.stateManager.putCode(createAddressFromString(address),hexToBytes('0x'+c.evm.deployedBytecode.object));},
  async send(user,to,data){
   const tx=createLegacyTx({nonce:user.nonce++,gasLimit:15_000_000n,gasPrice:10n,to:to?createAddressFromString(to):undefined,data:hexToBytes(data)},{common}).sign(user.pk);
   const block=createBlock({header:{number:++height,timestamp:BigInt(h.time),gasLimit:30_000_000n,baseFeePerGas:7n}},{common});
   const r=await runTx(vm,{tx,block});return {ok:!r.execResult.exceptionError,data:bytesToHex(r.execResult.returnValue),address:r.createdAddress?.toString(),logs:r.execResult.logs};
  },
  async deploy(user,c,args=[]){const r=await h.send(user,undefined,encodeDeployData({abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,args}));if(!r.ok)throw Error('Deployment failed '+r.data);return r.address;},
  async call(user,to,c,fn,args=[]){const r=await h.send(user,to,encodeFunctionData({abi:c.abi,functionName:fn,args}));if(r.ok)r.value=decodeFunctionResult({abi:c.abi,functionName:fn,data:r.data});return r;}
 };
 return h;
}
