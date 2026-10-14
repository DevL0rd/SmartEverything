import * as Crypto from 'expo-crypto';
import { z } from 'zod';
export const PREVIEW_FRAME_EVENT = z.strictObject({
  type: z.enum(['frame_loaded', 'frame_failed']),
  id: z.string(),
  nonce: z.uuid(),
});
export function previewFrameDocument(
  id: string,
  origin: string,
  url: string,
): { readonly html: string; readonly nonce: string } {
  const nonce = Crypto.randomUUID();
  const policy = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; frame-src ${origin}; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const payload = JSON.stringify({ id, nonce }).replaceAll('<', '\u003c');
  const script = `const frame = document.querySelector('iframe'); const payload = ${payload}; for (const type of ['load', 'error']) frame.addEventListener(type, () => parent.postMessage({ ...payload, type: type === 'load' ? 'frame_loaded' : 'frame_failed' }, parent.location.origin));`;
  return {
    nonce,
    html: `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${htmlAttribute(policy)}"><meta name="referrer" content="no-referrer"><style>html,body,iframe{height:100%;width:100%;margin:0;border:0;overflow:hidden}iframe{display:block}</style></head><body><iframe title="Published service" src="${htmlAttribute(url)}" sandbox="allow-scripts allow-forms allow-same-origin" referrerpolicy="no-referrer"></iframe><script nonce="${nonce}">${script}</script></body></html>`,
  };
}
function htmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
