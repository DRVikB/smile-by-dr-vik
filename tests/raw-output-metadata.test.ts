import test from "node:test";
import assert from "node:assert/strict";
import { jpegExifOrientation } from "../src/lib/face/rawOutputMetadata";
import { alignPreview } from "../src/lib/photos";
import type { RawOutputDiagnostic } from "../src/lib/face/alignmentDiagnostic";

function jpeg(little: boolean, orientation: number) {
  const bytes = new Uint8Array(40), v = new DataView(bytes.buffer);
  bytes.set([255,216,255,225,0,34,69,120,105,102,0,0]);
  bytes.set(little ? [73,73] : [77,77],12);
  v.setUint16(14,42,little); v.setUint32(16,8,little);
  v.setUint16(20,1,little); v.setUint16(22,0x112,little);
  v.setUint16(24,3,little); v.setUint32(26,1,little); v.setUint16(30,orientation,little);
  bytes.set([255,217],38); return bytes;
}
test("raw JPEG metadata reads bounded EXIF orientation in either byte order",()=>{
 for(const little of [true,false]) for(const o of [1,6,8]) assert.equal(jpegExifOrientation(jpeg(little,o)),o);
});
test("absent, truncated, malformed or invalid EXIF is unavailable, never an exception",()=>{
 const malformed=jpeg(true,6);new DataView(malformed.buffer).setUint32(16,0xffffffff,true);
 for(const bytes of [new Uint8Array(),new Uint8Array([255,216,255,217]),jpeg(true,0),jpeg(true,9),jpeg(true,6).slice(0,29),malformed]) assert.equal(jpegExifOrientation(bytes),null);
});
test("raw decoded geometry is reported before normalization or framing rejection",async()=>{
 const savedImage=globalThis.Image,savedDocument=globalThis.document;
 let dimensions=[896,1200];const draws:unknown[][]=[];
 class FakeImage {src=""; get naturalWidth(){return dimensions[0];} get naturalHeight(){return dimensions[1];} async decode(){} }
 let exported=[0,0];const canvas={width:0,height:0,getContext:()=>({drawImage:(...args:unknown[])=>draws.push(args)}),toDataURL:()=>{exported=[canvas.width,canvas.height];return "normalized";}};
 Object.assign(globalThis,{Image:FakeImage,document:{createElement:()=>canvas}});
 const original={dataUrl:"original",name:"QA",width:1320,height:1737};
 const request={photo:{...original,width:1320,height:1760},sourceBounds:{x:0,y:11/1760,width:1,height:1737/1760}};
 const raw=`data:image/jpeg;base64,${Buffer.from(jpeg(true,6)).toString("base64")}`;
 let observed:RawOutputDiagnostic|undefined;
 try {
   for(const size of [[1320,1760],[900,1200],[896,1200]]) {
    dimensions=size;assert.equal(await alignPreview(raw,original,request,d=>observed=d),"normalized");
    assert.deepEqual(observed,{width:size[0],height:size[1],mime:"image/jpeg",exifOrientation:6});
    assert.deepEqual(exported,[1320,1737]);
    assert.deepEqual(draws.at(-1)?.slice(1),[0,11/1760*size[1],size[0],1737/1760*size[1],0,0,1320,1737]);
   }
   dimensions=[1200,1200];const before=draws.length;
   await assert.rejects(alignPreview(raw,original,request,d=>observed=d),/framing/);
   assert.equal(observed?.width,1200);assert.equal(draws.length,before);
   dimensions=[896,1200];assert.equal(await alignPreview(raw,original,request,()=>{throw Error("QA failure");}),"normalized");
 } finally {Object.assign(globalThis,{Image:savedImage,document:savedDocument});}
});
