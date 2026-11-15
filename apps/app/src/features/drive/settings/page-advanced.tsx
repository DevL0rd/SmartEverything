import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_DESKTOP_DRIVE_TUNING,
  type DesktopDriveState,
  type DesktopDriveTuning,
  type DriveSettings,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List, SectionAction } from '../../../components/section';
import { Text } from '../../../components/text';
import { desktopBridge } from '../../../design/platform';
import { useIsOwner } from '../../../store/selectors';
import { useMutationState } from '../../../store/mutation';
import {
  TextEditSheet,
  type TextEditRequest,
  type TextEditReset,
} from '../../../settings/text-edit-sheet';
import { trackSetting } from '../../settings';
import { useDesktopDrive } from '../computers/this-computer';
import { useDriveSettings } from '../data';
import {
  HUB_DEFAULTS,
  hubEntryOf,
  hubIsDefault,
  hubProblemOf,
  hubResetAll,
  hubValueText,
  type HubTuningField,
} from './advanced-hub';
import {
  missingOnWindows,
  remountPending,
  remountPendingFor,
  tuningAllDefault,
} from './advanced-model';
import { TuningRow, useStackedValue, valueLinesOf } from './advanced-row';
import {
  COMPUTER_GROUPS,
  HUB_ROWS,
  subtitleOf,
  type HubRowSpec,
  type TuningRowSpec,
} from './advanced-rows';
import { DriveSettingsSection } from './page';
import { saveDriveSettings } from './page-indexing';
import { SettingsQueryState } from './settings-query-state';
import { NUMBER_LENGTH } from './page-sharing';

class DesktopTuningMissingError extends Error {
  override readonly name = 'DesktopTuningMissingError';
  constructor() {
    super('This desktop cannot change its mount tuning. Update the desktop app.');
  }
}

async function saveTuning(tuning: DesktopDriveTuning): Promise<DesktopDriveState> {
  const drive = desktopBridge()?.drive;
  if (drive === undefined) throw new DesktopTuningMissingError();
  return trackSetting('drive_tuning.save', {}, () => drive.run({ kind: 'tuning', tuning }));
}

async function remount(): Promise<DesktopDriveState> {
  const drive = desktopBridge()?.drive;
  if (drive === undefined) throw new DesktopTuningMissingError();
  return trackSetting('drive_tuning.remount', {}, () => drive.run({ kind: 'remount' }));
}

function onWindows(): boolean {
  return desktopBridge()?.platform === 'win32';
}

function RemountRow({ state, busy, run }: ComputerProps & RunProps): ReactNode {
  if (!remountPending(state.tuning)) return null;
  return (
    <List inset>
      <ListRow
        title="Some changes wait for a remount"
        icon="refresh"
        iconTone="warning"
        subtitle="The kernel takes them when the drive mounts again. Close open files first."
        wrapSubtitle
        trailing={
          <Button
            label="Remount"
            variant="tonal"
            loading={busy}
            onPress={() => {
              run(remount, 'The drive did not remount');
            }}
          />
        }
      />
    </List>
  );
}

interface ComputerProps {
  readonly state: DesktopDriveState;
}

interface RunProps {
  readonly busy: boolean;
  readonly run: (work: () => Promise<unknown>, failure: string) => void;
}

function GroupHeading({
  title,
  caption,
  action,
}: {
  readonly title: string;
  readonly caption: string;
  readonly action: ReactNode;
}): ReactNode {
  return (
    <View className="flex-row items-end justify-between gap-2 px-4">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="title-3" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="footnote" tone="variant">
          {caption}
        </Text>
      </View>
      {action}
    </View>
  );
}

function TuningGroup({
  title,
  rows,
  state,
  busy,
  run,
}: ComputerProps &
  RunProps & { readonly title: string; readonly rows: readonly TuningRowSpec[] }): ReactNode {
  const { saved, limits } = state.tuning;
  const windows = onWindows();
  return (
    <List inset title={title}>
      {rows.map((spec) => (
        <TuningRow
          key={spec.field}
          spec={spec}
          icon={spec.icon}
          tuning={saved}
          limits={limits}
          remountPending={remountPendingFor(state.tuning, spec.field)}
          notOnWindows={windows ? missingOnWindows(spec.field) : false}
          busy={busy}
          subtitle={subtitleOf(spec, DEFAULT_DESKTOP_DRIVE_TUNING)}
          apply={(tuning) => {
            run(() => saveTuning(tuning), `${spec.title} did not change`);
          }}
          save={saveTuning}
        />
      ))}
    </List>
  );
}

function ComputerTuning({ state }: ComputerProps): ReactNode {
  const mutation = useMutationState();
  const run: RunProps['run'] = (work, failure) => {
    mutation.run(work, { failure, label: 'drive_tuning.change' });
  };
  const changed = !tuningAllDefault(state.tuning.saved);
  return (
    <View className="gap-4">
      <GroupHeading
        title="This computer"
        caption="How this computer’s mount talks to the kernel and the Hub."
        action={
          changed ? (
            <SectionAction
              label="Reset all"
              spoken="Reset every setting for this computer"
              onPress={() => {
                run(() => saveTuning(DEFAULT_DESKTOP_DRIVE_TUNING), 'The settings were not reset');
              }}
            />
          ) : null
        }
      />
      <RemountRow state={state} busy={mutation.busy} run={run} />
      {COMPUTER_GROUPS.map((group) => (
        <TuningGroup
          key={group.title}
          title={group.title}
          rows={group.rows}
          state={state}
          busy={mutation.busy}
          run={run}
        />
      ))}
    </View>
  );
}

