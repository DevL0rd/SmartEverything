import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { Icon } from '../../../components/icon';
import { Tooltip } from '../../../components/tooltip';
import { notify } from '../../../components/toast-store';
import { useIdiom } from '../../../design/platform';
import { PickerMissingError, pickFiles, type PickSource } from '../../../platform/pick-files';
import { attachFiles } from '../data/uploads';
import type { Quote } from '../model/composer-state';
import { VoiceMessageSheet } from '../voice-message/voice-message-sheet';
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

function attachItems(recordVoice: () => void): readonly MenuItem[] {
  return [...ATTACH_ITEMS, { label: 'Voice message', icon: 'mic', onPress: recordVoice }];
}

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
  const [recording, setRecording] = useState(false);
  const items = useMemo(
    () =>
      attachItems(() => {
        setRecording(true);
      }),
    [],
  );
  const { ref, open, menu } = useAnchoredMenu(items, 'Attach');
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
      {recording ? (
        <VoiceMessageSheet
          open
          onClose={() => {
            setRecording(false);
          }}
        />
      ) : null}
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
    <View className="px-1">
      <ComposerChip
        leading={<Icon name="reply" size={16} />}
        label={`Quoting ${quote.who}`}
        removeLabel="Remove the quote"
        onRemove={onRemove}
      />
    </View>
  );
}
