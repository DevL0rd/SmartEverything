import electron from 'electron';
import {
  NATIVE_BROWSER_PAGE_REQUEST,
  NATIVE_BROWSER_PAGE_RESPONSE,
  type NativeBrowserPage,
} from '@smarteverything/domain';
export const browserPage: NativeBrowserPage = {
  perform: async (request) =>
    NATIVE_BROWSER_PAGE_RESPONSE.parse(
      await electron.ipcRenderer.invoke(
        'desktop:browser-page',
        NATIVE_BROWSER_PAGE_REQUEST.parse(request),
      ),
    ),
};
