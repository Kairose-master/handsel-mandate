import {parseAbi,decodeEventLog,createPublicClient,http} from 'viem';
import {baseSepolia} from 'viem/chains';
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)','event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)']);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export async function verifySettlement(config,receipt,{client}={}){
  const s=receipt.settlement,a=receipt.authorization;
  if(!a||s?.network!=='eip155:84532'||s.success!==true||!/^0x[0-9a-fA-F]{64}$/.test(s.transaction??''))throw Error('Missing settlement transaction or authorization');
  client??=createPublicClient({chain:baseSepolia,transport:http(config.session?.rpcUrl??config.aa?.rpcUrl,{timeout:15000,retryCount:0})});
  if(await client.getChainId()!==84532)throw Error('Settlement RPC chain mismatch');
  const tx=await client.getTransactionReceipt({hash:s.transaction});
  if(tx.status!=='success')throw Error('Settlement transaction reverted');
  const block=await client.getBlock({blockNumber:tx.blockNumber});
  if(block.hash!==tx.blockHash||block.timestamp<=BigInt(a.validAfter)||block.timestamp>=BigInt(a.validBefore))throw Error('Settlement block or time mismatch');
  if(await client.getBlockNumber()<tx.blockNumber+1n)throw Error('Awaiting two confirmations');
  const events=tx.logs.filter(l=>same(l.address,receipt.asset)).flatMap(l=>{try{return [decodeEventLog({abi,data:l.data,topics:l.topics})];}catch{return [];}});
  const transfer=events.some(e=>e.eventName==='Transfer'&&same(e.args.from,a.from)&&same(e.args.to,a.to)&&e.args.value===BigInt(a.value));
  const used=events.some(e=>e.eventName==='AuthorizationUsed'&&same(e.args.authorizer,a.from)&&same(e.args.nonce,a.nonce));
  if(!transfer||!used)throw Error('USDC transfer and authorization nonce not proven');
  return {transaction:s.transaction,blockNumber:tx.blockNumber.toString(),blockHash:tx.blockHash,confirmations:2};
}
