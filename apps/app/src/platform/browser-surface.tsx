import { androidBrowserProfileReady } from '../../modules/health-connect/src/browser-page';
import { androidHtmlPreview } from '../../modules/health-connect/src/html-preview';
import type { ReactNode } from 'react';
import { Text } from '../components/text';
import { NativeBrowserSurface } from './browser-native';
import type { BrowserSurfaceProps, BrowserCapability } from './browser-contract';

const LIMITATION = 'Update the Android app and System WebView to enable its isolated browser.';
export function browserCapability(): BrowserCapability {
  const publicBrowsing = androidBrowserProfileReady();
  const available = publicBrowsing || androidHtmlPreview.supported();
  return { available, publicBrowsing, limitation: available ? null : LIMITATION };
}
export function BrowserSurface(props: BrowserSurfaceProps): ReactNode {
  const available =
    props.target.kind === 'project'
      ? androidHtmlPreview.supported()
      : androidBrowserProfileReady();
  if (!available) return <Text>{LIMITATION}</Text>;
  return <NativeBrowserSurface {...props} />;
}
