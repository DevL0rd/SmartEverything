import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DrivePlacement } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { plural } from '../../../format/text';
import { MODE_WORD } from './placement-status';
import { localCopyPath, type PlacementChoice } from './use-placements';

export interface SwitchFacts {
  readonly placement: DrivePlacement;
  readonly to: PlacementChoice;
  readonly computer: string;
  readonly folderBytes: number | null;
  readonly needBytes: number;
}

export interface SwitchPlan {
  readonly title: string;
  readonly body: readonly string[];
  readonly confirm: string;
  readonly destructive: boolean;
  readonly waiting: string | null;
}

function waitingOf({ placement, needBytes, computer }: SwitchFacts): string | null {
  const uploads = placement.status.pendingUploads;
  if (uploads > 0) {
    return `${plural(uploads, 'change')} on ${computer} still waiting to upload. Switch when they finish.`;
  }
  if (needBytes > 0) {
    return `${bytes(needBytes)} is still syncing to ${computer}. Switch when it is up to date.`;
  }
  return null;
}

function stopPlan({ placement, computer }: SwitchFacts): SwitchPlan {
  const body =
    placement.mode === 'synced'
      ? `Sync stops. The files already in ${placement.localPath} stay on ${computer}.`
      : `${placement.localPath} is unmounted. Nothing on ${computer} is deleted.`;
  return {
    title: `Stop on ${computer}?`,
    body: [body],
    confirm: 'Stop',
    destructive: true,
    waiting: null,
  };
}

function toMountedPlan(facts: SwitchFacts): SwitchPlan {
  const { placement } = facts;
  return {
    title: `Switch to ${MODE_WORD.mounted}?`,
    body: [
      `Sync stops and ${placement.localPath} opens from the hub as you use it.`,
      `The local copy is renamed to ${localCopyPath(placement.localPath)}. It keeps using its disk space until you remove it.`,
    ],
    confirm: `Switch to ${MODE_WORD.mounted}`,
    destructive: false,
    waiting: waitingOf(facts),
  };
}

function toSyncedPlan({ placement, computer, folderBytes }: SwitchFacts): SwitchPlan {
  const size = folderBytes === null ? 'all of it' : `all ${bytes(folderBytes)}`;
  return {
    title: `Switch to ${MODE_WORD.synced}?`,
    body: [
      `The folder is unmounted, then ${computer} downloads ${size} into ${placement.localPath}.`,
      'It stays there and works offline.',
    ],
    confirm: `Switch to ${MODE_WORD.synced}`,
    destructive: false,
    waiting: null,
  };
}

export function switchPlanOf(facts: SwitchFacts): SwitchPlan {
  if (facts.to === 'off') return stopPlan(facts);
  return facts.to === 'mounted' ? toMountedPlan(facts) : toSyncedPlan(facts);
}

function SwitchFooter({
  plan,
  busy,
  onConfirm,
  onClose,
}: {
  readonly plan: SwitchPlan;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <View className="ml-auto flex-row flex-wrap justify-end gap-2">
      <Button label="Cancel" variant="tonal" disabled={busy} onPress={onClose} />
      <Button
        label={plan.confirm}
        variant={plan.destructive ? 'destructive' : 'filled'}
        loading={busy}
        disabled={busy || plan.waiting !== null}
        onPress={onConfirm}
      />
    </View>
  );
}

export function PlacementSwitchSheet({
  facts,
  busy,
  problem,
  onConfirm,
  onClose,
}: {
  readonly facts: SwitchFacts | null;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const plan = facts === null ? null : switchPlanOf(facts);
  return (
    <Sheet
      open={plan !== null}
      onClose={onClose}
      title={plan?.title ?? ''}
      detents={['fit']}
      footer={
        plan === null ? null : (
          <SwitchFooter plan={plan} busy={busy} onConfirm={onConfirm} onClose={onClose} />
        )
      }
    >
      {plan === null ? null : (
        <View className="gap-3">
          {plan.body.map((line) => (
            <Text key={line} variant="callout" tone="variant">
              {line}
            </Text>
          ))}
          {plan.waiting === null ? null : (
            <Text variant="callout" tone="warning">
              {plan.waiting}
            </Text>
          )}
          {problem === null ? null : (
            <Text variant="callout" tone="critical">
              {problem}
            </Text>
          )}
        </View>
      )}
    </Sheet>
  );
}
