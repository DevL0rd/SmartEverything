import type { ReactNode } from 'react';
import { desktopBridge } from '../design/platform';
import { Text } from '../components/text';
import { DesktopBrowserSurface } from './browser-desktop';
import type { BrowserCapability, BrowserSurfaceProps } from './browser-contract';
const WEB_LIMITATION = 'Open pages in the SmartEverything app on your phone or computer.';
export function browserCapability(): BrowserCapability {
  const bridge = desktopBridge();
  if (bridge !== null)
    return {
      available: bridge.browser !== undefined,
      publicBrowsing: bridge.browser !== undefined,
      limitation:
        bridge.browser === undefined
          ? 'Update the desktop app to enable its built-in browser.'
          : null,
    };
  return { available: false, publicBrowsing: false, limitation: WEB_LIMITATION };
}
export function BrowserSurface(props: BrowserSurfaceProps): ReactNode {
  const bridge = desktopBridge();
  if (bridge?.browser === undefined)
    return (
      <Text>
        {bridge === null ? WEB_LIMITATION : 'Update the desktop app to enable its built-in browser.'}
      </Text>
    );
  return <DesktopBrowserSurface {...props} bridge={bridge.browser} />;
}
