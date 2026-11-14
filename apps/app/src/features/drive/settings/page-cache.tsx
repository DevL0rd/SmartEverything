import { useRef, useState, type ReactNode } from 'react';
import type { View } from 'react-native';
import type { DesktopDrive, DesktopDriveCache } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import type { FieldKind } from '../../../components/text-field';
import { desktopBridge } from '../../../design/platform';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { trackSetting } from '../../settings/settings-log';
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
  return (
    <>
      <ListRow
        title={spec.title}
        icon={spec.icon}
        subtitle={spec.subtitle}
        wrapSubtitle
        value={spec.value(cache)}
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

export function CacheSettings({
  cache,
  parent,
}: {
  readonly cache: DesktopDriveCache;
  readonly parent: string;
}): ReactNode {
  return (
    <List
      inset
      title="Mount cache"
      footer="Files you open are kept here so they open fast next time. Changes apply to the running mount at once."
    >
      <ListRow title="Folder for new mounts" icon="folder" subtitle={parent} wrapSubtitle />
      {CACHE_ROWS.map((spec) => (
        <CacheRow key={spec.field} spec={spec} cache={cache} />
      ))}
    </List>
  );
}
