import { requireNativeView } from 'expo';
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Logger } from '@smarteverything/logging';
import {
  BROWSER_RETIRED_PROBLEM,
  browserAllows,
  type BrowserTarget,
} from '@smarteverything/domain';
import {
  nativeHtmlCurrent,
  onNativeHtmlRetired,
} from '../../modules/health-connect/src/html-preview';
import { nativeBrowserStatus, type NativeBrowserEvent } from './browser-native-events';
import { useBrowserDisplayed } from './browser-displayed';
import type { BrowserHandle, BrowserSurfaceProps } from './browser-contract';

interface NativeBrowserCommands {
  navigate(url: string): Promise<void>;
  back(): Promise<void>;
  forward(): Promise<void>;
  reload(): Promise<void>;
  stop(): Promise<void>;
}
type NativeBrowserSource = { readonly target: string } | { readonly projection: string };
type NativeBrowserProps = NativeBrowserSource & {
  readonly ref: Ref<NativeBrowserCommands>;
  readonly displayed: boolean;
  readonly style: StyleProp<ViewStyle>;
  readonly onStatus: (event: NativeBrowserEvent) => void;
};
const NativeBrowser = requireNativeView<NativeBrowserProps>('HubNetwork');
const STYLES = StyleSheet.create({ page: { flex: 1 }, hidden: { opacity: 0 } });
const log = new Logger('app.native-browser');

export function NativeBrowserSurface({
  target,
  visible,
  ref,
  onStatus,
}: BrowserSurfaceProps): ReactNode {
  const view = useRef<NativeBrowserCommands>(null);
  const retired = useProjectionRetired(target, onStatus);
  useImperativeHandle(ref, () => browserHandle(view, target));
  if (retired) return <View style={STYLES.page} />;
  return (
    <BoundNativeBrowser key={nativeSourceKey(target)} {...{ target, visible, onStatus, view }} />
  );
}

function BoundNativeBrowser({
  target,
  visible,
  onStatus,
  view,
}: Pick<BrowserSurfaceProps, 'target' | 'visible' | 'onStatus'> & {
  readonly view: RefObject<NativeBrowserCommands | null>;
}): ReactNode {
  const displayed = useBrowserDisplayed(visible);
  return (
    <NativeBrowser
      ref={view}
      {...nativeSource(target)}
      displayed={displayed}
      style={visible ? STYLES.page : [STYLES.page, STYLES.hidden]}
      onStatus={(event) => {
        onStatus(nativeBrowserStatus(event, target.id));
      }}
    />
  );
}

export function nativeSourceKey(target: BrowserTarget): string {
  return JSON.stringify(nativeSource(target));
}

function nativeSource(target: BrowserTarget): NativeBrowserSource {
  if (target.kind === 'project')
    return {
      projection: JSON.stringify({ projectionId: target.projectionId, browserId: target.id }),
    };
  return { target: JSON.stringify(target) };
}

export function browserHandle(
  view: RefObject<NativeBrowserCommands | null>,
  target: BrowserTarget,
): BrowserHandle {
  const run = (command: (native: NativeBrowserCommands) => Promise<void>): void => {
    const native = view.current;
    if (native !== null)
      command(native).catch((cause: unknown) => {
        log.error('browser.command_failed', cause, { browserId: target.id });
      });
  };
  return {
    navigate: (url): void => {
      if (browserAllows(target, url))
        run((native) => native.navigate(url));
    },
    back: (): void => {
      run((native) => native.back());
    },
    forward: (): void => {
      run((native) => native.forward());
    },
    reload: (): void => {
      run((native) => native.reload());
    },
    stop: (): void => {
      run((native) => native.stop());
    },
  };
}

function useProjectionRetired(
  target: BrowserTarget,
  onStatus: BrowserSurfaceProps['onStatus'],
): boolean {
  const [retired, setRetired] = useState(
    () => target.kind === 'project' && !nativeHtmlCurrent(target.projectionId),
  );
  const receive = useEffectEvent(onStatus);
  useEffect(() => {
    if (target.kind !== 'project') return undefined;
    const retire = (): void => {
      setRetired(true);
      receive({
        id: target.id,
        url: '',
        loading: false,
        back: false,
        forward: false,
        problem: BROWSER_RETIRED_PROBLEM,
      });
    };
    const stop = onNativeHtmlRetired((id) => {
      if (id === target.projectionId) retire();
    });
    if (!nativeHtmlCurrent(target.projectionId)) retire();
    return stop;
  }, [target]);
  return retired;
}
