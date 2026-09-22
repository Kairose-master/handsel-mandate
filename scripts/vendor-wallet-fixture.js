// Export only the dependency closure used by Solidity compilation, preserving upstream licenses.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import solc from 'solc-wallet';
const root=path.resolve(process.argv[2]);
const sources={};
const prefixes={'solady/':'lib/solady/src/','account-abstraction/':'lib/account-abstraction/contracts/','webauthn-sol/':'lib/webauthn-sol/src/','FreshCryptoLib/':'lib/webauthn-sol/lib/FreshCryptoLib/solidity/src/','p256-verifier/':'lib/p256-verifier/','openzeppelin-contracts/':'lib/openzeppelin-contracts/'};
function read(name){
 let file=name;
 for(const [prefix,dir] of Object.entries(prefixes))if(name.startsWith(prefix)){file=dir+name.slice(prefix.length);break;}
 const content=fs.readFileSync(path.join(root,file),'utf8');sources[name]={content};return {contents:content};
}
read('src/CoinbaseSmartWallet.sol');
const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{outputSelection:{'*':{'*':['abi']}}}}),{import:read}));
if(out.errors?.some(e=>e.severity==='error'))throw Error(out.errors.map(e=>e.formattedMessage).join('\n'));
const commit=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
fs.mkdirSync(new URL('../tests/fixtures/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../tests/fixtures/coinbase-sources.json',import.meta.url),JSON.stringify({repository:'https://github.com/coinbase/smart-wallet',commit,sources},null,2)+'\n');
console.log('Vendored',Object.keys(sources).length,'source files at',commit);
