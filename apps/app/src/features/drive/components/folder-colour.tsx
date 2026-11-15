import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveFolderColour, DriveItem } from '@smarteverything/domain';
import { Button } from '../../../components/button';
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

function Dot({ colour }: { readonly colour: DriveFolderColour }): ReactNode {
  return <View className={cn('size-7 rounded-full', DOT[colour])} />;
}

function Swatch({
  choice,
  disabled,
  onPick,
}: {
  readonly choice: ColourChoice;
  readonly disabled: boolean;
  readonly onPick: (colour: DriveFolderColour) => void;
}): ReactNode {
  return (
    <Tap
      label={choice.label}
      role="radio"
      checked={choice.selected}
      disabled={disabled}
      className="h-11 min-w-11 max-w-14 flex-1 items-center justify-center"
      onPress={() => {
        onPick(choice.colour);
      }}
    >
      <View
        className={cn(
          'size-10 items-center justify-center rounded-full border-2',
          choice.selected ? 'border-on-surface' : 'border-transparent',
        )}
      >
        <Dot colour={choice.colour} />
        {choice.selected ? (
          <View className="absolute inset-0 items-center justify-center">
            <Icon name="check" size={16} colour="bg" />
          </View>
        ) : null}
      </View>
    </Tap>
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
      <View role="radiogroup" aria-label="Folder colour" className="flex-row flex-wrap">
        {choices.map((choice) => (
          <Swatch key={choice.colour} choice={choice} disabled={off} onPick={pick} />
        ))}
      </View>
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
          Only you see this colour.
        </Text>
        <Button
          label={NO_COLOUR_LABEL}
          variant="text"
          disabled={off || chosen === null}
          onPress={() => {
            pick(null);
          }}
        />
      </View>
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
