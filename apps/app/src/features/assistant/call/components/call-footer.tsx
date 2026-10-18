import type { ReactNode, RefObject } from 'react';
import { View } from 'react-native';
import { href } from '../../../../app-shell/hrefs';
import { Button } from '../../../../components/button';
import { callActive, changeCall, type CallView } from '../call-state';
import { callEngine } from '../engine/engine';
import { endStateOf, type EndAction } from '../model/call-end';
import type { CallLayout } from '../model/call-layout';
import type { CallControlHandlers, ControlReasons } from '../model/call-controls';
import { ControlBar } from './control-bar';

export interface CallFooterProps {
  readonly call: CallView;
  readonly name: string;
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

function EndButton({
  action,
  primary,
  onAgain,
  onClose,
}: {
  readonly action: EndAction;
  readonly primary: boolean;
  readonly onAgain: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const look = {
    label: action.label,
    size: 'lg',
    variant: primary ? 'filled' : 'tonal',
    grow: !primary,
    ...(action.icon === undefined ? {} : { icon: action.icon }),
  } as const;
  switch (action.id) {
    case 'settings':
      return <Button {...look} href={href.settings.assistant()} />;
    case 'microphone':
      return (
        <Button
          {...look}
          onPress={() => {
            allowThenCall(onAgain);
          }}
        />
      );
    case 'again':
      return <Button {...look} onPress={onAgain} />;
    case 'leave':
      return <Button {...look} onPress={onClose} />;
  }
}

function EndedActions({
  call,
  name,
  onAgain,
  onClose,
}: Pick<CallFooterProps, 'call' | 'name' | 'onAgain' | 'onClose'>): ReactNode {
  const end = endStateOf(call, name);
  return (
    <View className="w-full max-w-call gap-3 self-center">
      <EndButton action={end.primary} primary onAgain={onAgain} onClose={onClose} />
      <View className="flex-row gap-3">
        {end.secondary.map((action) => (
          <EndButton
            key={action.id}
            action={action}
            primary={false}
            onAgain={onAgain}
            onClose={onClose}
          />
        ))}
      </View>
    </View>
  );
}

export function CallFooter({ onAgain, onClose, name, ...bar }: CallFooterProps): ReactNode {
  if (!callActive(bar.call)) {
    return <EndedActions call={bar.call} name={name} onAgain={onAgain} onClose={onClose} />;
  }
  return <ControlBar {...bar} />;
}
