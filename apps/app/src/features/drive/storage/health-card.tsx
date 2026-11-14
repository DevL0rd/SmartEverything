import type { DriveHealth, DriveWatcherState } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Arc } from '../../../components/charts';
import type { IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import type { ColourRole } from '../../../design/tokens';
import { count, percent } from '../../../format/number';
import { plural } from '../../../format/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useDriveHealth } from '../data';
import { StorageCardState } from './storage-card-state';

export interface ScrubView {
  readonly title: string;
  readonly detail: string;
  readonly ring: number;
  readonly colour: ColourRole;
}

export interface HealthLine {
  readonly key: string;
  readonly icon: IconName;
  readonly title: string;
  readonly text: string;
  readonly tone: Tone;
}

const RING_SIZE = 56;
const RING_THICKNESS = 5;

function checkedShare(checked: number, total: number): number {
  return total === 0 ? 0 : checked / total;
}

function damageOf(corrupt: number): string {
  return corrupt === 0 ? 'no damaged files' : plural(corrupt, 'damaged file');
}

export function scrubViewOf(health: DriveHealth, now: number): ScrubView {
  const scrub = health.scrub;
  if (scrub.state !== 'idle') {
    const share = checkedShare(scrub.checked, scrub.total);
    return {
      title: scrub.state === 'running' ? 'Scrubbing now' : `Scrub stopped at ${percent(share)}`,
      detail: `${count(scrub.checked)} of ${count(scrub.total)} files checked · ${damageOf(scrub.corrupt)}`,
      ring: share,
      colour: scrub.state === 'running' ? 'info' : 'warning',
    };
  }
  if (scrub.lastFinishedAt === null) {
    return {
      title: 'Never scrubbed',
      detail: 'A scrub reads every file and checks it against its fingerprint',
      ring: health.verifiedShare,
      colour: 'track',
    };
  }
  return {
    title: `Scrub · ${relative(scrub.lastFinishedAt, now)}`,
    detail: `${percent(health.verifiedShare)} of files checked · ${damageOf(scrub.corrupt)}`,
    ring: health.verifiedShare,
    colour: scrub.corrupt === 0 ? 'positive' : 'critical',
  };
}

const WATCHER: Readonly<Record<DriveWatcherState, { readonly text: string; readonly tone: Tone }>> =
  {
    watching: { text: 'Watching the data folder for changes', tone: 'positive' },
    reconciling: { text: 'Catching up with changes in the data folder', tone: 'info' },
    unavailable: { text: 'Not watching · changes show after a rescan', tone: 'warning' },
  };

function drivesLineOf(health: DriveHealth): HealthLine {
  const ready = health.rootsTotal - health.rootsUnavailable;
  const all = `${count(ready)} of ${count(health.rootsTotal)} ready`;
  return {
    key: 'drives',
    icon: 'hardDrive',
    title: 'Drives',
    text:
      health.rootsUnavailable === 0
        ? all
        : `${all} · ${count(health.rootsUnavailable)} not answering`,
    tone: health.rootsUnavailable === 0 ? 'variant' : 'warning',
  };
}

function backupTextOf(backup: DriveHealth['backup'], now: number): Omit<HealthLine, 'key'> {
  const base = { icon: 'archive', title: 'Last backup' } as const;
  const last = backup.last;
  if (last === null) return { ...base, text: 'No backup reported yet', tone: 'variant' };
  if (last.ok) {
    return { ...base, text: `${relative(last.at, now)} · ${last.reporter}`, tone: 'variant' };
  }
  const good = backup.lastOkAt === null ? '' : ` · last good one ${relative(backup.lastOkAt, now)}`;
  return {
    ...base,
    text: `Failed ${relative(last.at, now)} · ${last.reporter}${good}`,
    tone: 'critical',
  };
}

export function healthLinesOf(health: DriveHealth, now: number): readonly HealthLine[] {
  return [
    {
      key: 'damage',
      icon: health.corrupt === 0 ? 'shieldCheck' : 'shieldAlert',
      title: 'Damaged files',
      text: health.corrupt === 0 ? 'None found' : plural(health.corrupt, 'file'),
      tone: health.corrupt === 0 ? 'variant' : 'critical',
    },
    drivesLineOf(health),
    { key: 'watcher', icon: 'eye', title: 'Disk watcher', ...WATCHER[health.watcher] },
    { key: 'backup', ...backupTextOf(health.backup, now) },
  ];
}

function ScrubRing({ view }: { readonly view: ScrubView }): ReactNode {
  return (
    <View className="flex-row items-center gap-4">
      <View className="shrink-0 items-center justify-center">
        <Arc
          value={view.ring}
          size={RING_SIZE}
          thickness={RING_THICKNESS}
          colour={view.colour}
          trackColour="surface-3"
        />
        <View className="absolute">
          <Text variant="caption" className="tabular">
            {percent(view.ring)}
          </Text>
        </View>
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="callout" className="font-sans-medium">
          {view.title}
        </Text>
        <Text variant="footnote" tone="variant">
          {view.detail}
        </Text>
      </View>
    </View>
  );
}

export function HealthBody({
  health,
  now,
}: {
  readonly health: DriveHealth;
  readonly now: number;
}): ReactNode {
  const scrub = scrubViewOf(health, now);
  return (
    <Card title="Drive health" icon="shield">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${scrub.title}, ${scrub.detail}`}
      >
        <ScrubRing view={scrub} />
      </View>
      <View className="-mx-card-pad -mb-card-pad">
        {healthLinesOf(health, now).map((line) => (
          <View key={line.key} className="border-t-hairline border-outline-variant">
            <ListRow
              icon={line.icon}
              iconTone={line.tone}
              title={line.title}
              subtitle={line.text}
              subtitleTone={line.tone}
            />
          </View>
        ))}
      </View>
    </Card>
  );
}

export function HealthCard(): ReactNode {
  const query = useDriveHealth();
  const now = useMinute();
  if (query.data === undefined) {
    return (
      <StorageCardState
        title="Drive health"
        icon="shield"
        query={query}
        failure="drive.storage.health_refetch_failed"
      />
    );
  }
  return <HealthBody health={query.data} now={now} />;
}
