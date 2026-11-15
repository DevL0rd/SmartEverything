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
import { Disclosure } from '../../../components/disclosure';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { List, Section, SectionAction } from '../../../components/section';
import { desktopBridge } from '../../../design/platform';
import { useIsOwner } from '../../../store/selectors';
import { useMutationState } from '../../../store/mutation';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { trackSetting } from '../../settings';
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
import { TuningRow } from './advanced-row';
import {
  COMPUTER_GROUPS,
  HUB_ROWS,
  subtitleOf,
  type HubRowSpec,
  type TuningRowSpec,
} from './advanced-rows';
import { SettingsQueryState, saveDriveSettings } from './page-indexing';
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
    <Section
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
    >
      <View className="gap-4">
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
    </Section>
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
  readonly apply: (field: HubTuningField, value: number) => void;
  readonly save: (field: HubTuningField, value: number) => Promise<unknown>;
}

function useHubRequest(
  { spec, settings, save }: HubRowProps,
  opener: TextEditRequest['opener'],
): TextEditRequest {
  const initial =
    spec.field === 'listingCacheSeconds'
      ? `${String(settings[spec.field])}s`
      : String(settings[spec.field]);
  return {
    id: `drive.sync-mount.advanced.${spec.field}`,
    opener,
    title: spec.title,
    label: spec.title,
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

function HubReset({ spec, settings, busy, apply }: HubRowProps): ReactNode {
  const standard = HUB_DEFAULTS[spec.field];
  if (standard === null || hubIsDefault(settings, spec.field)) return undefined;
  return (
    <IconButton
      icon="reset"
      label={`Reset ${spec.title.toLowerCase()} to its default`}
      disabled={busy}
      onPress={() => {
        apply(spec.field, standard);
      }}
    />
  );
}

function HubRow(props: HubRowProps): ReactNode {
  const { spec, settings } = props;
  const opener = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const request = useHubRequest(props, opener);
  return (
    <>
      <ListRow
        title={spec.title}
        icon={spec.icon}
        subtitle={hubSubtitleOf(spec)}
        wrapSubtitle
        value={hubValueText(spec.field, settings[spec.field])}
        chevron
        pressRef={opener}
        disabled={props.busy}
        onPress={() => {
          setOpen(true);
        }}
        trailing={<HubReset {...props} />}
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
  const apply = (field: HubTuningField, value: number): void => {
    mutation.run(() => save(field, value), {
      failure: 'The Hub setting did not change',
      label: 'drive_tuning.hub',
    });
  };
  return (
    <List
      inset
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
    >
      {HUB_ROWS.map((spec) => (
        <HubRow
          key={spec.field}
          spec={spec}
          settings={settings}
          busy={mutation.busy}
          apply={apply}
          save={save}
        />
      ))}
    </List>
  );
}

function HubTuningLoader(): ReactNode {
  const settings = useDriveSettings();
  if (settings.data === undefined) {
    return <SettingsQueryState query={settings} event="drive_settings.tuning_refetch_failed" />;
  }
  return <HubTuning settings={settings.data} />;
}

export function AdvancedSettings({ state }: ComputerProps): ReactNode {
  const [open, setOpen] = useState(false);
  const owner = useIsOwner();
  return (
    <Disclosure
      label="Advanced"
      accessibleLabel="Advanced mount settings"
      hint="Kernel, cache, upload and connection tuning"
      open={open}
      onToggle={() => {
        setOpen(!open);
      }}
      bodyClassName="gap-6 pt-2"
    >
      <ComputerTuning state={state} />
      {owner ? <HubTuningLoader /> : null}
    </Disclosure>
  );
}
