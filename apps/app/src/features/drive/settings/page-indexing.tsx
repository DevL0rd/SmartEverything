import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  DriveProgressNotice,
  DriveSettings,
  DriveSettingsUpdate,
  DriveWatcherState,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { updateDriveSettings } from '../../../api/drive';
import { Button } from '../../../components/button';
import { ProgressBar } from '../../../components/charts/progress-bar';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { usePausable } from '../../../design/external-store';
import { count, percent } from '../../../format/number';
import { driveKey } from '../../../queries/keys';
import { useMutationState } from '../../../store/mutation';
import type { RowOf } from '../../../store/state';
import { trackSetting } from '../../settings/settings-log';
import {
  driveProgress,
  useDriveHealth,
  useDriveRoots,
  useDriveSettings,
  type DriveProgress,
} from '../../nas/data';
import { DriveSettingsSection } from './page';
import { watcherLineOf } from './watcher-line';

type Phase = DriveProgressNotice['phase'];

export const DRIVE_SETTINGS_KEY = driveKey('settings', null);

const PHASE_WORD: Readonly<Record<Phase, string>> = {
  scan: 'Reading folders',
  hash: 'Finding duplicates',
  scrub: 'Checking for damage',
};

export interface ProgressLine {
  readonly key: string;
  readonly rootId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly share: number;
}

export async function saveDriveSettings(
  client: QueryClient,
  update: DriveSettingsUpdate,
): Promise<DriveSettings> {
  const saved = await trackSetting('drive_settings.save', { fields: Object.keys(update) }, () =>
    updateDriveSettings(update),
  );
  client.setQueryData(DRIVE_SETTINGS_KEY, saved);
  return saved;
}

function isPhase(value: string): value is Phase {
  return value in PHASE_WORD;
}

export function progressLinesOf(
  progress: DriveProgress,
  roots: readonly RowOf<'drive_roots'>[],
): readonly ProgressLine[] {
  return roots.flatMap((root) =>
    Object.entries(progress[root.id] ?? {}).flatMap(([phase, step]): ProgressLine[] => {
      if (!isPhase(phase)) return [];
      return [
        {
          key: `${root.id}:${phase}`,
          rootId: root.id,
          title: root.label,
          subtitle: `${PHASE_WORD[phase]} · ${count(step.done)} of ${count(step.total)}`,
          share: step.total === 0 ? 0 : step.done / step.total,
        },
      ];
    }),
  );
}

export function indexingLineOf(paused: boolean, working: number): string {
  if (paused) return 'Paused · new and changed files wait until you resume';
  if (working === 0) return 'Up to date with every library folder';
  return working === 1 ? 'Working on 1 folder' : `Working on ${count(working)} folders`;
}

export function hashedLineOf(share: number | undefined): string {
  const base = 'Reads each file once to spot exact copies';
  return share === undefined ? base : `${base} · ${percent(share)} of files read`;
}

export function SettingsQueryState<T>({
  query,
  event,
}: {
  readonly query: UseQueryResult<T>;
  readonly event: string;
}): ReactNode {
  if (!query.isError) {
    return (
      <View className="px-4 py-3">
        <Skeleton shape="line" className="h-10" />
      </View>
    );
  }
  return (
    <View className="px-4">
      <ErrorState
        error={query.error}
        retry={() => {
          background(query.refetch(), event);
        }}
      />
    </View>
  );
}

function useProgress(): DriveProgress {
  return usePausable(driveProgress.subscribe, driveProgress.get);
}

function PauseRow({
  settings,
  working,
}: {
  readonly settings: DriveSettings;
  readonly working: number;
}): ReactNode {
  const client = useQueryClient();
  const mutation = useMutationState();
  const paused = settings.indexingPaused;
  return (
    <ListRow
      title="Indexing"
      icon={paused ? 'pause' : 'search'}
      iconTone={paused ? 'warning' : 'variant'}
      subtitle={indexingLineOf(paused, working)}
      wrapSubtitle
      trailing={
        <Button
          label={paused ? 'Resume' : 'Pause'}
          icon={paused ? 'play' : 'pause'}
          variant="tonal"
          loading={mutation.busy}
          onPress={() => {
            mutation.run(() => saveDriveSettings(client, { indexingPaused: !paused }), {
              failure: paused ? 'Indexing did not resume' : 'Indexing did not pause',
              label: 'drive_settings.indexing_paused',
            });
          }}
        />
      }
    />
  );
}

function DuplicatesRow({
  settings,
  hashedShare,
}: {
  readonly settings: DriveSettings;
  readonly hashedShare: number | undefined;
}): ReactNode {
  const client = useQueryClient();
  const mutation = useMutationState();
  return (
    <SwitchRow
      title="Find duplicate files"
      icon="layers"
      subtitle={hashedLineOf(hashedShare)}
      wrapSubtitle
      value={settings.duplicatesHashing}
      disabled={mutation.busy}
      onChange={(next) => {
        mutation.run(() => saveDriveSettings(client, { duplicatesHashing: next }), {
          failure: 'Duplicate finding did not change',
          label: 'drive_settings.duplicates_hashing',
        });
      }}
    />
  );
}

function WatcherRow({ state }: { readonly state: DriveWatcherState }): ReactNode {
  const line = watcherLineOf(state);
  return (
    <ListRow
      title="Watching for changes"
      icon={state === 'unavailable' ? 'eyeOff' : 'eye'}
      iconTone={line.tone}
      subtitle={line.text}
      subtitleTone={line.tone}
      wrapSubtitle
    />
  );
}

function ProgressRow({ line }: { readonly line: ProgressLine }): ReactNode {
  return (
    <ListRow
      title={line.title}
      icon="folder"
      subtitle={line.subtitle}
      trailing={
        <View className="w-24">
          <ProgressBar progress={line.share} colour="info" label={line.subtitle} />
        </View>
      }
    />
  );
}

function IndexingBody({ settings }: { readonly settings: DriveSettings }): ReactNode {
  const lines = progressLinesOf(useProgress(), useDriveRoots());
  const working = new Set(lines.map((line) => line.rootId)).size;
  const health = useDriveHealth().data;
  return (
    <View className="gap-3">
      <List inset>
        <PauseRow settings={settings} working={working} />
        <DuplicatesRow settings={settings} hashedShare={health?.hashedShare} />
        {health === undefined ? null : <WatcherRow state={health.watcher} />}
      </List>
      {lines.length === 0 ? null : (
        <List inset title="Working now">
          {lines.map((line) => (
            <ProgressRow key={line.key} line={line} />
          ))}
        </List>
      )}
    </View>
  );
}

export function IndexingSection(): ReactNode {
  const settings = useDriveSettings();
  return (
    <DriveSettingsSection section="indexing">
      {settings.data === undefined ? (
        <SettingsQueryState query={settings} event="drive_settings.indexing_refetch_failed" />
      ) : (
        <IndexingBody settings={settings.data} />
      )}
    </DriveSettingsSection>
  );
}
