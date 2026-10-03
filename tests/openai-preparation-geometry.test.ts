import test from "node:test";
import assert from "node:assert/strict";
import { prepareGenerationPhoto } from "../src/lib/photos";
import { prepareOpenAIEditInput } from "../src/lib/generation/openaiEditInput";

test("portrait preparation preserves every source edge and projects the painted mask through identical padding", async () => {
  const previousImage = globalThis.Image, previousDocument = globalThis.document;
  const draws: { src: string; rect: number[] }[] = [];
  const images: Record<string, [number, number]> = { original: [1092,1440], painted: [1092,1440], padded: [1092,1456] };
  class ImageFixture {
    src = "";
    get naturalWidth() { return images[this.src][0]; }
    get naturalHeight() { return images[this.src][1]; }
    async decode() {}
  }
  const context = { fillStyle: "", fillRect() {}, clearRect() {}, drawImage(image: ImageFixture, ...rect: number[]) { draws.push({ src:image.src, rect }); }, getImageData() { return { data: new Uint8ClampedArray([0,0,0,0,0,0,0,255]) }; }, createImageData() { return { data: new Uint8ClampedArray(8) }; }, putImageData() {} };
  Object.assign(globalThis, { Image: ImageFixture, document: { createElement: () => ({ width:0,height:0,getContext:()=>context,toDataURL:(mime:string)=>mime === "image/jpeg" ? "padded" : "data:image/png;base64,c3ludGhldGlj" }) } });
  try {
    const source = { name:"synthetic", dataUrl:"original", width:1092,height:1440,editMask:"painted" };
    const prepared = await prepareGenerationPhoto(source);
    assert.equal(prepared.photo.width,1092); assert.equal(prepared.photo.height,1456);
    assert.deepEqual(prepared.sourceBounds,{ x:0,y:8/1456,width:1,height:1440/1456 });
    assert.deepEqual(draws[0],{ src:"original",rect:[0,8,1092,1440] });
    const input = await prepareOpenAIEditInput(source,prepared);
    assert.equal(input.originalImage,"data:image/png;base64,c3ludGhldGlj");
    assert.equal(input.editMask,"data:image/png;base64,c3ludGhldGlj");
    assert.deepEqual(draws.slice(1),[{src:"padded",rect:[0,0]},{src:"painted",rect:[0,8,1092,1440]}]);
    images.painted=[1092,1439];
    await assert.rejects(prepareOpenAIEditInput(source,prepared),/painted edit area does not match/);
    images.padded=[1092,1440];
    await assert.rejects(prepareOpenAIEditInput(source,prepared),/prepared photo dimensions do not match/);
  } finally { Object.assign(globalThis,{Image:previousImage,document:previousDocument}); }
});
