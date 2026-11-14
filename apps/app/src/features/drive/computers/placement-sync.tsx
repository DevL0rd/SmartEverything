import { useCallback, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem, DrivePlacement } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { SegmentBar } from '../../../components/charts';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import {
  drivePathOfWire,
  keptSplitOf,
  normalisedExcluded,
  sameExcluded,
  wirePathOf,
} from './excluded-model';
import { ExcludedTree } from './excluded-tree';
import { usePlacementWrites } from './placement-change';
import { changedBodyOf, syncSettingsOf } from './placement-model';
import { SkipPatterns } from './skip-patterns';

interface SyncProps {
  readonly placement: DrivePlacement;
  readonly base: DriveItem | null;
  readonly size: number | null;
  readonly editable: boolean;
}

function useSizes(): readonly [ReadonlyMap<string, number>, (path: string, size: number) => void] {
  const [sizes, setSizes] = useState<ReadonlyMap<string, number>>(new Map());
  const onSize = useCallback((path: string, size: number) => {
    setSizes((now) => (now.get(path) === size ? now : new Map(now).set(path, size)));
  }, []);
  return [sizes, onSize];
}

function KeptBar({
  size,
  excluded,
  sizes,
}: {
  readonly size: number | null;
  readonly excluded: readonly string[];
  readonly sizes: ReadonlyMap<string, number>;
}): ReactNode {
  const split = size === null ? null : keptSplitOf(size, excluded, sizes);
  if (split === null) return null;
  return (
    <SegmentBar
      label="Kept on this computer"
      segments={[
        { label: 'Kept here', value: split.kept, colour: 'primary' },
        { label: 'On the Hub only', value: split.excluded, colour: 'surface-3' },
      ]}
      legend
      format={bytes}
    />
  );
}

function SaveRow({
  busy,
  onSave,
  onUndo,
}: {
  readonly busy: boolean;
  readonly onSave: () => void;
  readonly onUndo: () => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button label="Save" icon="check" loading={busy} onPress={onSave} />
      <Button label="Undo" variant="tonal" disabled={busy} onPress={onUndo} />
    </View>
  );
}

export function SelectiveSync({ placement, base, size, editable }: SyncProps): ReactNode {
  const basePath = base?.relPath ?? null;
  const saved = normalisedExcluded(
    (placement.excluded ?? []).map((wire) => drivePathOfWire(basePath, wire)),
  );
  const [draft, setDraft] = useState(saved);
  const [sizes, onSize] = useSizes();
  const writes = usePlacementWrites();
  const changed = !sameExcluded(draft, saved);
  const save = (): void => {
    const excluded = draft.map((path) => wirePathOf(basePath, path));
    writes.set(
      [changedBodyOf(placement, { sync: { excluded } })],
      'The folders kept here were not changed',
    );
  };
  return (
    <Card title="Folders kept on this computer" icon="folderSync">
      <Text variant="footnote" tone="variant">
        Untick a folder to keep it on the Hub only. It stays in the drive and leaves this computer.
      </Text>
      <KeptBar size={size} excluded={draft} sizes={sizes} />
      <ExcludedTree
        rootId={placement.rootId}
        baseId={placement.folderItemId}
        excluded={draft}
        disabled={!editable || writes.busy}
        onSize={onSize}
        onChange={setDraft}
      />
      {writes.problem === null ? null : (
        <Text variant="footnote" tone="critical">
          {writes.problem}
        </Text>
      )}
      {changed ? (
        <SaveRow
          busy={writes.busy}
          onSave={save}
          onUndo={() => {
            setDraft(saved);
          }}
        />
      ) : null}
    </Card>
  );
}

export function SyncRules({
  placement,
  editable,
}: {
  readonly placement: DrivePlacement;
  readonly editable: boolean;
}): ReactNode {
  const writes = usePlacementWrites();
  const settings = syncSettingsOf(placement);
  if (settings === undefined) return null;
  return (
    <View className="gap-4">
      <SkipPatterns
        patterns={settings.ignorePatterns}
        editable={editable}
        busy={writes.busy}
        problem={writes.problem}
        footer="Files matching these patterns are never synced in either direction."
        onChange={(ignorePatterns) => {
          writes.set(
            [changedBodyOf(placement, { sync: { ignorePatterns } })],
            'The skip patterns were not saved',
          );
        }}
      />
      <List
        title="When both sides change"
        footer="A conflict copy keeps both versions next to each other and tells you, so nothing is lost."
      >
        <SwitchRow
          title="Keep a conflict copy"
          icon="copy"
          value={settings.conflictCopies}
          disabled={!editable || writes.busy}
          onChange={(conflictCopies) => {
            writes.set(
              [changedBodyOf(placement, { sync: { conflictCopies } })],
              'The conflict setting was not saved',
            );
          }}
        />
      </List>
    </View>
  );
}
