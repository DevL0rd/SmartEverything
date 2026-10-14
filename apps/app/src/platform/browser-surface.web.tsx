import { previewFrameDocument, PREVIEW_FRAME_EVENT } from './browser-frame-document';
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { browserAllows, type BrowserStatus } from '@smarteverything/domain';
import { desktopBridge } from '../design/platform';
import { useValue } from '../design/external-store';
import { Text } from '../components/text';
import { browserCovered } from './browser-overlays';
import { DesktopBrowserSurface } from './browser-desktop';
import type { BrowserCapability, BrowserSurfaceProps } from './browser-contract';
const FRAME_DEADLINE_MS = 15000;
const FRAME_STYLE = { width: '100%', height: '100%', border: 0 } as const;
class FrameDeadline {
  private timer: ReturnType<typeof setTimeout> | null = null;
  start(callback: () => void): void {
    this.clear();
    this.timer = setTimeout(callback, FRAME_DEADLINE_MS);
  }
  clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
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
): FrameDeadline {
  const [deadline] = useState(() => new FrameDeadline());
  const receive = useEffectEvent(report);
  useEffect(() => {
    receive(frameStatus(id, null, true));
    deadline.start(() => {
      receive(
        frameStatus(
          id,
          'Preview did not report readiness. The site may refuse framing or require cookies. In-page history is unavailable here.',
          false,
        ),
      );
    });
    return (): void => {
      deadline.clear();
    };
  }, [id, navigation, deadline]);
  return deadline;
}
function FrameSurface({ target, ref, onStatus, visible }: BrowserSurfaceProps): ReactNode {
  const [url, setUrl] = useState(target.url);
  const [reload, setReload] = useState(0);
  const covered = useValue(browserCovered);
  const deadline = useFrameLoading(target.id, `${url}:${String(reload)}`, onStatus);
  useFrameHandle({ target, ref, onStatus, visible }, { setUrl, setReload, deadline });
  const loaded = (): void => {
    deadline.clear();
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
    <PreviewFrame
      key={reload}
      id={target.id}
      origin={target.origin}
      url={url}
      loaded={loaded}
      failed={() => {
        deadline.clear();
        onStatus(
          frameStatus(
            target.id,
            'This page could not be framed. Check its frame and cookie policy.',
            false,
          ),
        );
      }}
      style={frameStyle}
    />
  );
}
interface FrameActions {
  readonly setUrl: (url: string) => void;
  readonly setReload: (change: (value: number) => number) => void;
  readonly deadline: FrameDeadline;
}
function useFrameHandle(
  { target, ref, onStatus }: BrowserSurfaceProps,
  { setUrl, setReload, deadline }: FrameActions,
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
      deadline.clear();
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
interface PreviewFrameProps {
  readonly id: string;
  readonly origin: string;
  readonly url: string;
  readonly loaded: () => void;
  readonly failed: () => void;
  readonly style: CSSProperties;
}
function PreviewFrame({ id, origin, url, loaded, failed, style }: PreviewFrameProps): ReactNode {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const document = useMemo(() => previewFrameDocument(id, origin, url), [id, origin, url]);
  const onLoaded = useEffectEvent(loaded);
  const onFailed = useEffectEvent(failed);
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>): void => {
      if (
        event.source !== frameRef.current?.contentWindow ||
        event.origin !== window.location.origin
      )
        return;
      const parsed = PREVIEW_FRAME_EVENT.safeParse(event.data);
      if (!parsed.success || parsed.data.id !== id || parsed.data.nonce !== document.nonce) return;
      if (parsed.data.type === 'frame_loaded') onLoaded();
      else onFailed();
    };
    window.addEventListener('message', receive);
    return (): void => {
      window.removeEventListener('message', receive);
    };
  }, [document, id]);
  return (
    <iframe
      ref={frameRef}
      title="Published service preview"
      srcDoc={document.html}
      sandbox="allow-scripts allow-forms allow-same-origin"
      referrerPolicy="no-referrer"
      onError={failed}
      style={style}
    />
  );
}

export function gatewayBrowserAvailable(): boolean {
  return browserCapability().available;
}
