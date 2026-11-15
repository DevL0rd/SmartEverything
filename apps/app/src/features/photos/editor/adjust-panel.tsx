import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { PhotoRecipe } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { FilterChip } from '../../../components/filter-chip';
import { HScroller } from '../../../components/h-scroller';
import { Segmented } from '../../../components/segmented';
import { Slider } from '../../../components/slider';
import {
  COLOUR_KEYS,
  LIGHT_KEYS,
  SLIDER_LABELS,
  adjustReset,
  chipLabel,
  signed,
  adjustValue,
  adjusted,
  sameRecipe,
  type AdjustKey,
} from './recipe-ops';
import { SliderHead } from './slider-head';
import type { PhotoEditor } from './use-photo-editor';

type Group = 'light' | 'colour';

type Key = AdjustKey;

const GROUPS = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'colour', label: 'Colour', icon: 'palette' },
] as const;

function KeyRow({
  keys,
  chosen,
  recipe,
  onChoose,
}: {
  readonly keys: readonly Key[];
  readonly chosen: Key;
  readonly recipe: PhotoRecipe;
  readonly onChoose: (key: Key) => void;
}): ReactNode {
  return (
    <HScroller label="What to adjust" fade>
      <View className="flex-row items-center gap-2 px-4">
        {keys.map((key) => (
          <FilterChip
            key={key}
            label={SLIDER_LABELS[key]}
            value={chipLabel(key, adjustValue(recipe, key))}
            active={key === chosen}
            singleChoice
            onPress={() => {
              onChoose(key);
            }}
          />
        ))}
      </View>
    </HScroller>
  );
}

function ResetAdjust({ editor }: { readonly editor: PhotoEditor }): ReactNode {
  const recipe = editor.committed;
  return (
    <Button
      label="Reset"
      icon="reset"
      variant="text"
      disabled={sameRecipe(adjustReset(recipe), recipe)}
      onPress={() => {
        editor.commit(adjustReset(recipe));
      }}
    />
  );
}

export function AdjustPanel({ editor }: { readonly editor: PhotoEditor }): ReactNode {
  const [group, setGroup] = useState<Group>('light');
  const [chosen, setChosen] = useState<Key>('exposure');
  const keys: readonly Key[] = group === 'light' ? LIGHT_KEYS : COLOUR_KEYS;
  const recipe = editor.committed;
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2 px-4">
        <View className="flex-1">
          <Segmented
            label="Adjust"
            options={GROUPS}
            value={group}
            fill
            onChange={(next) => {
              setGroup(next);
              setChosen(next === 'light' ? 'exposure' : 'saturation');
            }}
          />
        </View>
        <ResetAdjust editor={editor} />
      </View>
      <KeyRow keys={keys} chosen={chosen} recipe={editor.recipe} onChoose={setChosen} />
      <View className="gap-1 px-4">
        <SliderHead
          label={SLIDER_LABELS[chosen]}
          value={signed(adjustValue(editor.recipe, chosen))}
        />
        <Slider
          label={SLIDER_LABELS[chosen]}
          value={adjustValue(editor.recipe, chosen)}
          min={-100}
          max={100}
          step={1}
          formatValue={signed}
          onChange={(value) => {
            editor.draft(adjusted(recipe, chosen, value));
          }}
          onCommit={(value) => {
            editor.commit(adjusted(recipe, chosen, value));
          }}
          onCancel={editor.cancelDraft}
        />
      </View>
    </View>
  );
}
