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
import { nativeBrowserDiagnostic } from '../../modules/health-connect/src/browser-diagnostics-events';
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
  readonly onDiagnostic: (event: { readonly nativeEvent: unknown }) => void;
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
  const displayed = useBrowserDisplayed(visible);
  const view = useRef<NativeBrowserCommands>(null);
  const initial = useRef(true);
  const retired = useProjectionRetired(target, onStatus);
  useImperativeHandle(ref, () => browserHandle(view, target));
  if (retired) return <View style={STYLES.page} />;
  return (
    <NativeBrowser
      ref={view}
      {...nativeSource(target)}
      displayed={displayed}
      style={visible ? STYLES.page : [STYLES.page, STYLES.hidden]}
      onDiagnostic={(event) => {
        nativeBrowserDiagnostic(event.nativeEvent);
      }}
      onStatus={(event) => {
        receiveStatus(event, { target, onStatus, view, initial });
      }}
    />
  );
}

function nativeSource(target: BrowserTarget): NativeBrowserSource {
  if (target.kind === 'native-html')
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
      if (target.kind !== 'native-html' && browserAllows(target, url))
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

function receiveStatus(
  event: NativeBrowserEvent,
  context: {
    readonly target: BrowserTarget;
    readonly onStatus: BrowserSurfaceProps['onStatus'];
    readonly view: RefObject<NativeBrowserCommands | null>;
    readonly initial: { current: boolean };
  },
): void {
  const { target, onStatus, view, initial } = context;
  const status = nativeBrowserStatus(event, target.id);
  onStatus(status);
  if (status.loading || !initial.current || status.problem !== null) return;
  initial.current = false;
  if (target.kind !== 'preview') return;
  const wanted = new URL(target.initialPath, target.origin).href;
  if (status.url !== wanted) browserHandle(view, target).navigate(wanted);
}

function useProjectionRetired(
  target: BrowserTarget,
  onStatus: BrowserSurfaceProps['onStatus'],
): boolean {
  const [retired, setRetired] = useState(
    () => target.kind === 'native-html' && !nativeHtmlCurrent(target.projectionId),
  );
  const receive = useEffectEvent(onStatus);
  useEffect(() => {
    if (target.kind !== 'native-html') return undefined;
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
