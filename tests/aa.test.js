import test from 'node:test';
import assert from 'node:assert/strict';
import {custom} from 'viem';
import {generatePrivateKey} from 'viem/accounts';
import {createAASigner} from '../runtime/aa.js';

test('Coinbase ERC-4337 account signs x402-style typed data as EIP-1271 payload',async()=>{
  const address='0x1111111111111111111111111111111111111111';
  const config={aa:{type:'coinbase-smart-account',version:'1.1',rpcUrl:'https://rpc.example',ownerPrivateKey:generatePrivateKey()}};
  const transport=custom({request:async({method})=>{
    if(method==='eth_call')return `0x${'0'.repeat(24)}${address.slice(2)}`;
    if(method==='eth_getCode')return '0x';
    throw Error(`unexpected RPC ${method}`);
  }});
  const {account}=await createAASigner(config,{requireDeployed:false,transport});
  assert.equal(account.address,address);
  const signature=await account.signTypedData({
    domain:{name:'USDC',version:'2',chainId:84532,verifyingContract:'0x036cbd53842c5426634e7929541ec2318f3dcf7e'},
    types:{TransferWithAuthorization:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}]},
    primaryType:'TransferWithAuthorization',
    message:{from:address,to:'0x2222222222222222222222222222222222222222',value:1n,validAfter:0n,validBefore:1n,nonce:'0x0000000000000000000000000000000000000000000000000000000000000001'}
  });
  assert.ok(signature.startsWith('0x'));
  assert.ok(signature.length>132,'smart-account signature must be wrapped for EIP-1271');
});
