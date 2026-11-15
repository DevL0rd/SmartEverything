import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { FilterChip } from '../../../components/filter-chip';
import { HScroller } from '../../../components/h-scroller';
import { Slider } from '../../../components/slider';
import { ASPECTS, ASPECT_LABELS, presetBox, ratioOf, type Aspect } from './crop-model';
import {
  cropped,
  geometryReset,
  mirrored,
  rotatedClockwise,
  sameRecipe,
  straightened,
} from './recipe-ops';
import { SliderHead } from './slider-head';
import type { PhotoEditor } from './use-photo-editor';

export interface CropPanelProps {
  readonly editor: PhotoEditor;
  readonly aspect: Aspect;
  readonly imageRatio: number;
  readonly onAspect: (aspect: Aspect) => void;
}

function degrees(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}°`;
}

function AspectRow(props: CropPanelProps): ReactNode {
  const { editor } = props;
  return (
    <HScroller label="Aspect ratio" fade>
      <View className="flex-row items-center gap-2 px-4">
        {ASPECTS.map((aspect) => (
          <FilterChip
            key={aspect}
            label="Aspect ratio"
            value={ASPECT_LABELS[aspect]}
            active={props.aspect === aspect}
            singleChoice
            onPress={() => {
              props.onAspect(aspect);
              const ratio = ratioOf(aspect, props.imageRatio);
              if (ratio !== null) {
                editor.commit(cropped(editor.committed, presetBox(ratio, props.imageRatio)));
              }
            }}
          />
        ))}
      </View>
    </HScroller>
  );
}

function StraightenSlider({ editor }: { readonly editor: PhotoEditor }): ReactNode {
  const recipe = editor.committed;
  return (
    <View className="gap-1 px-4">
      <SliderHead label="Straighten" value={degrees(editor.recipe.straighten)} />
      <Slider
        label="Straighten"
        value={editor.recipe.straighten}
        min={-45}
        max={45}
        step={0.5}
        formatValue={degrees}
        onChange={(value) => {
          editor.draft(straightened(recipe, value));
        }}
        onCommit={(value) => {
          editor.commit(straightened(recipe, value));
        }}
        onCancel={editor.cancelDraft}
      />
    </View>
  );
}

export function CropPanel(props: CropPanelProps): ReactNode {
  const { editor } = props;
  const recipe = editor.committed;
  return (
    <View className="gap-3">
      <AspectRow {...props} />
      <View className="flex-row flex-wrap items-center gap-2 px-4">
        <Button
          label="Rotate"
          icon="refresh"
          variant="tonal"
          onPress={() => {
            editor.commit(rotatedClockwise(recipe));
          }}
        />
        <Button
          label="Flip"
          icon="split"
          variant="tonal"
          onPress={() => {
            editor.commit(mirrored(recipe));
          }}
        />
        <Button
          label="Reset"
          icon="reset"
          variant="text"
          disabled={sameRecipe(geometryReset(recipe), recipe)}
          onPress={() => {
            props.onAspect('free');
            editor.commit(geometryReset(recipe));
          }}
        />
      </View>
      <StraightenSlider editor={editor} />
    </View>
  );
}
