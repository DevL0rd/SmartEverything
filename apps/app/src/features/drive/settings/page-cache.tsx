import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DesktopDrive, DesktopDriveCache } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { SegmentBar } from '../../../components/charts';
import { confirm } from '../../../components/confirm-store';
import type { IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { useStackedValue, valueLinesOf } from './value-lines';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import type { FieldKind } from '../../../components/text-field';
import { desktopBridge } from '../../../design/platform';
import { bytes } from '../../../format/number';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { trackSetting } from '../../settings';
import { mountSummaryOf, type MountSummary } from '../computers/mount-summary';
import { useThisComputer, type DesktopDriveView } from '../computers/this-computer';
import { useDrivePlacementRows } from '../data';
import {
  DURATION_HELPER,
  cacheSizeProblemOf,
  cacheWith,
  durationInitialOf,
  durationProblemOf,
  durationText,
  optionalSizeText,
  type CacheField,
} from './cache-model';
import { gigabytesInitialOf } from './gigabytes';
import { NUMBER_LENGTH } from './page-sharing';

interface CacheRowSpec {
  readonly field: CacheField;
  readonly title: string;
  readonly icon: IconName;
  readonly subtitle: string;
  readonly label: string;
  readonly helper: string;
  readonly kind: FieldKind;
  readonly optional: boolean;
  readonly value: (cache: DesktopDriveCache) => string;
  readonly initial: (cache: DesktopDriveCache) => string;
  readonly problemOf: (text: string) => string | null;
}

const SIZE_HELPER = 'A size in GB. Leave it empty to turn it off.';

const CACHE_ROWS: readonly CacheRowSpec[] = [
  {
    field: 'maxAgeSeconds',
    title: 'Remove unused cache after',
    icon: 'hourglass',
    subtitle: 'Open, pinned and waiting uploads always stay',
    label: 'Time unused',
    helper: DURATION_HELPER,
    kind: 'text',
    optional: false,
    value: (cache) => durationText(cache.maxAgeSeconds),
    initial: (cache) => durationInitialOf(cache.maxAgeSeconds),
    problemOf: durationProblemOf,
  },
  {
    field: 'maxBytes',
    title: 'Largest cache',
    icon: 'chartPie',
    subtitle: 'The longest unused files go first when it is full',
    label: 'Largest size in GB',
    helper: SIZE_HELPER,
    kind: 'number',
    optional: true,
    value: (cache) => optionalSizeText(cache.maxBytes),
    initial: (cache) => gigabytesInitialOf(cache.maxBytes),
    problemOf: cacheSizeProblemOf,
  },
  {
    field: 'minFreeBytes',
    title: 'Keep disk space free',
    icon: 'gauge',
    subtitle: 'The cache shrinks to leave this much free on the disk',
    label: 'Free space in GB',
    helper: SIZE_HELPER,
    kind: 'number',
    optional: true,
    value: (cache) => optionalSizeText(cache.minFreeBytes),
    initial: (cache) => gigabytesInitialOf(cache.minFreeBytes),
    problemOf: cacheSizeProblemOf,
  },
  {
    field: 'cleanupSeconds',
    title: 'Check the cache every',
    icon: 'timer',
    subtitle: 'How often unused files are looked for',
    label: 'Time between checks',
    helper: DURATION_HELPER,
    kind: 'text',
    optional: false,
    value: (cache) => durationText(cache.cleanupSeconds),
    initial: (cache) => durationInitialOf(cache.cleanupSeconds),
    problemOf: durationProblemOf,
  },
];

class DesktopDriveMissingError extends Error {
  override readonly name = 'DesktopDriveMissingError';
  constructor() {
    super('This desktop cannot change its mount cache. Update the desktop app.');
  }
}

async function saveCache(drive: DesktopDrive | undefined, cache: DesktopDriveCache): Promise<void> {
  if (drive === undefined) throw new DesktopDriveMissingError();
  await trackSetting('drive_cache.save', { limited: cache.maxBytes !== null }, () =>
    drive.run({ kind: 'cache', cache }),
  );
}

function useCacheRequest(
  spec: CacheRowSpec,
  cache: DesktopDriveCache,
  opener: TextEditRequest['opener'],
): TextEditRequest {
  return {
    id: `drive.sync-mount.cache.${spec.field}`,
    opener,
    title: spec.title,
    label: spec.label,
    initial: spec.initial(cache),
    placeholder: spec.optional ? 'Off' : spec.initial(cache),
    confirmLabel: 'Save',
    maxLength: NUMBER_LENGTH,
    kind: spec.kind,
    allowEmpty: spec.optional,
    helper: spec.helper,
    problemOf: spec.problemOf,
    save: (text) => saveCache(desktopBridge()?.drive, cacheWith(cache, spec.field, text)),
  };
}

function CacheRow({
  spec,
  cache,
}: {
  readonly spec: CacheRowSpec;
  readonly cache: DesktopDriveCache;
}): ReactNode {
  const opener = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const request = useCacheRequest(spec, cache, opener);
  const stacked = useStackedValue();
  return (
    <>
      <ListRow
        title={spec.title}
        icon={spec.icon}
        {...valueLinesOf(stacked, spec.value(cache), spec.subtitle)}
        wrapSubtitle
        wrapCaption
        chevron
        pressRef={opener}
        onPress={() => {
          setOpen(true);
        }}
      />
      <TextEditSheet
        request={open ? request : null}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

function useMountSummary(): MountSummary | null {
  const here = useThisComputer();
  const placements = useDrivePlacementRows();
  return here === null ? null : mountSummaryOf(here.deviceId, placements);
}

function cachedBytesOf(summary: MountSummary): number {
  return Math.max(0, summary.cacheBytes - summary.pinnedBytes);
}

export function cacheUsageLineOf(summary: MountSummary, maxBytes: number | null): string {
  const used = bytes(summary.cacheBytes);
  return maxBytes === null
    ? `${used} cached on this computer`
    : `${used} of ${bytes(maxBytes)} cached on this computer`;
}

function CacheUsage({
  summary,
  maxBytes,
}: {
  readonly summary: MountSummary;
  readonly maxBytes: number | null;
}): ReactNode {
  return (
    <View className="gap-2 px-4 pb-3 pt-4">
      <Text variant="body-strong" className="tabular">
        {cacheUsageLineOf(summary, maxBytes)}
      </Text>
      <SegmentBar
        label="Cache on this computer"
        segments={[
          { label: 'Cached', value: cachedBytesOf(summary), colour: 'primary' },
          { label: 'Kept offline', value: summary.pinnedBytes, colour: 'viz-4' },
        ]}
        size="thin"
        legend
        format={bytes}
      />
    </View>
  );
}

function clearLineOf(summary: MountSummary | null): string {
  const kept = 'Files kept offline, open files and waiting uploads stay';
  return summary === null
    ? kept
    : `${bytes(cachedBytesOf(summary))} cached · ${kept.toLowerCase()}`;
}

function ClearCacheRow({
  summary,
  drive,
}: {
  readonly summary: MountSummary | null;
  readonly drive: DesktopDriveView;
}): ReactNode {
  const clear = (): void => {
    background(
      confirm({
        title: 'Clear the mount cache?',
        body: 'Cached copies are removed and download again when opened. Files kept offline, open files and changes waiting to upload stay.',
        confirmLabel: 'Clear cache',
        tone: 'destructive',
      }).then((accepted) => {
        if (accepted) drive.run({ kind: 'clear-cache' }, 'The cache was not cleared');
      }),
      'drive.mount.clear_cache_confirm_failed',
    );
  };
  return (
    <ListRow
      title="Clear cache"
      icon="eraser"
      subtitle={clearLineOf(summary)}
      wrapSubtitle
      trailing={
        <Button
          label="Clear"
          variant="tonal"
          spoken="Clear the mount cache"
          loading={drive.busy}
          onPress={clear}
        />
      }
    />
  );
}

export function CacheSettings({
  cache,
  drive,
}: {
  readonly cache: DesktopDriveCache;
  readonly drive: DesktopDriveView;
}): ReactNode {
  const summary = useMountSummary();
  return (
    <View className="gap-1">
      <List
        inset
        title="Cache"
        footer="Files you open are kept here so they open fast next time. Changes apply to the running mount at once."
      >
        {summary?.active === true ? (
          <CacheUsage summary={summary} maxBytes={cache.maxBytes} />
        ) : null}
        {CACHE_ROWS.map((spec) => (
          <CacheRow key={spec.field} spec={spec} cache={cache} />
        ))}
        <ClearCacheRow summary={summary} drive={drive} />
      </List>
      {drive.problem === null ? null : (
        <Text variant="footnote" tone="critical" className="px-4">
          {drive.problem}
        </Text>
      )}
    </View>
  );
}
