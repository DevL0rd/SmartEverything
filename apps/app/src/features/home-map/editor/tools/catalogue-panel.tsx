import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { HomeMapObject, ModelCatalogRow, ModelSpec } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { IconButton } from '../../../../components/icon-button';
import { Interactive } from '../../../../components/interactive';
import { SwitchRow } from '../../../../components/rows';
import { SearchField } from '../../../../components/search-field';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import { cn } from '../../../../design/cn';
import { categoryLabel } from '../../../../format/text';
import { ModelVisual, useModelSpecs, type ModelAssetState } from '../../../models';
import { objectTitle } from '../list-editor/objects-devices-model';
import { ObjectEdit } from '../inspector/object-edit';
import type { Manipulation } from '../manipulate/use-manipulation';
import { PieceNudge, TurnPad } from '../precision/nudge';
import type { FurnitureTool } from './furniture';
import {
  ALL_CATEGORIES,
  THUMB_PX,
  categoriesOf,
  categoryIcon,
  matchRows,
  sizeText,
  sourceOf,
} from './furniture-model';
import { ObjectWallSection } from './wall-object-inspector';
import { WALL_CATEGORY, isWallModel, wallChipIcon, wallRowIds, wallRowText } from './wall-place';

export const CATALOGUE_LABEL = 'Furniture catalogue';

function IconThumb({ category }: { readonly category: string }): ReactNode {
  return (
    <View className="h-full w-full items-center justify-center rounded-md bg-surface-3">
      <Icon name={categoryIcon(category)} size={24} tone="variant" />
    </View>
  );
}

function Thumb({
  row,
  spec,
}: {
  readonly row: ModelCatalogRow;
  readonly spec: ModelAssetState<ModelSpec>;
}): ReactNode {
  const source = spec.status === 'ready' ? sourceOf(row, spec.value) : null;
  return (
    <View className="size-11 overflow-hidden rounded-md">
      {source === null ? (
        <IconThumb category={row.category} />
      ) : (
        <ModelVisual source={source} view="tile" px={THUMB_PX} signals={{}} />
      )}
    </View>
  );
}

function stateText(row: ModelCatalogRow, spec: ModelAssetState<ModelSpec>): string {
  const { category } = row;
  if (spec.status === 'ready') {
    return wallRowText(row, spec.value) ?? `${categoryLabel(category)} · ${sizeText(spec.value)}`;
  }
  if (spec.status === 'failed') return 'The model file is missing';
  return categoryLabel(category);
}

interface TileProps {
  readonly row: ModelCatalogRow;
  readonly spec: ModelAssetState<ModelSpec>;
  readonly readOnly: boolean;
  readonly armed: boolean;
  readonly onArm: (row: ModelCatalogRow, spec: ModelSpec) => void;
}

function Tile({ row, spec, readOnly, armed, onArm }: TileProps): ReactNode {
  const ready = spec.status === 'ready';
  return (
    <Interactive
      role="button"
      label={`Place ${row.title}`}
      selected={armed}
      disabled={readOnly || !ready}
      onPress={(): void => {
        if (spec.status === 'ready') onArm(row, spec.value);
      }}
      className={cn(
        'min-h-touch-min flex-1 items-center gap-1 rounded-md border-2 px-1.5 py-2',
        armed ? 'border-primary bg-primary-container' : 'border-transparent bg-surface-2',
        (readOnly || !ready) && 'opacity-60',
      )}
    >
      <Thumb row={row} spec={spec} />
      <Text
        variant="footnote"
        tone={armed ? 'onPrimaryContainer' : 'default'}
        align="center"
        numberOfLines={1}
        className="w-full"
      >
        {row.title}
      </Text>
      <Text
        variant="caption"
        tone={armed ? 'onPrimaryContainer' : 'variant'}
        align="center"
        numberOfLines={1}
        className="w-full"
      >
        {stateText(row, spec)}
      </Text>
    </Interactive>
  );
}

const COLUMNS = 3;