function hubSubtitleOf(spec: HubRowSpec): string {
  const standard = HUB_DEFAULTS[spec.field];
  const base =
    standard === null
      ? `Default ${spec.origin}`
      : `Default ${hubValueText(spec.field, standard)}, ${spec.origin}`;
  return spec.field === 'fileIoThreads' ? `${base}. Takes effect when the Hub restarts.` : base;
}

interface HubRowProps {
  readonly spec: HubRowSpec;
  readonly settings: DriveSettings;
  readonly busy: boolean;
  readonly save: (field: HubTuningField, value: number) => Promise<unknown>;
}

function hubResetOf(
  spec: HubRowSpec,
  settings: DriveSettings,
  save: HubRowProps['save'],
): TextEditReset | null {
  const standard = HUB_DEFAULTS[spec.field];
  if (standard === null || hubIsDefault(settings, spec.field)) return null;
  return {
    label: 'Reset',
    spoken: `Reset ${spec.title.toLowerCase()} to ${hubValueText(spec.field, standard)}`,
    run: () => save(spec.field, standard),
  };
}

function useHubRequest(
  { spec, settings, save }: HubRowProps,
  opener: TextEditRequest['opener'],
): TextEditRequest {
  const initial =
    spec.field === 'listingCacheSeconds'
      ? `${String(settings[spec.field])}s`
      : String(settings[spec.field]);
  const reset = hubResetOf(spec, settings, save);
  return {
    id: `drive.sync-mount.advanced.${spec.field}`,
    opener,
    title: spec.title,
    label: spec.label,
    ...(reset === null ? {} : { reset }),
    initial,
    placeholder: initial,
    confirmLabel: 'Save',
    maxLength: NUMBER_LENGTH,
    kind: spec.field === 'listingCacheSeconds' ? 'text' : 'number',
    helper: spec.helper,
    problemOf: (text) => hubProblemOf(spec.field, text),
    save: async (text): Promise<void> => {
      await save(spec.field, hubEntryOf(spec.field, text));
    },
  };
}

function HubRow(props: HubRowProps): ReactNode {
  const { spec, settings } = props;
  const opener = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const request = useHubRequest(props, opener);
  const stacked = useStackedValue();
  return (
    <>
      <ListRow
        title={spec.title}
        icon={spec.icon}
        {...valueLinesOf(
          stacked,
          hubValueText(spec.field, settings[spec.field]),
          hubSubtitleOf(spec),
        )}
        wrapSubtitle
        chevron
        pressRef={opener}
        disabled={props.busy}
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

function HubTuning({ settings }: { readonly settings: DriveSettings }): ReactNode {
  const client = useQueryClient();
  const mutation = useMutationState();
  const reset = hubResetAll(settings);
  const save = (field: HubTuningField, value: number): Promise<DriveSettings> =>
    saveDriveSettings(client, { [field]: value });
  return (
    <View className="gap-4">
      <GroupHeading
        title="Hub, for every computer"
        caption="Shared by every computer that mounts the drive."
        action={
          Object.keys(reset).length === 0 ? null : (
            <SectionAction
              label="Reset all"
              spoken="Reset every Hub setting"
              onPress={() => {
                mutation.run(() => saveDriveSettings(client, reset), {
                  failure: 'The Hub settings were not reset',
                  label: 'drive_tuning.hub_reset',
                });
              }}
            />
          )
        }
      />
      <List inset>
        {HUB_ROWS.map((spec) => (
          <HubRow
            key={spec.field}
            spec={spec}
            settings={settings}
            busy={mutation.busy}
            save={save}
          />
        ))}
      </List>
    </View>
  );
}

function HubTuningLoader(): ReactNode {
  const settings = useDriveSettings();
  if (settings.data === undefined) {
    return (
      <SettingsQueryState
        query={settings}
        event="drive_settings.tuning_refetch_failed"
        rows={HUB_ROWS.length}
        failed="The Hub settings could not be read"
      />
    );
  }
  return <HubTuning settings={settings.data} />;
}

function AdvancedBody(): ReactNode {
  const drive = useDesktopDrive();
  const owner = useIsOwner();
  const state = drive?.state ?? null;
  return (
    <View className="gap-8">
      {state === null ? (
        <EmptyState
          compact
          icon="folderSync"
          title="Waiting for the computer service"
          body="This computer has not reported its drive yet. Its mount settings show here once the computer service is running."
        />
      ) : (
        <ComputerTuning state={state} />
      )}
      {owner ? <HubTuningLoader /> : null}
    </View>
  );
}

export function AdvancedMountSection(): ReactNode {
  return (
    <DriveSettingsSection>
      <AdvancedBody />
    </DriveSettingsSection>
  );
}
