import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DrivePlacementSet, DriveRoot } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useMyDrive, useSharedDrive } from '../data';
import { MY_DRIVE_LABEL, SHARED_DRIVE_LABEL } from '../model/drive-access';
import { placementBodyOf } from '../model/placement-body';
import { usePlacementWrites } from './placement-change';
import { childPath } from './placement-model';
import type { DesktopDriveView } from './this-computer';

interface DefaultMount {
  readonly root: DriveRoot;
  readonly name: string;
}

export function firstRunBodiesOf(
  deviceId: string,
  parent: string,
  mounts: readonly DefaultMount[],
): readonly DrivePlacementSet[] {
  return mounts.map(({ root, name }) =>
    placementBodyOf({
      deviceId,
      target: { rootId: root.id, folderItemId: null },
      mode: 'mounted',
      localPath: childPath(parent, name),
    }),
  );
}

export function parentProblemOf(parent: string): string | null {
  const trimmed = parent.trim();
  if (trimmed === '') return 'Type a folder';
  return trimmed.startsWith('/') || /^[A-Za-z]:[\\/]/.test(trimmed)
    ? null
    : 'Use a full path, like /home/you/SmartEverything';
}

function useDefaultMounts(): readonly DefaultMount[] {
  const mine = useMyDrive();
  const shared = useSharedDrive();
  return [
    ...(mine === null ? [] : [{ root: mine, name: MY_DRIVE_LABEL }]),
    ...(shared === null ? [] : [{ root: shared, name: SHARED_DRIVE_LABEL }]),
  ];
}

function MountTargets({
  mounts,
  parent,
  valid,
}: {
  readonly mounts: readonly DefaultMount[];
  readonly parent: string;
  readonly valid: boolean;
}): ReactNode {
  return (
    <View>
      {mounts.map(({ name }) => (
        <ListRow
          key={name}
          title={name}
          subtitle={valid ? childPath(parent, name) : name}
          icon="cloud"
        />
      ))}
    </View>
  );
}

function Choices({
  problem,
  ready,
  busy,
  onMount,
  onLater,
}: {
  readonly problem: string | null;
  readonly ready: boolean;
  readonly busy: boolean;
  readonly onMount: () => void;
  readonly onLater: () => void;
}): ReactNode {
  return (
    <View className="gap-2">
      {problem === null ? null : (
        <Text variant="footnote" tone="critical">
          {problem}
        </Text>
      )}
      <View className="flex-row flex-wrap gap-2">
        <Button
          label="Mount"
          icon="cloud"
          grow
          loading={busy}
          disabled={!ready || busy}
          onPress={onMount}
        />
        <Button label="Not now" variant="tonal" disabled={busy} onPress={onLater} />
      </View>
    </View>
  );
}

const FIRST_RUN_INTRO =
  'Open My Drive and the Shared Drive in your file manager like a network drive. Files come from the Hub as you open them.';

export function FirstRunCard({
  deviceId,
  drive,
}: {
  readonly deviceId: string;
  readonly drive: DesktopDriveView;
}): ReactNode {
  const firstRun = drive.state?.firstRun;
  const [typed, setTyped] = useState<string | null>(null);
  const mounts = useDefaultMounts();
  const writes = usePlacementWrites();
  if (firstRun?.pending !== true) return null;
  const parent = (typed ?? firstRun.defaultParent).trim();
  const problem = parentProblemOf(parent);
  return (
    <Card title="Mount your drives" icon="hardDrive" tone="attention">
      <Text variant="callout" tone="variant">
        {FIRST_RUN_INTRO}
      </Text>
      <TextField
        label="Parent folder"
        value={typed ?? firstRun.defaultParent}
        onChange={setTyped}
        error={problem}
        helper="Both drives appear inside this folder"
      />
      <MountTargets mounts={mounts} parent={parent} valid={problem === null} />
      <Choices
        problem={writes.problem}
        ready={problem === null && mounts.length > 0}
        busy={writes.busy || drive.busy}
        onMount={() => {
          writes.set(
            firstRunBodiesOf(deviceId, parent, mounts),
            'Your drives were not mounted',
            () => {
              drive.run({ kind: 'first-run-mounted' }, 'The setup was not saved');
            },
          );
        }}
        onLater={() => {
          drive.run({ kind: 'first-run-dismissed' }, 'The setup was not saved');
        }}
      />
    </Card>
  );
}
