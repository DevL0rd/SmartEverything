import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { ASSISTANT_TEXT_MAX } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { Tooltip } from '../../../components/tooltip';
import { notify } from '../../../components/toast-store';
import { useIdiom } from '../../../design/platform';
import { count } from '../../../format/number';
import { PickerMissingError, pickFiles, type PickSource } from '../../../platform/pick-files';
import { attachFiles } from '../data/uploads';
import type { Quote } from '../model/composer-state';

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

export function AttachButton({ disabled }: { readonly disabled: boolean }): ReactNode {
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
      <IconButton icon="plus" label="Attach" onPress={open} disabled={disabled} />
      {pointer && hovered ? <Tooltip text="Attach" placement="above" /> : null}
      {menu}
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
    <View className="mx-1 mt-1 flex-row items-center gap-1 overflow-hidden rounded-lg border-l-2 border-primary bg-surface-3 pl-3">
      <View className="min-w-0 flex-1 py-1">
        <Text variant="caption" tone="primary">
          {`Quoting ${quote.who}`}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {quote.text}
        </Text>
      </View>
      <IconButton icon="close" label="Remove the quote" onPress={onRemove} />
    </View>
  );
}

export function Counter({ length }: { readonly length: number }): ReactNode {
  const full = length >= ASSISTANT_TEXT_MAX;
  return (
    <Text
      variant="caption"
      tone={full ? 'critical' : 'variant'}
      numberOfLines={1}
      className="tabular"
      accessibilityLiveRegion="polite"
    >
      {`${count(length)} / ${count(ASSISTANT_TEXT_MAX)}`}
    </Text>
  );
}
