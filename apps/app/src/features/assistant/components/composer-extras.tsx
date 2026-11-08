import type { ReactNode } from 'react';
import { useEffect, useEffectEvent, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { Icon } from '../../../components/icon';
import { Tooltip } from '../../../components/tooltip';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useIdiom } from '../../../design/platform';
import { mediumTap } from '../../../platform/haptics';
import { PickerMissingError, pickFiles, type PickSource } from '../../../platform/pick-files';
import { attachFiles } from '../data/uploads';
import type { Quote } from '../model/composer-state';
import { HoldChannel } from '../voice-message/recorder-hold';
import { holdGesture } from '../voice-message/recorder-hold-gesture';
import { VoiceSession, type SessionMode } from '../voice-message/recorder-session';
import { claimVoiceMessage, watchVoiceRequests } from '../voice-message/voice-request';
import { ComposerChip } from './composer-chip';

function pick(source: PickSource): void {
  pickFiles(source).then(attachFiles, (error: unknown) => {
    if (error instanceof PickerMissingError) {
      notify({ message: error.message, tone: 'critical' });
      return;
    }
    notify({ message: 'Couldn’t open the picker', error, tone: 'critical' });
  });
}

const ATTACH_ITEMS: readonly MenuItem[] = [
  {
    label: 'Take a photo',
    icon: 'camera',
    onPress: (): void => {
      pick('camera');
    },
  },
  {
    label: 'Photos',
    icon: 'image',
    onPress: (): void => {
      pick('photos');
    },
  },
  {
    label: 'Files',
    icon: 'fileText',
    onPress: (): void => {
      pick('files');
    },
  },
];

export function AttachButton({
  disabled,
  reason,
}: {
  readonly disabled: boolean;
  readonly reason: string | null;
}): ReactNode {
  const label = disabled && reason !== null ? `Attach is unavailable. ${reason}` : 'Attach';
  const pointer = useIdiom() === 'pointer';
  const [hovered, setHovered] = useState(false);
  const { ref, open, menu } = useAnchoredMenu(ATTACH_ITEMS, 'Attach');
  return (
    <View
      ref={ref}
      collapsable={false}
      className="relative"
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
    >
      <IconButton icon="plus" label={label} onPress={open} disabled={disabled} />
      {pointer && hovered ? <Tooltip text={label} placement="above" /> : null}
      {menu}
    </View>
  );
}

function useQueuedSend(onSend: () => void): () => void {
  const [requests, setRequests] = useState(0);
  const send = useEffectEvent(onSend);
  useEffect(() => {
    if (requests > 0) send();
  }, [requests]);
  return () => {
    setRequests((count) => count + 1);
  };
}

interface VoiceButtonProps {
  readonly draftKey: string;
  readonly disabled: boolean;
  readonly onSend: () => void;
}

function useVoiceRequest(
  draftKey: string,
  disabled: boolean,
  begin: (mode: SessionMode) => void,
): void {
  const claim = useEffectEvent((): void => {
    if (!claimVoiceMessage(draftKey)) return;
    if (disabled) {
      notify({ message: 'A voice message cannot be sent in this chat.', tone: 'critical' });
      return;
    }
    begin('sheet');
  });
  useEffect(() => {
    claim();
    return watchVoiceRequests(claim);
  }, [draftKey]);
}

function useVoiceButton({ draftKey, disabled, onSend }: VoiceButtonProps): {
  readonly session: ReactNode;
  readonly hold: ReturnType<typeof holdGesture>;
  readonly open: () => void;
  readonly place: (event: LayoutChangeEvent) => void;
} {
  const [mode, setMode] = useState<SessionMode | null>(null);
  const [micOffset, setMicOffset] = useState(0);
  const [channel] = useState(() => new HoldChannel());
  const queueSend = useQueuedSend(onSend);
  const touch = useIdiom() !== 'pointer';
  const begin = (next: SessionMode): void => {
    mediumTap();
    setMode(next);
  };
  useVoiceRequest(draftKey, disabled, begin);
  return {
    session:
      mode === null ? null : (
        <VoiceSession
          mode={mode}
          micOffset={micOffset}
          channel={channel}
          onMode={setMode}
          onSend={queueSend}
        />
      ),
    hold: holdGesture({
      enabled: touch && !disabled && mode === null,
      micOffset,
      channel,
      onBegin: () => {
        begin('hold');
      },
      onLost: () => {
        setMode(null);
      },
    }),
    open: (): void => {
      begin('sheet');
    },
    place: (event): void => {
      setMicOffset(event.nativeEvent.layout.x);
    },
  };
}

export function VoiceMessageButton(props: VoiceButtonProps): ReactNode {
  const { session, hold, open, place } = useVoiceButton(props);
  return (
    <View className="relative" onLayout={place}>
      <GestureDetector gesture={hold}>
        <View collapsable={false}>
          <IconButton
            icon="mic"
            label="Voice message"
            tooltip="above"
            disabled={props.disabled}
            onPress={open}
          />
        </View>
      </GestureDetector>
      {session}
    </View>
  );
}

export function ExpandButton({ onPress }: { readonly onPress: () => void }): ReactNode {
  return <IconButton icon="maximize" label="Open the full editor" onPress={onPress} />;
}

export function QuoteChip({
  quote,
  onRemove,
}: {
  readonly quote: Quote;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <View className="items-start gap-1 px-1">
      <ComposerChip
        leading={<Icon name="reply" size={16} />}
        label={
          quote.helperChatId === undefined ? `Quoting ${quote.who}` : `Replying to @${quote.who}`
        }
        removeLabel="Remove the quote"
        onRemove={onRemove}
      />
      {quote.helperChatId === undefined ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {quote.text}
        </Text>
      )}
    </View>
  );
}
