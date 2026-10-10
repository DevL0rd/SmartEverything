import type { ReactNode, RefObject } from 'react';
import { View } from 'react-native';
import { VOICE_KEY_MISSING } from '@smarteverything/domain';
import { href } from '../../../../app-shell/hrefs';
import { Button } from '../../../../components/button';
import { callActive, changeCall, type CallView } from '../call-state';
import { callEngine } from '../engine/engine';
import type { CallLayout } from '../model/call-layout';
import type { CallControlHandlers, ControlReasons } from '../model/call-controls';
import { ControlBar } from './control-bar';

export interface CallFooterProps {
  readonly call: CallView;
  readonly layout: CallLayout;
  readonly reasons: ControlReasons;
  readonly handlers: CallControlHandlers;
  readonly cameraAnchor: RefObject<View | null>;
  readonly shareAnchor: RefObject<View | null>;
  readonly settingsOpen: boolean;
  readonly menu: 'camera' | 'share' | null;
  readonly onAgain: () => void;
  readonly onClose: () => void;
}

function allowThenCall(onAgain: () => void): void {
  callEngine.allowMicrophone().then(
    (allowed) => {
      if (allowed) {
        onAgain();
      }
    },
    () => {
      changeCall(() => ({ problem: 'The microphone settings didn’t open' }));
    },
  );
}

function EndedActions({
  call,
  onAgain,
  onClose,
}: Pick<CallFooterProps, 'call' | 'onAgain' | 'onClose'>): ReactNode {
  const microphone = call.fix === 'microphone';
  const needsKey = call.problem === VOICE_KEY_MISSING;
  return (
    <View className="w-full max-w-call gap-3 self-center">
      {needsKey ? (
        <Button label="Open settings" icon="settings" size="lg" href={href.settings.assistant()} />
      ) : null}
      {microphone ? (
        <Button
          label="Allow microphone"
          icon="mic"
          size="lg"
          onPress={() => {
            allowThenCall(onAgain);
          }}
        />
      ) : null}
      <View className="flex-row gap-3">
        <Button label="Close" variant="tonal" size="lg" grow onPress={onClose} />
        <Button
          label="Call again"
          icon="phone"
          variant={microphone || needsKey ? 'tonal' : 'filled'}
          size="lg"
          grow
          onPress={onAgain}
        />
      </View>
    </View>
  );
}

export function CallFooter({ onAgain, onClose, ...bar }: CallFooterProps): ReactNode {
  if (!callActive(bar.call)) {
    return <EndedActions call={bar.call} onAgain={onAgain} onClose={onClose} />;
  }
  return <ControlBar {...bar} />;
}
