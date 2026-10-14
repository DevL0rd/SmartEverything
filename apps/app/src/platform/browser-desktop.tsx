import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  BROWSER_STATUS,
  type DesktopBrowser,
  type BrowserCommand,
  type BrowserTarget,
} from '@smarteverything/domain';
import { DURATION } from '../design/motion';
import { useValue } from '../design/external-store';
import { browserCovered } from './browser-overlays';
import type { BrowserSurfaceProps } from './browser-contract';
const REGION_STYLE = { flex: 1, minHeight: 0, width: '100%', height: '100%' } as const;
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
  visible,
  bridge,
}: BrowserSurfaceProps & { readonly bridge: DesktopBrowser }): ReactNode {
  const regionRef = useRef<HTMLDivElement>(null);
  const covered = useValue(browserCovered);
  const [readiness] = useState(() => new BrowserReadiness());
  const report = (command: BrowserCommand): void => {
    void bridge.command(command).catch(() => {
      onStatus({
        id: target.id,
        url: '',
        loading: false,
        back: false,
        forward: false,
        problem: 'The desktop browser is unavailable. Update or reopen the desktop app.',
      });
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
  useDesktopPage({ bridge, target, report }, regionRef, readiness, onStatus);
  useDesktopLayout({ bridge, target, report }, regionRef, readiness, visible && !covered);
  return <div ref={regionRef} role="region" aria-label="Browser page" style={REGION_STYLE} />;
}
function useDesktopPage(
  page: DesktopPage,
  regionRef: { readonly current: HTMLDivElement | null },
  readiness: BrowserReadiness,
  onStatus: BrowserSurfaceProps['onStatus'],
): void {
  const receive = useEffectEvent(onStatus);
  const send = useEffectEvent(page.report);
  const { bridge, target } = page;
  useEffect(() => {
    const stop = bridge.subscribe((value) => {
      const status = BROWSER_STATUS.parse(value);
      if (status.id === target.id) receive(status);
    });
    let alive = true;
    void bridge.command({ kind: 'open', target }).then(
      () => {
        if (alive) {
          readiness.set(true);
          regionRef.current?.dispatchEvent(new Event('browser-ready'));
        }
      },
      () => {
        send({ kind: 'action', id: target.id, action: 'stop' });
      },
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
    const update = (): void => {
      if (readiness.get()) reportLayout(node, id, visible, send);
    };
    return observeBrowserRegion(node, update);
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
  window.addEventListener('scroll', settle, true);
  settle();
  return (): void => {
    cancelAnimationFrame(animation);
    observer.disconnect();
    node.removeEventListener('browser-ready', settle);
    window.removeEventListener('resize', settle);
    window.removeEventListener('scroll', settle, true);
  };
}
function reportLayout(
  node: HTMLElement,
  id: string,
  visible: boolean,
  send: (command: BrowserCommand) => void,
): void {
  const bounds = node.getBoundingClientRect();
  const width = Math.max(0, Math.min(bounds.width, window.innerWidth - bounds.x));
  const height = Math.max(0, Math.min(bounds.height, window.innerHeight - bounds.y));
  send({
    kind: 'layout',
    id,
    visible: visible && width > 0 && height > 0,
    bounds: {
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      width: Math.round(width),
      height: Math.round(height),
    },
  });
}
