import fs from 'node:fs';
import solc from 'solc';
const source=fs.readFileSync(new URL('../contracts/MandateValidator.sol',import.meta.url),'utf8');
const result=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'MandateValidator.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}})));
if(result.errors?.some(e=>e.severity==='error'))throw Error(result.errors.map(e=>e.formattedMessage).join('\n'));
for (const [name, file] of [['MandateValidator','validator-artifact.json'],['MandateValidatorMainnet','validator-mainnet-artifact.json']]) {
 const c=result.contracts['MandateValidator.sol'][name];
 fs.writeFileSync(new URL(`../runtime/${file}`,import.meta.url),JSON.stringify({solc:solc.version(),contract:name,abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,runtimeBytecode:'0x'+c.evm.deployedBytecode.object,immutableReferences:c.evm.deployedBytecode.immutableReferences},null,2)+'\n');
}
