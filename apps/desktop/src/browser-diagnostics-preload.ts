import electron from 'electron';
import {
  NATIVE_BROWSER_DIAGNOSTIC,
  NATIVE_BROWSER_OPERATION,
  PREVIEW_PIXELS,
  type PreviewPixels,
  type NativeBrowserDiagnostic,
  type NativeBrowserDiagnostics,
} from '@smarteverything/domain';
export const browserDiagnostics: NativeBrowserDiagnostics = {
  version: 1,
  perform: async (input): Promise<PreviewPixels | null> => {
    const result: unknown = await electron.ipcRenderer.invoke(
      'desktop:browser-diagnostics',
      NATIVE_BROWSER_OPERATION.parse(input),
    );
    return result === null ? null : PREVIEW_PIXELS.parse(result);
  },
  rawVersion: 2,
  subscribe: (listener): (() => void) => subscribe(listener, false),
  subscribeRaw: (listener): (() => void) => subscribe(listener, true),
};
function subscribe(listener: (event: NativeBrowserDiagnostic) => void, raw: boolean): () => void {
  const channel = raw ? 'desktop:browser-diagnostic-raw' : 'desktop:browser-diagnostic';
  const receive = (_event: unknown, value: unknown): void => {
    listener(NATIVE_BROWSER_DIAGNOSTIC.parse(value));
  };
  electron.ipcRenderer.on(channel, receive);
  electron.ipcRenderer.send('desktop:browser-observe', raw ? 2 : undefined);
  return (): void => {
    electron.ipcRenderer.removeListener(channel, receive);
  };
}
