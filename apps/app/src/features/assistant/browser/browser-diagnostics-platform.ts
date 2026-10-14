import type { BrowserTarget, NativeBrowserDiagnostics } from '@smarteverything/domain';
import { androidBrowserDiagnostics } from '../../../../modules/health-connect/src/browser-diagnostics';
import { appPlatform, desktopBridge } from '../../../design/platform';
export function previewDiagnosticsNative(
  kind: BrowserTarget['kind'],
): NativeBrowserDiagnostics | null {
  switch (appPlatform()) {
    case 'desktop':
      return desktopBridge()?.browser?.diagnostics ?? null;
    case 'android':
      return androidBrowserDiagnostics(kind === 'native-html');
    case 'web':
      return null;
  }
}
