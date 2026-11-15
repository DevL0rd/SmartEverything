import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SmartRule, SmartRuleLeaf } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useDriveChips, useDriveItem, useDriveRoots } from '../data';
import { leafIcon, leafLabel, placeOfSources, type PlaceOf } from './rule-labels';
import type { RuleChip } from './rule-chips';

export function usePlaceOf(extra: ReadonlyMap<string, string>): PlaceOf {
  const chipOf = useDriveChips();
  const rootIds = new Set(useDriveRoots().map((root) => root.id));
  return placeOfSources({ extra, rootIds, rootLabel: (id) => chipOf(id).label });
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
    <View className="min-h-9 max-w-full flex-row items-center self-start rounded-full border-hairline border-outline-variant bg-surface-2 pl-3">
      <Icon name={leafIcon(chip.leaf)} size={16} tone="variant" />
      <Text variant="footnote" numberOfLines={1} className="min-w-0 shrink pl-1.5">
        {text}
      </Text>
      <Interactive
        label={`Remove rule ${text}`}
        onPress={() => {
          onRemove(chip.key);
        }}
        hitSlop={6}
        className="size-9 items-center justify-center rounded-full"
        layerClassName="rounded-full"
      >
        <Icon name="close" size={16} tone="variant" />
      </Interactive>
    </View>
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
    <View aria-label="Rules" className="flex-row flex-wrap gap-2">
      {chips.map((chip) => (
        <EditableChip key={chip.key} chip={chip} placeOf={placeOf} onRemove={onRemove} />
      ))}
    </View>
  );
}
