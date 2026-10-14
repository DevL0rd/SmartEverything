import { ipcRenderer } from 'electron';
import { z } from 'zod';
import {
  NATIVE_HTML_PROJECTION,
  NATIVE_HTML_ID,
  type NativeHtmlPreview,
} from '@smarteverything/domain';

export const htmlPreview: NativeHtmlPreview = {
  projectVersion: (): number =>
    z.int().min(0).max(1).parse(ipcRenderer.sendSync('desktop:html-project-version')),
  lifetimeVersion: (): number =>
    z.int().min(0).max(2).parse(ipcRenderer.sendSync('desktop:html-lifetime-version')),
  supported: (): boolean => z.boolean().parse(ipcRenderer.sendSync('desktop:html-supported')),
  open: async (input) =>
    NATIVE_HTML_PROJECTION.parse(await ipcRenderer.invoke('desktop:html-open', input)),
  release: async (id) => {
    await ipcRenderer.invoke('desktop:html-release', NATIVE_HTML_ID.parse(id));
  },
};
