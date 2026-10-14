import { useEffect, useEffectEvent, useImperativeHandle, useState, type ReactNode } from 'react';
import { browserAllows, type BrowserStatus } from '@smarteverything/domain';
import { desktopBridge } from '../design/platform';
import { useValue } from '../design/external-store';
import { Text } from '../components/text';
import { browserCovered } from './browser-overlays';
import { DesktopBrowserSurface } from './browser-desktop';
import type { BrowserCapability, BrowserSurfaceProps } from './browser-contract';
const FRAME_STYLE = { width: '100%', height: '100%', border: 0 } as const;
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
  return {
    available: true,
    publicBrowsing: false,
    limitation: 'Web preview cannot report in-page history or verify that a site permits framing.',
  };
}
export function BrowserSurface(props: BrowserSurfaceProps): ReactNode {
  const bridge = desktopBridge();
  if (props.target.kind === 'preview' && props.target.origin === window.location.origin)
    return <Text>The preview needs a separate secure origin.</Text>;
  if (bridge !== null)
    return bridge.browser === undefined ? (
      <Text>Update the desktop app to enable its built-in browser.</Text>
    ) : (
      <DesktopBrowserSurface {...props} bridge={bridge.browser} />
    );
  return <FrameSurface {...props} />;
}
function frameStatus(id: string, problem: string | null, loading: boolean): BrowserStatus {
  return { id, url: '', loading, back: false, forward: false, problem };
}
function useFrameLoading(
  id: string,
  navigation: string,
  report: BrowserSurfaceProps['onStatus'],
): void {
  const receive = useEffectEvent(report);
  useEffect(() => {
    receive(frameStatus(id, null, true));
  }, [id, navigation]);
}
function FrameSurface({ target, ref, onStatus, visible }: BrowserSurfaceProps): ReactNode {
  const [url, setUrl] = useState(target.url);
  const [reload, setReload] = useState(0);
  const covered = useValue(browserCovered);
  useFrameLoading(target.id, `${url}:${String(reload)}`, onStatus);
  useFrameHandle({ target, ref, onStatus, visible }, { setUrl, setReload });
  const loaded = (): void => {
    if (target.kind === 'preview' && url.includes('/.se-preview/bootstrap')) {
      setUrl(`${target.origin}${target.initialPath}`);
      return;
    }
    onStatus(
      frameStatus(
        target.id,
        'Frame opened. Page readiness and in-page history cannot be verified here.',
        false,
      ),
    );
  };
  const frameStyle = {
    ...FRAME_STYLE,
    visibility: visible && !covered ? 'visible' : 'hidden',
  } as const;
  if (target.kind !== 'preview') return <Text>Open public websites in your external browser.</Text>;
  return (
    <iframe
      key={reload}
      title="Chat page"
      src={url}
      referrerPolicy="no-referrer"
      onLoad={loaded}
      onError={() => {
        onStatus(frameStatus(target.id, 'This page could not be opened.', false));
      }}
      style={frameStyle}
    />
  );
}
interface FrameActions {
  readonly setUrl: (url: string) => void;
  readonly setReload: (change: (value: number) => number) => void;
}
function useFrameHandle(
  { target, ref, onStatus }: BrowserSurfaceProps,
  { setUrl, setReload }: FrameActions,
): void {
  useImperativeHandle(ref, () => ({
    navigate: (value): void => {
      if (browserAllows(target, value)) setUrl(value);
    },
    back: (): void => undefined,
    forward: (): void => undefined,
    reload: (): void => {
      setReload((value) => value + 1);
    },
    stop: (): void => {
      onStatus(
        frameStatus(
          target.id,
          'Web preview cannot stop a cross-origin page. Choose another preview to close it.',
          false,
        ),
      );
    },
  }));
}
export function gatewayBrowserAvailable(): boolean {
  return browserCapability().available;
}
