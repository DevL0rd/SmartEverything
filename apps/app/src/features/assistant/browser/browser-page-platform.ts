import type { NativeBrowserPage } from '@smarteverything/domain';
import { androidBrowserPage } from '../../../../modules/health-connect/src/browser-page';
import { appPlatform, desktopBridge } from '../../../design/platform';
export function nativeBrowserPage(): NativeBrowserPage | undefined {
  switch (appPlatform()) {
    case 'desktop':
      return desktopBridge()?.browser?.page;
    case 'android':
      return androidBrowserPage();
    case 'web':
      return undefined;
  }
}
