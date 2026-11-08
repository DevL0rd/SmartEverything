import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SmartRule, SmartRuleLeaf } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { FilterChip } from '../../../components/filter-chip';
import { useDriveItem, useDriveRoots } from '../../nas/data';
import { leafIcon, leafLabel, type PlaceOf } from './rule-labels';
import type { RuleChip } from './rule-chips';

export function usePlaceOf(extra: ReadonlyMap<string, string>): PlaceOf {
  const roots = new Map(useDriveRoots().map((root) => [root.id, root.label]));
  return (id) => extra.get(id) ?? roots.get(id) ?? null;
}

function folderIdOf(leaf: SmartRuleLeaf): string | null {
  return leaf.kind === 'in_folder' ? leaf.folderId : null;
}

export function useLeafLabel(leaf: SmartRuleLeaf, placeOf: PlaceOf): string {
  const folderId = folderIdOf(leaf);
  const known = folderId === null ? null : placeOf(folderId);
  const folder = useDriveItem(known === null ? folderId : null, null).data;
  return leafLabel(leaf, (id) => (folder?.id === id ? folder.name : placeOf(id)));
}

function RuleBadge({
  leaf,
  placeOf,
}: {
  readonly leaf: SmartRuleLeaf;
  readonly placeOf: PlaceOf;
}): ReactNode {
  return <Badge label={useLeafLabel(leaf, placeOf)} icon={leafIcon(leaf)} />;
}

const NO_PLACES: ReadonlyMap<string, string> = new Map();

export function RuleBadges({ rule }: { readonly rule: SmartRule }): ReactNode {
  const placeOf = usePlaceOf(NO_PLACES);
  return (
    <View className="flex-row flex-wrap gap-1">
      {rule.rules.map((leaf, index) => (
        <RuleBadge key={`${leaf.kind}-${String(index)}`} leaf={leaf} placeOf={placeOf} />
      ))}
    </View>
  );
}

function EditableChip({
  chip,
  placeOf,
  onRemove,
}: {
  readonly chip: RuleChip;
  readonly placeOf: PlaceOf;
  readonly onRemove: (key: number) => void;
}): ReactNode {
  const text = useLeafLabel(chip.leaf, placeOf);
  return (
    <FilterChip
      label="Remove rule"
      value={text}
      icon={leafIcon(chip.leaf)}
      active
      affordance="remove"
      onPress={() => {
        onRemove(chip.key);
      }}
    />
  );
}

export function RuleChipRow({
  chips,
  placeOf,
  onRemove,
}: {
  readonly chips: readonly RuleChip[];
  readonly placeOf: PlaceOf;
  readonly onRemove: (key: number) => void;
}): ReactNode {
  if (chips.length === 0) return null;
  return (
    <View aria-label="Rules" className="flex-row flex-wrap gap-1">
      {chips.map((chip) => (
        <EditableChip key={chip.key} chip={chip} placeOf={placeOf} onRemove={onRemove} />
      ))}
    </View>
  );
}
