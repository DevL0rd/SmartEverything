import { androidBrowserProfileReady } from '../../modules/health-connect/src/browser-diagnostics';
import { androidHtmlPreview } from '../../modules/health-connect/src/html-preview';
import { useEffect, useState, type ReactNode } from 'react';
import { TurboModuleRegistry, UIManager, type TurboModule } from 'react-native';
import { Text } from '../components/text';
import type {
  BrowserSurfaceComponent,
  BrowserSurfaceProps,
  BrowserCapability,
} from './browser-contract';

interface SecureBrowserModule extends TurboModule {
  readonly secureBrowserPolicy?: () => number;
}
function webViewAvailable(): boolean {
  return (
    TurboModuleRegistry.get<SecureBrowserModule>('RNCWebViewModule')?.secureBrowserPolicy?.() ===
      2 && UIManager.hasViewManagerConfig('RNCWebView')
  );
}
export function browserCapability(): BrowserCapability {
  const publicBrowsing = webViewAvailable();
  const available = publicBrowsing || androidHtmlPreview.supported();
  return {
    available,
    publicBrowsing,
    limitation: available
      ? null
      : 'Update the Android app and System WebView to enable its isolated browser.',
  };
}
export function BrowserSurface(props: BrowserSurfaceProps): ReactNode {
  const [component, setComponent] = useState<{
    readonly kind: SurfaceKind;
    readonly render: BrowserSurfaceComponent;
  } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const nativeHtml = props.target.kind === 'native-html';
  const kind = surfaceKind(nativeHtml);
  const available = nativeHtml ? androidHtmlPreview.supported() : webViewAvailable();
  useEffect(() => {
    if (!available) return undefined;
    let active = true;
    void loadSurface(kind).then(
      (loaded) => {
        if (active) setComponent({ ...loaded, kind });
      },
      () => {
        if (active) setProblem('The Android browser could not be loaded. Update the app.');
      },
    );
    return (): void => {
      active = false;
    };
  }, [kind, available]);
  if (!available)
    return <Text>Update the Android app and System WebView to enable its isolated browser.</Text>;
  if (component?.kind !== kind) return <Text>{problem ?? 'Opening browser…'}</Text>;
  return <component.render {...props} />;
}
type SurfaceKind = 'html' | 'owned' | 'secure';
function surfaceKind(nativeHtml: boolean): SurfaceKind {
  if (nativeHtml) return 'html';
  return androidBrowserProfileReady() ? 'owned' : 'secure';
}
async function loadSurface(
  kind: SurfaceKind,
): Promise<{ readonly render: BrowserSurfaceComponent }> {
  switch (kind) {
    case 'html':
      return { render: (await import('./browser-html-native')).NativeHtmlSurface };
    case 'owned':
      return { render: (await import('./browser-native')).NativeBrowserSurface };
    case 'secure':
      return { render: (await import('./browser-native-secure')).SecureNativeBrowserSurface };
  }
}

export function gatewayBrowserAvailable(): boolean {
  return webViewAvailable();
}
