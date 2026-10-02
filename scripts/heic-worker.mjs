import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'acorn';
/** Materialise the package's CSP-compatible decoder as a self-hosted worker.
 * AST extraction executes no dependency code and fails closed if its packaging changes. */
export function extractHeicWorker(source){
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),workers=[];
  const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='Literal'&&typeof n.value==='string'&&n.value.length>100000&&n.value.includes('HeifDecoder')&&n.value.includes('onmessage='))workers.push(n.value);for(const v of Object.values(n))Array.isArray(v)?v.forEach(walk):walk(v);};
  walk(ast);
  if(workers.length!==1)throw new Error('HEIC CSP worker packaging changed. Review the installed decoder before building.');
  parse(workers[0],{ecmaVersion:'latest'});
  return workers[0];
}
export async function copyHeicWorker(){
  const source=await readFile('node_modules/heic-to/dist/csp/heic-to.js','utf8');
  const code=extractHeicWorker(source);
  // Adapt the package's id/buffer → id/imageData protocol to the shared RPC.
  const bridge=`\nconst decode=self.onmessage,emit=self.postMessage.bind(self);self.postMessage=m=>emit({id:m.id,result:m.imageData,error:m.error});self.onmessage=e=>decode({data:{id:e.data.id,buffer:e.data.payload.buffer}});\n`;
  await writeFile('public/vision/heic-worker.js',code+bridge);
}
