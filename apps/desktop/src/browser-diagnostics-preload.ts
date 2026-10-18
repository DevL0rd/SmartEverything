import electron from 'electron';
import {
  NATIVE_BROWSER_DIAGNOSTIC,
  NATIVE_BROWSER_OPERATION,
  PREVIEW_PIXELS,
  type PreviewPixels,
  type NativeBrowserDiagnostics,
} from '@smarteverything/domain';
export const browserDiagnostics: NativeBrowserDiagnostics = {
  perform: async (input): Promise<PreviewPixels | null> => {
    const result: unknown = await electron.ipcRenderer.invoke(
      'desktop:browser-diagnostics',
      NATIVE_BROWSER_OPERATION.parse(input),
    );
    return result === null ? null : PREVIEW_PIXELS.parse(result);
  },
  subscribe: (listener): (() => void) => {
    const receive = (_event: unknown, value: unknown): void => {
      listener(NATIVE_BROWSER_DIAGNOSTIC.parse(value));
    };
    electron.ipcRenderer.on('desktop:browser-diagnostic', receive);
    electron.ipcRenderer.send('desktop:browser-observe');
    return (): void => {
      electron.ipcRenderer.removeListener('desktop:browser-diagnostic', receive);
    };
  },
};
