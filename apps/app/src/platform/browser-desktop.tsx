import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  type BrowserStatus,
  type DesktopBrowser,
  type BrowserCommand,
  type BrowserTarget,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { DURATION } from '../design/motion';
import { useValue } from '../design/external-store';
import { browserCovered } from './browser-overlays';
import type { BrowserSurfaceProps } from './browser-contract';
const log = new Logger('app.desktop-browser');
const REGION_STYLE = { flex: 1, minHeight: 0, width: '100%', height: '100%' } as const;
const unavailableStatus = (id: string): BrowserStatus => ({
  id,
  url: '',
  loading: false,
  back: false,
  forward: false,
  problem: 'The desktop browser is unavailable. Update or reopen the desktop app.',
});
class BrowserReadiness {
  private ready = false;
  set(value: boolean): void {
    this.ready = value;
  }
  get(): boolean {
    return this.ready;
  }
}
interface DesktopPage {
  readonly bridge: DesktopBrowser;
  readonly target: BrowserTarget;
  readonly report: (command: BrowserCommand) => void;
}
export function DesktopBrowserSurface({
  target,
  ref,
  onStatus,
  onOpenWindow,
  visible,
  bridge,
}: BrowserSurfaceProps & { readonly bridge: DesktopBrowser }): ReactNode {
  const regionRef = useRef<HTMLDivElement>(null);
  const covered = useValue(browserCovered);
  const [readiness] = useState(() => new BrowserReadiness());
  const report = (command: BrowserCommand): void => {
    bridge.command(command).catch((cause: unknown) => {
      log.error('browser.command_failed', cause);
      onStatus(unavailableStatus(target.id));
    });
  };
  useImperativeHandle(ref, () => ({
    navigate: (url): void => {
      report({ kind: 'navigate', id: target.id, url });
    },
    back: (): void => {
      report({ kind: 'action', id: target.id, action: 'back' });
    },
    forward: (): void => {
      report({ kind: 'action', id: target.id, action: 'forward' });
    },
    reload: (): void => {
      report({ kind: 'action', id: target.id, action: 'reload' });
    },
    stop: (): void => {
      report({ kind: 'action', id: target.id, action: 'stop' });
    },
  }));
  useDesktopPage({ bridge, target, report }, regionRef, readiness, { onStatus, onOpenWindow });
  useDesktopLayout({ bridge, target, report }, regionRef, readiness, visible && !covered);
  return <div ref={regionRef} role="region" aria-label="Browser page" style={REGION_STYLE} />;
}
function useDesktopPage(
  page: DesktopPage,
  regionRef: { readonly current: HTMLDivElement | null },
  readiness: BrowserReadiness,
  handlers: {
    readonly onStatus: BrowserSurfaceProps['onStatus'];
    readonly onOpenWindow: BrowserSurfaceProps['onOpenWindow'] | undefined;
  },
): void {
  const receive = useEffectEvent(handlers.onStatus);
  const openWindow = useEffectEvent((url: string) => handlers.onOpenWindow?.(url));
  const send = useEffectEvent(page.report);
  const { bridge, target } = page;
  useEffect(() => {
    const stopStatus = bridge.subscribe((status) => {
      if (status.id === target.id) receive(status);
    });
    const stopWindows = bridge.subscribeWindowRequests((request) => {
      if (request.id === target.id) openWindow(request.url);
    });
    const stop = (): void => {
      stopStatus();
      stopWindows();
    };
    let alive = true;
    background(
      bridge.command({ kind: 'open', target }).then(
        () => {
          if (alive) {
            readiness.set(true);
            regionRef.current?.dispatchEvent(new Event('browser-ready'));
          }
        },
        (cause: unknown) => {
          log.error('browser.open_failed', cause);
          if (alive) receive(unavailableStatus(target.id));
        },
      ),
      'bridge.command_failed',
    );
    return (): void => {
      alive = false;
      readiness.set(false);
      stop();
      send({ kind: 'action', id: target.id, action: 'destroy' });
    };
  }, [bridge, target, regionRef, readiness]);
}
function useDesktopLayout(
  page: DesktopPage,
  regionRef: { readonly current: HTMLElement | null },
  readiness: BrowserReadiness,
  visible: boolean,
): void {
  const send = useEffectEvent(page.report);
  const id = page.target.id;
  useEffect(() => {
    const node = regionRef.current;
    if (node === null) return undefined;
    let sent = '';
    const update = (): void => {
      if (!readiness.get()) return;
      const command = layoutCommand(node, id, visible);
      const key = JSON.stringify(command);
      if (key === sent) return;
      sent = key;
      send(command);
    };
    const reopened = (): void => {
      sent = '';
    };
    node.addEventListener('browser-ready', reopened);
    const stop = observeBrowserRegion(node, update);
    return (): void => {
      node.removeEventListener('browser-ready', reopened);
      stop();
    };
  }, [id, visible, regionRef, readiness]);
}
function observeBrowserRegion(node: HTMLElement, update: () => void): () => void {
  let animation = 0;
  let until = 0;
  const frame = (now: number): void => {
    update();
    if (now < until) animation = requestAnimationFrame(frame);
  };
  const settle = (): void => {
    cancelAnimationFrame(animation);
    until = performance.now() + DURATION.medium;
    animation = requestAnimationFrame(frame);
  };
  const observer = new ResizeObserver(settle);
  observer.observe(node);
  node.addEventListener('browser-ready', settle);
  window.addEventListener('resize', settle);
  settle();
  return (): void => {
    cancelAnimationFrame(animation);
    observer.disconnect();
    node.removeEventListener('browser-ready', settle);
    window.removeEventListener('resize', settle);
  };
}
function layoutCommand(node: HTMLElement, id: string, visible: boolean): BrowserCommand {
  const bounds = node.getBoundingClientRect();
  const width = Math.max(0, Math.min(bounds.width, window.innerWidth - bounds.x));
  const height = Math.max(0, Math.min(bounds.height, window.innerHeight - bounds.y));
  return {
    kind: 'layout',
    id,
    visible: visible && width > 0 && height > 0,
    bounds: {
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      width: Math.round(width),
      height: Math.round(height),
    },
  };
}
