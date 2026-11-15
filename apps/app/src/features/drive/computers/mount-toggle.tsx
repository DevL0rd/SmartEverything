import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DrivePlacement } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { usePlacementWrites, type PlacementWrites } from './placement-change';
import { OpenHereButton, useOpenHere } from './placement-row';
import { lineToneOf, placementWordsOf } from './placement-words';

export interface MountToggleWords {
  readonly subtitle: string;
  readonly tone: Tone;
}

export type MountToggleDetail = 'full' | 'chip';

export function mountToggleWordsOf(
  computer: string,
  mount: DrivePlacement | null,
  detail: MountToggleDetail,
): MountToggleWords {
  if (mount?.enabled !== true) {
    return {
      subtitle: `Opens your whole My Drive in the file manager of ${computer}`,
      tone: 'variant',
    };
  }
  const words = placementWordsOf(mount, null);
  return {
    subtitle: detail === 'chip' ? words.chip.label : `${words.chip.label} · ${words.line}`,
    tone: lineToneOf(words),
  };
}

export function pendingWordsOf(next: boolean, computer: string): MountToggleWords {
  return {
    subtitle: next ? `Mounting My Drive on ${computer}…` : `Unmounting My Drive on ${computer}…`,
    tone: 'variant',
  };
}

interface Turn {
  readonly writes: PlacementWrites;
  readonly deviceId: string;
  readonly computer: string;
  readonly onTurn: (next: boolean) => void;
}

function turn({ writes, deviceId, computer, onTurn }: Turn, next: boolean): void {
  if (next) {
    onTurn(next);
    writes.mount(deviceId, next);
    return;
  }
  background(
    confirm({
      title: 'Unmount My Drive?',
      body: `My Drive leaves the file manager of ${computer}. Nothing in the drive is deleted.`,
      confirmLabel: 'Unmount',
      tone: 'destructive',
    }).then((accepted) => {
      if (!accepted) return;
      onTurn(next);
      writes.mount(deviceId, next);
    }),
    'drive.mount.unmount_confirm_failed',
  );
}

function ToggleFooter({
  mount,
  problem,
}: {
  readonly mount: DrivePlacement | null;
  readonly problem: string | null;
}): ReactNode {
  const openHere = useOpenHere(mount);
  return (
    <>
      {openHere === null ? null : (
        <View className="flex-row px-4">
          <OpenHereButton action={openHere} />
        </View>
      )}
      {problem === null ? null : (
        <Text variant="footnote" tone="critical" className="px-4">
          {problem}
        </Text>
      )}
    </>
  );
}

export function MountToggle({
  deviceId,
  computer,
  mount,
  detail,
  live,
}: {
  readonly deviceId: string;
  readonly computer: string;
  readonly mount: DrivePlacement | null;
  readonly detail: MountToggleDetail;
  readonly live: boolean;
}): ReactNode {
  const writes = usePlacementWrites();
  const [target, setTarget] = useState<boolean | null>(null);
  const on = mount?.enabled === true;
  const pending = writes.busy && target !== null;
  const value = pending ? target : on;
  const words = pending
    ? pendingWordsOf(target, computer)
    : mountToggleWordsOf(computer, mount, detail);
  return (
    <View className="gap-1">
      <SwitchRow
        title="Mount My Drive"
        subtitle={words.subtitle}
        subtitleTone={words.tone}
        wrapSubtitle
        icon="cloud"
        value={value}
        disabled={!live}
        label={`Mount My Drive on ${computer}`}
        onChange={(next) => {
          if (writes.busy) return;
          turn({ writes, deviceId, computer, onTurn: setTarget }, next);
        }}
      />
      <ToggleFooter mount={mount} problem={writes.problem} />
    </View>
  );
}
