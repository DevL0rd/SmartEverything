import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';

type RoundLook = 'tonal' | 'critical' | 'primary';

const FRAME: Readonly<Record<RoundLook, string>> = {
  tonal: 'size-10 bg-surface-2',
  critical: 'size-10 bg-critical/16',
  primary: 'size-11 bg-primary',
};

const TONE = { tonal: 'default', critical: 'critical', primary: 'onPrimary' } as const;

interface RoundProps {
  readonly icon: IconName;
  readonly label: string;
  readonly look: RoundLook;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}

function RoundButton({ icon, label, look, onPress, disabled = false }: RoundProps): ReactNode {
  return (
    <Interactive
      label={label}
      onPress={onPress}
      disabled={disabled}
      onTone={look === 'primary' ? 'primary' : 'surface'}
      className={cn('shrink-0 items-center justify-center rounded-full', FRAME[look])}
      layerClassName="rounded-full"
    >
      <Icon name={icon} size={look === 'primary' ? 20 : 18} tone={TONE[look]} />
    </Interactive>
  );
}

function SendButton({
  sending,
  disabled,
  onPress,
}: {
  readonly sending: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const ink = useColour('on-primary');
  if (sending) {
    return (
      <View className="size-11 items-center justify-center rounded-full bg-primary">
        <ActivityIndicator size="small" color={ink} accessibilityLabel="Sending voice message" />
      </View>
    );
  }
  return (
    <RoundButton
      icon="arrowUp"
      label="Send voice message"
      look="primary"
      onPress={onPress}
      disabled={disabled}
    />
  );
}

export interface LiveControlsProps {
  readonly paused: boolean;
  readonly ready: boolean;
  readonly sending: boolean;
  readonly onDelete: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onStop: () => void;
  readonly onSend: () => void;
}

export function LiveControls(props: LiveControlsProps): ReactNode {
  const busy = !props.ready || props.sending;
  return (
    <View className="flex-row items-center justify-between px-4 pb-3.5">
      <RoundButton icon="trash" label="Delete recording" look="tonal" onPress={props.onDelete} />
      {props.paused ? (
        <RoundButton
          icon="mic"
          label="Resume recording"
          look="critical"
          onPress={props.onResume}
          disabled={busy}
        />
      ) : (
        <RoundButton
          icon="pause"
          label="Pause recording"
          look="tonal"
          onPress={props.onPause}
          disabled={busy}
        />
      )}
      <RoundButton
        icon="square"
        label="Stop and listen"
        look="tonal"
        onPress={props.onStop}
        disabled={busy}
      />
      <SendButton sending={props.sending} disabled={!props.ready} onPress={props.onSend} />
    </View>
  );
}

function TonalPill({
  text,
  label,
  onPress,
}: {
  readonly text: string;
  readonly label: string;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={label}
      onPress={onPress}
      onTone="surface"
      className="h-9 shrink-0 items-center justify-center rounded-full bg-surface-2 px-3.5"
      layerClassName="rounded-full"
    >
      <Text variant="label" numberOfLines={1}>
        {text}
      </Text>
    </Interactive>
  );
}

export interface PreviewControlsProps {
  readonly sending: boolean;
  readonly onDelete: () => void;
  readonly onAgain: () => void;
  readonly onAttach: () => void;
  readonly onSend: () => void;
}

export function PreviewControls(props: PreviewControlsProps): ReactNode {
  if (props.sending) {
    return (
      <View className="flex-row items-center justify-end px-4 pb-3.5">
        <SendButton sending disabled onPress={props.onSend} />
      </View>
    );
  }
  return (
    <View className="flex-row items-center justify-between gap-2 px-4 pb-3.5">
      <RoundButton icon="trash" label="Delete recording" look="tonal" onPress={props.onDelete} />
      <View className="flex-row items-center gap-2">
        <TonalPill text="Again" label="Record again" onPress={props.onAgain} />
        <TonalPill text="Add to message" label="Add to message" onPress={props.onAttach} />
      </View>
      <SendButton sending={false} disabled={false} onPress={props.onSend} />
    </View>
  );
}
