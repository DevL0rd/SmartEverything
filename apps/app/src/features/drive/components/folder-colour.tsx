import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveFolderColour, DriveItem } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Sheet } from '../../../components/sheet';
import { Tap } from '../../../components/tap';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useFolderColourSet } from '../data';
import {
  colourChoicesOf,
  NO_COLOUR_LABEL,
  type ColourChoice,
} from '../../../components/files/folder-glyph-model';

type Folder = Extract<DriveItem, { readonly kind: 'folder' }>;

const DOT: Readonly<Record<DriveFolderColour, string>> = {
  'viz-1': 'bg-viz-1',
  'viz-2': 'bg-viz-2',
  'viz-3': 'bg-viz-3',
  'viz-4': 'bg-viz-4',
  'viz-5': 'bg-viz-5',
  'viz-6': 'bg-viz-6',
  'viz-7': 'bg-viz-blue',
  'viz-8': 'bg-viz-magenta',
};

function Ring({
  selected,
  children,
}: {
  readonly selected: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      className={cn(
        'aspect-square w-full max-w-10 items-center justify-center rounded-full border-2 p-0.5',
        selected ? 'border-on-surface' : 'border-transparent',
      )}
    >
      {children}
    </View>
  );
}

function Swatch({
  label,
  selected,
  disabled,
  onPick,
  children,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPick: () => void;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Tap
      label={label}
      role="radio"
      checked={selected}
      disabled={disabled}
      className="h-11 min-w-0 flex-1 items-center justify-center px-0.5"
      onPress={onPick}
    >
      <Ring selected={selected}>{children}</Ring>
    </Tap>
  );
}

function ColourDot({ choice }: { readonly choice: ColourChoice }): ReactNode {
  return (
    <View className={cn('size-full items-center justify-center rounded-full', DOT[choice.colour])}>
      {choice.selected ? <Icon name="check" size={16} colour="bg" /> : null}
    </View>
  );
}

function NoColourDot(): ReactNode {
  return (
    <View className="size-full items-center justify-center overflow-hidden rounded-full border border-outline bg-surface-2">
      <View className="h-0.5 w-14 -rotate-45 bg-on-surface-variant" />
    </View>
  );
}

export interface FolderColourRowProps {
  readonly folder: Folder;
  readonly disabled?: boolean;
}

export function FolderColourRow({ folder, disabled = false }: FolderColourRowProps): ReactNode {
  const set = useFolderColourSet();
  const [chosen, setChosen] = useState(folder.colour);
  const choices = colourChoicesOf(chosen);
  const pick = (colour: DriveFolderColour | null): void => {
    if (colour === chosen) return;
    setChosen(colour);
    set.run({ itemId: folder.id, colour });
  };
  const off = disabled || set.busy;
  return (
    <View className="gap-2">
      <View role="radiogroup" aria-label="Folder colour" className="flex-row">
        <Swatch
          label={NO_COLOUR_LABEL}
          selected={chosen === null}
          disabled={off}
          onPick={() => {
            pick(null);
          }}
        >
          <NoColourDot />
        </Swatch>
        {choices.map((choice) => (
          <Swatch
            key={choice.colour}
            label={choice.label}
            selected={choice.selected}
            disabled={off}
            onPick={() => {
              pick(choice.colour);
            }}
          >
            <ColourDot choice={choice} />
          </Swatch>
        ))}
      </View>
      <Text variant="footnote" tone="variant">
        Only you see this colour.
      </Text>
      {set.problem === null ? null : (
        <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
          {set.problem}
        </Text>
      )}
    </View>
  );
}

export function FolderColourSheet({
  folder,
  onClose,
}: {
  readonly folder: Folder | null;
  readonly onClose: () => void;
}): ReactNode {
  if (folder === null) return null;
  return (
    <Sheet open onClose={onClose} title={`Colour for ${folder.name}`} detents={['fit']}>
      <FolderColourRow folder={folder} />
    </Sheet>
  );
}
