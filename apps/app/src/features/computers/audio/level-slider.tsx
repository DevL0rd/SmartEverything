import { useMemo, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { IconButton } from '../../../components/icon-button';
import { Slider } from '../../../components/slider';
import { Text } from '../../../components/text';
import { useStableCallback } from '../../../design/use-stable-callback';
import { decimal } from '../../../format/number';
import { throttledSend } from '../../../store/live-commands';

function percentText(level: number): string {
  return `${decimal(Math.round(level))} %`;
}

interface Held {
  readonly level: number;
  readonly from: number | null;
}

const SEND_INTERVAL_MS = 100;

export interface LevelSliderProps {
  readonly label: string;
  readonly value: number | null;
  readonly max: number;
  readonly disabled: boolean;
  readonly muted: boolean;
  readonly onCommit: (level: number, failed: () => void) => void;
  readonly onUnmute?: () => void;
}

interface Sending {
  readonly preview: (level: number) => void;
  readonly release: (level: number) => void;
}

function useLevelSending(
  props: Pick<LevelSliderProps, 'muted' | 'onCommit' | 'onUnmute'>,
  failed: () => void,
): Sending {
  const unmuted = useRef(false);
  const delivered = useRef<number | null>(null);
  const commit = useStableCallback((level: number): void => {
    if (level === delivered.current) return;
    delivered.current = level;
    props.onCommit(level, failed);
  });
  const unmute = useStableCallback((): void => {
    if (!props.muted || unmuted.current) return;
    unmuted.current = true;
    props.onUnmute?.();
  });
  const send = useMemo(
    () =>
      throttledSend((level) => {
        if (typeof level === 'number') commit(level);
        return Promise.resolve(true);
      }, SEND_INTERVAL_MS),
    [commit],
  );
  return {
    preview: (level): void => {
      unmute();
      background(send(level), 'audio.level_send_failed');
    },
    release: (level): void => {
      unmute();
      unmuted.current = false;
      background(
        send(level).then(() => {
          delivered.current = null;
        }),
        'audio.level_send_failed',
      );
    },
  };
}

export function LevelSlider(props: LevelSliderProps): ReactNode {
  const { label, value, max, disabled, muted } = props;
  const [drag, setDrag] = useState<number | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const sending = useLevelSending(
    props,
    useStableCallback((): void => {
      setHeld(null);
    }),
  );
  const kept = held !== null && held.from === value ? held.level : null;
  const shown = drag ?? kept ?? value;
  return (
    <>
      <View className={muted ? 'min-w-0 flex-1 opacity-50' : 'min-w-0 flex-1'}>
        <Slider
          value={shown === null ? null : Math.min(max, shown)}
          min={0}
          max={max}
          step={1}
          label={label}
          disabled={disabled}
          formatValue={percentText}
          onChange={(level) => {
            setDrag(level);
            sending.preview(level);
          }}
          onCommit={(level) => {
            setDrag(null);
            setHeld({ level, from: value });
            sending.release(level);
          }}
        />
      </View>
      <Text variant="callout" className="tabular w-12 text-right">
        {shown === null ? '--' : percentText(shown)}
      </Text>
    </>
  );
}

export function MuteToggle({
  label,
  muted,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly muted: boolean;
  readonly disabled: boolean;
  readonly onChange: (muted: boolean) => void;
}): ReactNode {
  return (
    <IconButton
      icon={muted ? 'muted' : 'volume'}
      label={muted ? `Unmute ${label}` : `Mute ${label}`}
      variant={muted ? 'tonal' : 'standard'}
      selected={muted}
      disabled={disabled}
      onPress={() => {
        onChange(!muted);
      }}
    />
  );
}