function rowsOf<T>(items: readonly T[]): readonly (readonly T[])[] {
  return Array.from({ length: Math.ceil(items.length / COLUMNS) }, (_, index) =>
    items.slice(index * COLUMNS, index * COLUMNS + COLUMNS),
  );
}

function Chip({
  id,
  selected,
  onPick,
}: {
  readonly id: string;
  readonly selected: boolean;
  readonly onPick: (id: string) => void;
}): ReactNode {
  const all = id === ALL_CATEGORIES;
  return (
    <Interactive
      role="radio"
      label={all ? 'All' : categoryLabel(id)}
      selected={selected}
      onPress={(): void => {
        onPick(id);
      }}
      className={cn(
        'min-h-touch-min flex-row items-center gap-1.5 rounded-full px-3',
        selected ? 'bg-primary-container' : 'bg-surface-2',
      )}
    >
      <Icon
        name={all ? 'grid' : wallChipIcon(id)}
        size={16}
        tone={selected ? 'onPrimaryContainer' : 'variant'}
      />
      <Text variant="footnote" tone={selected ? 'onPrimaryContainer' : 'default'}>
        {all ? 'All' : categoryLabel(id)}
      </Text>
    </Interactive>
  );
}

export interface CatalogueArming {
  readonly armed: string | null;
  readonly onArm: (row: ModelCatalogRow, spec: ModelSpec) => void;
}

export interface CataloguePanelProps extends CatalogueArming {
  readonly rows: readonly ModelCatalogRow[];
  readonly readOnly: boolean;
}

function Empty({ onClear }: { readonly onClear: () => void }): ReactNode {
  return (
    <View className="items-center gap-2 rounded-md bg-surface-2 p-4">
      <Icon name="search" size={24} tone="variant" />
      <Text variant="footnote" tone="variant" align="center">
        Nothing in the catalogue matches that.
      </Text>
      <Button label="Show everything" variant="text" onPress={onClear} />
    </View>
  );
}

type SpecState = (row: ModelCatalogRow) => ModelAssetState<ModelSpec>;

function useCatalogue(
  rows: readonly ModelCatalogRow[],
  query: string,
  category: string,
): {
  readonly shown: readonly ModelCatalogRow[];
  readonly chips: readonly string[];
  readonly specOf: SpecState;
} {
  const specs = useModelSpecs(rows.map((row) => row.spec_sha256));
  const wall = wallRowIds(rows, specs);
  const wallChip = wall.size === 0 ? [] : [WALL_CATEGORY];
  const shown =
    category === WALL_CATEGORY
      ? matchRows(rows, query, ALL_CATEGORIES).filter((row) => wall.has(row.id))
      : matchRows(rows, query, category);
  return {
    shown,
    chips: [ALL_CATEGORIES, ...wallChip, ...categoriesOf(rows)],
    specOf: (row) => specs[rows.indexOf(row)] ?? { status: 'idle' },
  };
}

