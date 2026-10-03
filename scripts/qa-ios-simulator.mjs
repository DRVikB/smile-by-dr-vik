/** Deterministic native QA. Fixture code is injected only into a temporary simulator bundle. */
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = process.cwd(), evidence = resolve(root, 'output/simulator-reliability-2026-10-03');
const temporary = '/tmp/smilecompose-simulator-qa';
export async function command(program, args, logfile) {
  const handle = await fs.open(logfile, 'w');
  try { await new Promise((accept, reject) => { const child=spawn(program,args,{cwd:root,stdio:['ignore',handle.fd,handle.fd]}); child.on('error',reject); child.on('exit',code=>code===0?accept():reject(new Error(`${program} failed (${code}); see ${logfile}`))); }); }
  finally { await handle.close(); }
}
export async function simulator(kind) {
  const inventory=await new Promise((accept,reject)=>{let text='';const child=spawn('xcrun',['simctl','list','devices','available','-j']);child.stdout.on('data',b=>text+=b);child.on('exit',code=>code===0?accept(JSON.parse(text)):reject(Error('simctl failed')));});
  const name=`SmileCompose QA ${kind}`;
  const existing=Object.values(inventory.devices).flat().find(d=>d.name===name);
  if(!existing) throw Error(`Create the dedicated ${name} simulator in Xcode before QA`);
  if(existing.state!=='Booted')await command('xcrun',['simctl','boot',existing.udid],resolve(evidence,`boot-${kind}.log`));
  await command('xcrun',['simctl','bootstatus',existing.udid,'-b'],resolve(evidence,`bootstatus-${kind}.log`));
  return existing.udid;
}
export async function uiTest(device, suite, label) {
  const result=resolve(evidence,`${label}-${Date.now()}.xcresult`);
  await command('xcodebuild',['-project','ios/QA/SmileComposeQA.xcodeproj','-scheme',suite==='LiveGenerationTests'?'SmileComposeLiveQA':'SmileComposeQA','-configuration','Release','-destination',`platform=iOS Simulator,id=${device}`,'-derivedDataPath',temporary+'/uitests','-resultBundlePath',result,'CODE_SIGNING_ALLOWED=NO','-parallel-testing-enabled','NO',`-only-testing:SmileComposeQA/${suite}`,'test'],resolve(evidence,`${label}.log`));
  await command('xcrun',['simctl','io',device,'screenshot',resolve(evidence,`${label}.png`)],resolve(evidence,`${label}-screenshot.log`));
  console.log(`PASS ${label}: ${result}`);
}
async function main() {
  await fs.mkdir(evidence,{recursive:true}); await fs.mkdir(temporary,{recursive:true});
  const source=await fs.readFile('output/stage3-evidence/generation-source.jpg');
  if(createHash('sha256').update(source).digest('hex')!=='1f54f12c302287ce3dcef8701614ebd42130e9a078ec22e062214d09a23b1ee6')throw Error('Approved synthetic QA source is required');
  if(!process.argv.includes('--skip-web-build')) await command('npm',['run','ios:sync'],resolve(evidence,'qa-web-sync.log'));
  await command('xcodebuild',['-project','ios/App/App.xcodeproj','-scheme','App','-configuration','Release','-destination','generic/platform=iOS Simulator','-derivedDataPath',temporary+'/build','build'],resolve(evidence,'qa-simulator-build.log'));
  const fixture=temporary+'/Fixture.app'; await fs.rm(fixture,{recursive:true,force:true});
  await fs.cp(temporary+'/build/Build/Products/Release-iphonesimulator/App.app',fixture,{recursive:true});
  await fs.mkdir(fixture+'/public/qa',{recursive:true}); await fs.copyFile('tests/ios/fixture-network.js',fixture+'/public/qa/fixture-network.js');
  await fs.copyFile('output/final-rc-2026-10-03/final-provider-result.jpg',fixture+'/public/qa/result.jpg');
  const html=fixture+'/public/index.html'; await fs.writeFile(html,(await fs.readFile(html,'utf8')).replace('<head>','<head><script src="/qa/fixture-network.js"></script>'));
  const env=await fs.readFile('.env.local','utf8');const key=env.match(/^NEXT_PUBLIC_REVENUECAT_IOS_API_KEY=(.*)$/m)?.[1]?.replace(/^['"]|['"]$/g,''); if(!key)throw Error('Public SDK config missing');
  const dir=fixture+'/public/_next/static/chunks';for(const f of await fs.readdir(dir)){if(f.endsWith('.js')){const p=dir+'/'+f;await fs.writeFile(p,(await fs.readFile(p,'utf8')).split(key).join(''));}}
  await command('xattr',['-cr',fixture],resolve(evidence,'qa-metadata.log'));
  await command('codesign',['--force','--sign','-',fixture],resolve(evidence,'qa-sign.log'));
  const kinds=process.argv.includes('--iphone-only')?['iPhone']:['iPhone','iPad'];
  for(const kind of kinds){const id=await simulator(kind);await command('xcrun',['simctl','install',id,fixture],resolve(evidence,`install-${kind}.log`));await command('xcrun',['simctl','addmedia',id,resolve('output/stage3-evidence/generation-source.jpg')],resolve(evidence,`photos-${kind}.log`));await uiTest(id,'SmokeTests',kind.toLowerCase()+'-fixture');}
  console.log('SIMULATOR AUTOMATION: PASS (no Gemini requests)');
}
if(process.argv[1]===fileURLToPath(import.meta.url) || resolve(process.argv[1]??'')===fileURLToPath(import.meta.url))main().catch(e=>{console.error('SIMULATOR AUTOMATION: FAIL — '+e.message);process.exitCode=1;});
