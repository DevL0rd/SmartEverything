import {
  onNativeHtmlRetired,
  nativeHtmlCurrent,
} from '../../modules/health-connect/src/html-preview';
import { nativeBrowserDiagnostic } from './browser-diagnostics-events';
import { useBrowserDisplayed } from './browser-displayed';
import { requireNativeView } from 'expo';
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BROWSER_RETIRED_PROBLEM, type BrowserTarget } from '@smarteverything/domain';
import { nativeBrowserStatus, type NativeBrowserEvent } from './browser-native-events';
import type { BrowserSurfaceProps } from './browser-contract';

interface HtmlViewProps {
  readonly projection: string;
  readonly displayed: boolean;
  readonly onDiagnostic: (event: { readonly nativeEvent: unknown }) => void;
  readonly command?: string;
  readonly style: StyleProp<ViewStyle>;
  readonly onStatus: (event: NativeBrowserEvent) => void;
}
const HtmlView = requireNativeView<HtmlViewProps>('HubNetwork');
const STYLES = StyleSheet.create({ page: { flex: 1 }, hidden: { opacity: 0 } });
function projectionOf(target: BrowserTarget): string {
  if (target.kind !== 'native-html') throw new Error('Native HTML view requires its projection.');
  return JSON.stringify({ projectionId: target.projectionId, browserId: target.id });
}
export function NativeHtmlSurface({
  target,
  visible,
  ref,
  onStatus,
}: BrowserSurfaceProps): ReactNode {
  const displayed = useBrowserDisplayed(visible);
  const retired = useHtmlLeaseState(target, onStatus);
  const sequence = useRef(0);
  const [command, setCommand] = useState<string | undefined>(undefined);
  const act = (action: 'back' | 'forward' | 'reload' | 'stop'): void => {
    setCommand(JSON.stringify({ sequence: ++sequence.current, action }));
  };
  useImperativeHandle(ref, () => ({
    navigate: (): void => undefined,
    back: (): void => {
      act('back');
    },
    forward: (): void => {
      act('forward');
    },
    reload: (): void => {
      act('reload');
    },
    stop: (): void => {
      act('stop');
    },
  }));
  if (retired) return <View style={STYLES.page} />;
  return (
    <HtmlView
      projection={projectionOf(target)}
      displayed={displayed}
      onDiagnostic={(event) => {
        nativeBrowserDiagnostic(event.nativeEvent);
      }}
      {...(command === undefined ? {} : { command })}
      style={visible ? STYLES.page : [STYLES.page, STYLES.hidden]}
      onStatus={(event) => {
        onStatus(nativeBrowserStatus(event, target.id));
      }}
    />
  );
}

function useHtmlLeaseState(
  target: BrowserTarget,
  onStatus: BrowserSurfaceProps['onStatus'],
): boolean {
  const [retired, setRetired] = useState(
    () => target.kind !== 'native-html' || !nativeHtmlCurrent(target.projectionId),
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
