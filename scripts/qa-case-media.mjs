// Loopback-only QA: synthetic media states and allowlisted, locally approved photos. No credentials, provider calls or external writes.
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root=process.cwd(),out=resolve(root,"output/v1-ui-audit/harness");
await mkdir(out,{recursive:true});
await build({entryPoints:["tests/ui/case-media-harness.tsx"],bundle:true,format:"esm",outfile:resolve(out,"harness.js"),define:{"process.env.NODE_ENV":'"development"'},logLevel:"warning"});
await build({entryPoints:["tests/ui/golden-cases-harness.tsx"],bundle:true,format:"esm",outfile:resolve(out,"golden.js"),define:{"process.env.NODE_ENV":'"development"'},logLevel:"warning"});
const goldenInputs=["IMG_3166 2.HEIC","IMG_3241.jpg","IMG_3291.jpg","IMG_3293.jpg","IMG_3296.jpg","IMG_3297.jpg"];
const styles=["globals","theme","immersive","compact","brand","ios-layout","account","onboarding","settings","library","cases","materials","studio","share","toothmap","surfaces"];
const html=`<!doctype html><html lang="en" data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>SmileCompose local media QA</title>${styles.map(s=>`<link rel="stylesheet" href="/css/${s}.css">`).join("")}<style>:root{--font-sans:Arial,sans-serif;--font-serif:Georgia,serif}.qa-toolbar{position:fixed;inset:0 0 auto;z-index:1000;background:white;color:#222;display:flex;gap:6px;padding:8px;font:12px system-ui}.qa-toolbar button,.qa-toolbar select{min-height:44px}.sheet-backdrop{top:76px}.log-pair img{min-height:80px;max-height:100px;background:#eee}.log-panel{max-height:calc(100dvh - 80px)}</style></head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>`;
await writeFile(resolve(out,"index.html"),html);
createServer(async(req,res)=>{
 try {
  const pathname=new URL(req.url,"http://localhost").pathname;
  if(pathname==="/golden"){res.setHeader("Content-Type","text/html");res.end(html.replace('/harness.js','/golden.js'));return;}
  if(/^\/golden-input\/[0-5]$/.test(pathname)){res.setHeader("Content-Type",pathname.endsWith("/0")?"image/heic":"image/jpeg");res.setHeader("Cache-Control","no-store");res.end(await readFile(resolve(root,"test images",goldenInputs[Number(pathname.split("/").pop())])));return;}
  const path=pathname==="/"?resolve(out,"index.html"):pathname==="/harness.js"?resolve(out,"harness.js"):pathname==="/golden.js"?resolve(out,"golden.js"):pathname.startsWith("/css/")?resolve(root,"src/app",pathname.slice(5)):resolve(root,"public",pathname.slice(1));
  if(![out,resolve(root,"src/app"),resolve(root,"public")].some(dir=>path.startsWith(dir+"/"))){res.writeHead(403);res.end();return;}
  res.setHeader("Content-Type",({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".png":"image/png"})[extname(path)]??"application/octet-stream");
  res.setHeader("Cache-Control","no-store");res.end(await readFile(path));
 }catch{res.writeHead(404);res.end();}
}).listen(3097,"127.0.0.1",()=>console.log("Local media QA: http://127.0.0.1:3097"));