function Grid(props: CataloguePanelProps & { readonly specOf: SpecState }): ReactNode {
  return (
    <View className="gap-2">
      {rowsOf(props.rows).map((line) => (
        <View key={line.map((row) => row.id).join('|')} className="flex-row gap-2">
          {line.map((row) => (
            <Tile
              key={row.id}
              row={row}
              spec={props.specOf(row)}
              readOnly={props.readOnly}
              armed={props.armed === row.id}
              onArm={props.onArm}
            />
          ))}
          {Array.from({ length: COLUMNS - line.length }, (_, index) => (
            <View key={`gap-${String(index)}`} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}

export function CataloguePanel({ rows, readOnly, armed, onArm }: CataloguePanelProps): ReactNode {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const { shown, chips, specOf } = useCatalogue(rows, query, category);
  return (
    <View accessibilityLabel={CATALOGUE_LABEL} className="gap-2">
      <SearchField
        variant="field"
        value={query}
        onChange={setQuery}
        placeholder="Search furniture and wall objects"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Category"
          className="flex-row gap-1.5"
        >
          {chips.map((id) => (
            <Chip key={id} id={id} selected={category === id} onPick={setCategory} />
          ))}
        </View>
      </ScrollView>
      <Text variant="caption" tone="variant" accessibilityLiveRegion="polite">
        {`${String(shown.length)} of ${String(rows.length)} pieces`}
      </Text>
      {shown.length === 0 ? (
        <Empty
          onClear={(): void => {
            setQuery('');
            setCategory(ALL_CATEGORIES);
          }}
        />
      ) : (
        <Grid rows={shown} readOnly={readOnly} armed={armed} onArm={onArm} specOf={specOf} />
      )}
    </View>
  );
}

export interface FurnitureInspectorProps {
  readonly object: HomeMapObject;
  readonly tool: FurnitureTool;
  readonly manipulation: Manipulation;
  readonly readOnly: boolean;
  readonly onPatch: (patch: Partial<HomeMapObject>) => void;
  readonly onRemove: () => void;
  readonly onDone: () => void;
  readonly wallSection?: ReactNode;
}

export function FurnitureInspector(props: FurnitureInspectorProps): ReactNode {
  const { object, readOnly, onPatch } = props;
  const [label, setLabel] = useState(object.label ?? '');
  const commitLabel = (): void => {
    const next = label.trim() === '' ? null : label.trim();
    if (next !== object.label) onPatch({ label: next });
  };
  return (
    <View accessibilityLabel="Selected piece" className="gap-3 rounded-md bg-surface-2 p-3">
      <View className="flex-row items-center gap-2">
        <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
          {props.tool.nameOf(object.id)}
        </Text>
        <IconButton icon="close" label="Back to the catalogue" onPress={props.onDone} />
      </View>
      <ObjectEdit tool={props.tool} object={object} manipulation={props.manipulation} />
      {props.wallSection === undefined ? <PieceNudge tool={props.tool} object={object} /> : null}
      {props.wallSection ?? (
        <TurnPad object={object} disabled={readOnly || object.locked} onPatch={onPatch} />
      )}
      <TextField
        label="Label"
        value={label}
        onChange={setLabel}
        onBlur={commitLabel}
        onSubmit={commitLabel}
        disabled={readOnly}
        placeholder={objectTitle(
          { label: null, modelId: object.modelId },
          props.tool.rows.find((row) => row.id === object.modelId)?.title,
        )}
      />
      <SwitchRow
        title="Lock in place"
        value={object.locked}
        disabled={readOnly}
        onChange={(locked): void => {
          onPatch({ locked });
        }}
      />
      <Button
        label="Remove"
        icon="trash"
        variant="destructive"
        disabled={readOnly || object.locked}
        onPress={props.onRemove}
      />
    </View>
  );
}

export interface FurniturePanelProps {
  readonly tool: FurnitureTool;
  readonly manipulation: Manipulation;
  readonly catalogue: CatalogueArming | null;
}

export function FurniturePanel({ tool, manipulation, catalogue }: FurniturePanelProps): ReactNode {
  const { selected } = tool;
  return (
    <View className="gap-3">
      {tool.notice === null ? null : (
        <View
          accessibilityLiveRegion="polite"
          className="flex-row items-center gap-2 rounded-md bg-surface-2 p-3"
        >
          <Icon name="warning" size={20} tone="warning" />
          <Text variant="footnote" className="min-w-0 flex-1">
            {tool.notice}
          </Text>
        </View>
      )}
      {selected === null ? (
        catalogue === null ? null : (
          <CataloguePanel
            rows={tool.rows}
            readOnly={tool.readOnly}
            armed={catalogue.armed}
            onArm={catalogue.onArm}
          />
        )
      ) : (
        <FurnitureInspector
          key={selected.id}
          object={selected}
          tool={tool}
          manipulation={manipulation}
          readOnly={tool.readOnly}
          wallSection={
            isWallModel(selected.modelId, tool.specOf(selected.modelId)) ? (
              <ObjectWallSection tool={tool} object={selected} />
            ) : undefined
          }
          onPatch={(patch): void => {
            tool.patch(selected.id, patch);
          }}
          onRemove={(): void => {
            tool.remove(selected.id);
          }}
          onDone={tool.clear}
        />
      )}
    </View>
  );
}
