export type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
export type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
export function currentFullscreen(doc: FullscreenDocument): Element | null {
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}
export async function enterFullscreen(element: FullscreenElement): Promise<boolean> {
  try {
    if (element.requestFullscreen) await element.requestFullscreen();
    else if (element.webkitRequestFullscreen) await element.webkitRequestFullscreen();
    else return false;
    return true;
  } catch {
    return false;
  }
}
export async function leaveFullscreen(doc: FullscreenDocument): Promise<void> {
  if (doc.exitFullscreen) await doc.exitFullscreen();
  else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
}
