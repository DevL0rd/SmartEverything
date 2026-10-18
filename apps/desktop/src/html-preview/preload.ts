import { ipcRenderer } from 'electron';
import { z } from 'zod';
import {
  NATIVE_HTML_PROJECTION,
  NATIVE_HTML_ID,
  type NativeHtmlPreview,
} from '@smarteverything/domain';

let supportedOnce: boolean | null = null;
function supported(): boolean {
  supportedOnce ??= z.boolean().parse(ipcRenderer.sendSync('desktop:html-supported'));
  return supportedOnce;
}
export const htmlPreview: NativeHtmlPreview = {
  supported,
  open: async (input) =>
    NATIVE_HTML_PROJECTION.parse(await ipcRenderer.invoke('desktop:html-open', input)),
  release: async (id) => {
    await ipcRenderer.invoke('desktop:html-release', NATIVE_HTML_ID.parse(id));
  },
};
