// Bundled as /ort/sam-worker.js by copy-ort.mjs. Only the existing SlimSAM
// inference runs here; no photo or map is sent to a remote service.
import { loadSam } from "./samRuntime";
import { refineWithSam } from "./sam";

type RefinementRequest = { id:number;payload:{map: Parameters<typeof refineWithSam>[1]; image: Parameters<typeof refineWithSam>[2]} };

self.onmessage = async (event: MessageEvent<RefinementRequest>) => {
  try {
    const rt = await loadSam();
    self.postMessage({id:event.data.id,result:await refineWithSam(rt, event.data.payload.map, event.data.payload.image)});
  } catch {
    self.postMessage({id:event.data.id,error:true});
  }
};
