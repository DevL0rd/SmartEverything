import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { PHOTO_FILTERS, type PhotoFilter } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Interactive } from '../../../components/interactive';
import { Slider } from '../../../components/slider';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { coverTile, shownView } from './canvas-view';
import type { Size } from './geometry';
import PhotoCanvas from './photo-canvas';
import { FILTER_LABELS, withFilter, withFilterStrength } from './recipe-ops';
import { SliderHead } from './slider-head';
import type { PhotoEditor } from './use-photo-editor';

const log = new Logger('app.photos');

export const TILE_WIDTH = 96;

export const TILE_HEIGHT = 72;

export const TILE_GAP = 8;

const CHOICES: readonly (PhotoFilter | null)[] = [null, ...PHOTO_FILTERS];

const CAPTION_ROOM = 24;

const INSET = 16;

const TILE = { width: TILE_WIDTH, height: TILE_HEIGHT } as const;

function labelOf(preset: PhotoFilter | null): string {
  return preset === null ? 'None' : FILTER_LABELS[preset];
}

function percentText(value: number): string {
  return `${String(Math.round(value))}%`;
}

export function stripWidth(count: number): number {
  return count * TILE_WIDTH + (count - 1) * TILE_GAP;
}

export interface FilterGrid {
  readonly columns: number;
  readonly rows: number;
}

export function filterGridOf(width: number | null): FilterGrid {
  const count = CHOICES.length;
  if (width === null) return { columns: count, rows: 1 };
  const columns = Math.max(
    1,
    Math.min(count, Math.floor((width + TILE_GAP) / (TILE_WIDTH + TILE_GAP))),
  );
  return { columns, rows: Math.ceil(count / columns) };
}

const ROW_STEP = TILE_HEIGHT + CAPTION_ROOM + TILE_GAP;

const CANVAS_GRID_GAP = CAPTION_ROOM + TILE_GAP;

function canvasBox(grid: FilterGrid): { readonly width: number; readonly height: number } {
  return {
    width: stripWidth(grid.columns),
    height: grid.rows * TILE_HEIGHT + (grid.rows - 1) * CANVAS_GRID_GAP,
  };
}

function gridBox(grid: FilterGrid): { readonly width: number; readonly height: number } {
  return { width: stripWidth(grid.columns), height: grid.rows * ROW_STEP - TILE_GAP };
}

export function choiceAt(
  index: number,
  columns: number,
): { readonly left: number; readonly top: number; readonly width: number } {
  return {
    left: (index % columns) * (TILE_WIDTH + TILE_GAP),
    top: Math.floor(index / columns) * ROW_STEP,
    width: TILE_WIDTH,
  };
}

function Tiles({
  editor,
  uri,
  source,
  grid,
}: {
  readonly editor: PhotoEditor;
  readonly uri: string;
  readonly source: Size;
  readonly grid: FilterGrid;
}): ReactNode {
  const views = CHOICES.map((preset) =>
    coverTile(
      shownView(withFilter(editor.committed, preset), source, 'result'),
      TILE_WIDTH / TILE_HEIGHT,
    ),
  );
  return (
    <View className="absolute left-0 top-0" style={canvasBox(grid)} pointerEvents="none">
      <PhotoCanvas
        uri={uri}
        patches={editor.patches}
        views={views}
        grid={{ columns: grid.columns, gap: TILE_GAP, rowGap: CANVAS_GRID_GAP }}
        label="Filter previews"
        onStatus={(status, detail) => {
          log.warn('editor.filter_strip_problem', { status, detail });
          return Promise.resolve();
        }}
        onLoaded={() => Promise.resolve()}
        dom={{ style: { width: '100%', height: '100%' }, scrollEnabled: false }}
      />
    </View>
  );
}

function Choice({
  preset,
  index,
  columns,
  selected,
  onPress,
}: {
  readonly preset: PhotoFilter | null;
  readonly index: number;
  readonly columns: number;
  readonly selected: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <View className="absolute" style={choiceAt(index, columns)}>
      <Interactive
        label={`${labelOf(preset)} filter`}
        selected={selected}
        onPress={onPress}
        className="items-center gap-1"
        layerClassName="rounded-md"
      >
        <View
          style={TILE}
          className={cn('rounded-md border-2', selected ? 'border-primary' : 'border-transparent')}
        />
        <Text variant="caption" tone={selected ? 'primary' : 'variant'} numberOfLines={1}>
          {labelOf(preset)}
        </Text>
      </Interactive>
    </View>
  );
}

function Strength({ editor }: { readonly editor: PhotoEditor }): ReactNode {
  const current = editor.committed.filter;
  if (current === null) return null;
  return (
    <View className="gap-1 px-4">
      <SliderHead
        label={`${FILTER_LABELS[current.preset]} strength`}
        value={percentText(editor.recipe.filter?.strength ?? current.strength)}
      />
      <Slider
        label={`${FILTER_LABELS[current.preset]} strength`}
        value={editor.recipe.filter?.strength ?? current.strength}
        min={0}
        max={100}
        step={1}
        formatValue={percentText}
        onChange={(value) => {
          editor.draft(withFilterStrength(editor.committed, value));
        }}
        onCommit={(value) => {
          editor.commit(withFilterStrength(editor.committed, value));
        }}
        onCancel={editor.cancelDraft}
      />
    </View>
  );
}

function Choices({
  editor,
  uri,
  source,
  grid,
}: {
  readonly editor: PhotoEditor;
  readonly uri: string;
  readonly source: Size;
  readonly grid: FilterGrid;
}): ReactNode {
  const current = editor.committed.filter;
  return (
    <View style={gridBox(grid)}>
      <Tiles editor={editor} uri={uri} source={source} grid={grid} />
      {CHOICES.map((preset, index) => (
        <Choice
          key={preset ?? 'none'}
          preset={preset}
          index={index}
          columns={grid.columns}
          selected={(current?.preset ?? null) === preset}
          onPress={() => {
            editor.commit(withFilter(editor.committed, preset));
          }}
        />
      ))}
    </View>
  );
}

function WrappedChoices(props: {
  readonly editor: PhotoEditor;
  readonly uri: string;
  readonly source: Size;
}): ReactNode {
  const [width, setWidth] = useState<number | null>(null);
  return (
    <View
      className="items-center px-4"
      onLayout={(event) => {
        setWidth(Math.max(0, event.nativeEvent.layout.width - INSET * 2));
      }}
    >
      {width === null ? null : <Choices {...props} grid={filterGridOf(width)} />}
    </View>
  );
}

export function FilterPanel({
  editor,
  uri,
  source,
  wrap,
}: {
  readonly editor: PhotoEditor;
  readonly uri: string;
  readonly source: Size;
  readonly wrap: boolean;
}): ReactNode {
  return (
    <View className="gap-3">
      {wrap ? (
        <WrappedChoices editor={editor} uri={uri} source={source} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="px-4"
        >
          <Choices editor={editor} uri={uri} source={source} grid={filterGridOf(null)} />
        </ScrollView>
      )}
      <Strength editor={editor} />
    </View>
  );
}
