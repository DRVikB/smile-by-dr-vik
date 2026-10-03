/** Explicit paid-provider test command, isolated from qa:ios-simulator. */
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { command, simulator, uiTest } from './qa-ios-simulator.mjs';
const evidence=resolve('output/simulator-reliability-2026-10-03');
async function main(){
  await fs.mkdir(evidence,{recursive:true});
  try{const r=await fetch('http://127.0.0.1:3100/config');if(r.ok)throw Error('Port 3100 has an existing QA run; stop it before starting another paid batch');}catch(e){if(e.message?.includes('existing QA'))throw e;}
  const handle=await fs.open(resolve(evidence,'live-simulator-server.log'),'w');
  const started=Date.now();
  const server=spawn(process.execPath,['--import','tsx','scripts/qa-ios-live-generation.mts',...process.argv.slice(2)],{stdio:['ignore',handle.fd,handle.fd]});
  try{
    let ready=false;for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:3100/config')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
    if(!ready)throw Error('Live QA server did not start; see live-simulator-server.log');
    const device=await simulator('iPhone');
    await command('xcrun',['simctl','openurl',device,'http://127.0.0.1:3100/'],resolve(evidence,'live-open.log'));
    const importsOnly=process.argv.includes('--imports-only');
    await uiTest(device,importsOnly?'PhotoImportTests':'LiveGenerationTests',importsOnly?'iphone-imports':'iphone-live');
    if(importsOnly){const rows=JSON.parse(await fs.readFile(resolve(evidence,'test-folder-imports.json'),'utf8'));if(rows.length!==6||rows.some(r=>!r.decoded||r.providerRequests!==0))throw Error('Local import checks failed');console.log('LOCAL PHOTO IMPORTS: PASS; zero provider requests');return;}
    const paths=await fs.readdir(resolve(evidence,'live')),records=[];
    for(const id of paths){const file=resolve(evidence,'live',id,'provider.json');if((await fs.stat(file)).mtimeMs>=started){const provider=JSON.parse(await fs.readFile(file,'utf8'));let processing;try{processing=JSON.parse(await fs.readFile(resolve(evidence,'live',id,'processing.json'),'utf8'));}catch{}records.push({requestId:id,httpStatus:provider.httpStatus,providerReturnedImage:provider.provider?.imagePartExisted??false,delivered:processing?.delivered??false,stage:processing?.stage??'not_completed',allowanceBefore:provider.allowanceBefore?.remaining,allowanceAfter:provider.allowanceAfter?.remaining});}}
    await fs.writeFile(resolve(evidence,'live-simulator-summary.json'),JSON.stringify(records,null,2),{mode:0o600});
    console.log(JSON.stringify(records,null,2));if(!records.length||records.some(r=>!r.delivered))throw Error('Not every live result completed');
    console.log('GENERATION DELIVERY: PASS');
  }finally{server.kill('SIGTERM');await handle.close();}
}
main().catch(e=>{console.error('QA: FAIL — '+e.message);process.exitCode=1;});
