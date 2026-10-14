import { requireNativeView } from 'expo';
import { useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { browserAllows } from '@smarteverything/domain';
import { nativeBrowserStatus, type NativeBrowserEvent } from './browser-native-events';
import { nativeBrowserDiagnostic } from './browser-diagnostics-events';
import { useBrowserDisplayed } from './browser-displayed';
import type { BrowserSurfaceProps } from './browser-contract';
interface NativeBrowserProps {
  readonly target: string;
  readonly command?: string;
  readonly displayed: boolean;
  readonly style: StyleProp<ViewStyle>;
  readonly onStatus: (event: NativeBrowserEvent) => void;
  readonly onDiagnostic: (event: { readonly nativeEvent: unknown }) => void;
}
const NativeBrowser = requireNativeView<NativeBrowserProps>('HubNetwork');
const STYLES = StyleSheet.create({ page: { flex: 1 } });
export function NativeBrowserSurface({
  target,
  ref,
  onStatus,
  visible,
}: BrowserSurfaceProps): ReactNode {
  const sequence = useRef(0);
  const initial = useRef(true);
  const displayed = useBrowserDisplayed(visible);
  const [command, setCommand] = useState<string>();
  const act = (action: string, url?: string): void => {
    setCommand(
      JSON.stringify({
        sequence: ++sequence.current,
        action,
        ...(url === undefined ? {} : { url }),
      }),
    );
  };
  useImperativeHandle(ref, () => ({
    navigate: (url): void => {
      if (browserAllows(target, url)) act('navigate', url);
    },
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
  return (
    <NativeBrowser
      target={JSON.stringify(target)}
      displayed={displayed}
      {...(command === undefined ? {} : { command })}
      style={STYLES.page}
      onDiagnostic={receiveNativeDiagnostic}
      onStatus={(event) => {
        receiveNativeStatus(event, { target, onStatus, act, initial });
      }}
    />
  );
}

function receiveNativeStatus(
  event: NativeBrowserEvent,
  context: {
    readonly target: BrowserSurfaceProps['target'];
    readonly onStatus: BrowserSurfaceProps['onStatus'];
    readonly act: (action: string, url?: string) => void;
    readonly initial: { current: boolean };
  },
): void {
  const status = nativeBrowserStatus(event, context.target.id);
  context.onStatus(status);
  if (status.loading || !context.initial.current || status.problem !== null) return;
  const initial = context.initial;
  initial.current = false;
  if (context.target.kind !== 'preview') return;
  const wanted = new URL(context.target.initialPath, context.target.origin).href;
  if (status.url !== wanted) context.act('navigate', wanted);
}

function receiveNativeDiagnostic(event: { readonly nativeEvent: unknown }): void {
  nativeBrowserDiagnostic(event.nativeEvent);
}
