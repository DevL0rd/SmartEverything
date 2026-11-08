import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS,
  type DriveBackupStatus,
  type DriveHealth,
  type DriveQuota,
  type DriveScrubState,
  type DriveUsage,
  type ProfileRow,
} from '@smarteverything/domain';
import { setDriveQuota, startDriveScrub } from '../../../api/drive';
import { Button } from '../../../components/button';
import { ProgressBar } from '../../../components/charts/progress-bar';
import { CopyButton } from '../../../components/copy-button';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import type { Tone } from '../../../components/tone';
import { usePausable } from '../../../design/external-store';
import { bytes, count } from '../../../format/number';
import { moment } from '../../../format/time';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import { useMinute } from '../../../store/clock';
import { useMutationState } from '../../../store/mutation';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { useIsOwner } from '../../../store/selectors';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { trackSetting } from '../../settings/settings-log';
import {
  driveProgress,
  useDriveBackupStatus,
  useDriveHealth,
  useDriveQuotas,
  useDriveUsage,
  type DriveProgress,
} from '../../nas/data';
import { DriveSettingsSection } from './page';
import { SettingsQueryState } from './page-indexing';
import { NUMBER_LENGTH } from './page-sharing';
import { ScrubScheduleRow } from './page-storage-schedule';

const GIB = 1024 ** 3;

const DECIMAL_NUMBER = /^\d+(\.\d+)?$/;

export const QUOTAS_KEY = driveKey('quotas', null);

export const HEALTH_KEY = driveKey('health', DRIVE_EVERYWHERE);

export const REPORT_ADDRESS = `${API_ENDPOINTS.reportBackup.method} ${API_ENDPOINTS.reportBackup.path}`;

export interface StatusLine {
  readonly text: string;
  readonly tone: Tone;
}

export interface QuotaLine {
  readonly profileId: string;
  readonly name: string;
  readonly quota: number | null;
  readonly share: number | null;
  readonly subtitle: string;
  readonly tone: Tone;
}

export function usedOf(usage: DriveUsage | undefined): number {
  return usage === undefined ? 0 : usage.live + usage.versions + usage.trash;
}

export function quotaLineOf(
  person: ProfileRow,
  usage: readonly DriveUsage[],
  quotas: readonly DriveQuota[],
): QuotaLine {
  const used = usedOf(usage.find((entry) => entry.profileId === person.id));
  const quota = quotas.find((entry) => entry.profileId === person.id)?.bytes ?? null;
  const full = quota !== null && used >= quota;
  return {
    profileId: person.id,
    name: person.name,
    quota,
    share: quota === null ? null : quota === 0 ? 1 : Math.min(1, used / quota),
    subtitle:
      quota === null ? `${bytes(used)} used · no limit` : `${bytes(used)} used of ${bytes(quota)}`,
    tone: full ? 'critical' : 'variant',
  };
}

export function quotaBytesOf(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!DECIMAL_NUMBER.test(trimmed)) throw new QuotaEntryError(`${trimmed} is not a size in GB.`);
  return Math.round(Number(trimmed) * GIB);
}

export function quotaProblemOf(text: string): string | null {
  return DECIMAL_NUMBER.test(text.trim()) ? null : 'Use a size in GB, such as 250 or 1.5';
}

export function quotaInitialOf(quota: number | null): string {
  return quota === null ? '' : String(Math.round((quota / GIB) * 10) / 10);
}

class QuotaEntryError extends Error {
  override readonly name = 'QuotaEntryError';
}

export async function saveQuota(
  client: QueryClient,
  profileId: string,
  quota: number | null,
): Promise<void> {
  await trackSetting('drive_quota.save', { profileId, limited: quota !== null }, () =>
    setDriveQuota({ profileId, bytes: quota }),
  );
  await client.invalidateQueries({ queryKey: QUOTAS_KEY });
}

export async function scrubNow(client: QueryClient): Promise<DriveScrubState> {
  const scrub = await trackSetting('drive_scrub.start', {}, startDriveScrub);
  client.setQueryData<DriveHealth>(HEALTH_KEY, (health) =>
    health === undefined ? health : { ...health, scrub },
  );
  return scrub;
}

export function liveScrubShare(progress: DriveProgress): number | null {
  const steps = Object.values(progress).flatMap((root) =>
    root.scrub === undefined ? [] : [root.scrub],
  );
  const total = steps.reduce((sum, step) => sum + step.total, 0);
  if (total === 0) return null;
  return steps.reduce((sum, step) => sum + step.done, 0) / total;
}

function damagedLine(corrupt: number): StatusLine {
  if (corrupt === 0) return { text: 'nothing damaged', tone: 'variant' };
  const files = corrupt === 1 ? '1 file' : `${count(corrupt)} files`;
  return { text: `${files} damaged`, tone: 'critical' };
}

export function scrubLineOf(scrub: DriveScrubState, now: number): StatusLine {
  const damaged = damagedLine(scrub.corrupt);
  if (scrub.state === 'idle') {
    if (scrub.lastFinishedAt === null) return { text: 'Not checked yet', tone: 'variant' };
    return {
      text: `Last checked ${moment(scrub.lastFinishedAt, now)} · ${damaged.text}`,
      tone: damaged.tone,
    };
  }
  const reached = `${count(scrub.checked)} of ${count(scrub.total)}`;
  if (scrub.state === 'running') {
    return { text: `Checking · ${reached} · ${damaged.text}`, tone: damaged.tone };
  }
  return { text: `Stopped at ${reached} · Scrub now carries on`, tone: damaged.tone };
}

export function backupLineOf(status: DriveBackupStatus, now: number): StatusLine {
  const last = status.last;
  if (last === null) return { text: 'No backup has reported in yet', tone: 'variant' };
  const when = moment(last.at, now);
  if (last.ok) {
    return {
      text: `Last ${when} · ${bytes(last.bytes)} · from ${last.reporter}`,
      tone: 'positive',
    };
  }
  const good =
    status.lastOkAt === null ? 'no good backup yet' : `last good ${moment(status.lastOkAt, now)}`;
  return { text: `Last run ${when} failed · from ${last.reporter} · ${good}`, tone: 'critical' };
}

function useQuotaRequest(line: QuotaLine, opener: TextEditRequest['opener']): TextEditRequest {
  const client = useQueryClient();
  return {
    id: `drive.storage.quota.${line.profileId}`,
    opener,
    title: `Space for ${line.name}`,
    label: 'Limit in GB',
    initial: quotaInitialOf(line.quota),
    placeholder: 'No limit',
    confirmLabel: 'Save',
    maxLength: NUMBER_LENGTH,
    kind: 'number',
    allowEmpty: true,
    helper: 'Files, earlier versions and trash all count. Leave it empty for no limit.',
    problemOf: quotaProblemOf,
    save: (text) => saveQuota(client, line.profileId, quotaBytesOf(text)),
  };
}

function QuotaBar({ line }: { readonly line: QuotaLine }): ReactNode {
  if (line.share === null) return null;
  return (
    <View className="w-24">
      <ProgressBar
        progress={line.share}
        colour={line.tone === 'critical' ? 'critical' : 'primary'}
        label={line.subtitle}
      />
    </View>
  );
}

function QuotaRow({
  line,
  editable,
}: {
  readonly line: QuotaLine;
  readonly editable: boolean;
}): ReactNode {
  const opener = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const request = useQuotaRequest(line, opener);
  return (
    <>
      <ListRow
        title={line.name}
        icon="user"
        subtitle={line.subtitle}
        subtitleTone={line.tone}
        trailing={<QuotaBar line={line} />}
        chevron={editable}
        pressRef={opener}
        {...(editable
          ? {
              onPress: (): void => {
                setOpen(true);
              },
            }
          : {})}
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

function QuotaList({ owner }: { readonly owner: boolean }): ReactNode {
  const usage = useDriveUsage();
  const quotas = useDriveQuotas(owner);
  const everyone = useProfiles();
  const me = useActiveProfile();
  const people = owner ? everyone : me === null ? [] : [me];
  if (usage.data === undefined) {
    return <SettingsQueryState query={usage} event="drive_settings.usage_refetch_failed" />;
  }
  const limits = quotas.data ?? [];
  const editable = owner && quotas.data !== undefined;
  return (
    <List inset title={owner ? 'Space per person' : 'Your space'}>
      {people.map((person) => (
        <QuotaRow
          key={person.id}
          line={quotaLineOf(person, usage.data, limits)}
          editable={editable}
        />
      ))}
    </List>
  );
}

function ScrubTrailing({
  scrub,
  owner,
}: {
  readonly scrub: DriveScrubState;
  readonly owner: boolean;
}): ReactNode {
  const client = useQueryClient();
  const mutation = useMutationState();
  const share = liveScrubShare(usePausable(driveProgress.subscribe, driveProgress.get));
  const running = scrub.state === 'running';
  return (
    <View className="flex-row items-center gap-3">
      {running ? (
        <View className="w-24">
          <ProgressBar
            progress={share ?? (scrub.total === 0 ? 0 : scrub.checked / scrub.total)}
            colour="info"
            label="Checking for damage"
          />
        </View>
      ) : null}
      {owner ? (
        <Button
          label="Scrub now"
          icon="shield"
          variant="tonal"
          loading={mutation.busy}
          disabled={running}
          onPress={() => {
            mutation.run(() => scrubNow(client), {
              failure: 'The check did not start',
              label: 'drive_scrub.start',
            });
          }}
        />
      ) : null}
    </View>
  );
}

function ScrubRow({
  health,
  owner,
}: {
  readonly health: DriveHealth;
  readonly owner: boolean;
}): ReactNode {
  const line = scrubLineOf(health.scrub, useMinute());
  return (
    <ListRow
      title="Check files for damage"
      icon="shield"
      iconTone={health.corrupt > 0 ? 'critical' : 'variant'}
      subtitle={line.text}
      subtitleTone={line.tone}
      wrapSubtitle
      trailing={<ScrubTrailing scrub={health.scrub} owner={owner} />}
    />
  );
}

function BackupRow({ status }: { readonly status: DriveBackupStatus }): ReactNode {
  const line = backupLineOf(status, useMinute());
  return (
    <ListRow
      title="Last backup"
      icon="server"
      iconTone={line.tone === 'critical' ? 'critical' : 'variant'}
      subtitle={line.text}
      subtitleTone={line.tone}
      wrapSubtitle
    />
  );
}

function ReportRow(): ReactNode {
  return (
    <ListRow
      title="How a backup reports in"
      icon="info"
      subtitle={`Your backup tool sends ${REPORT_ADDRESS} with an owner access token after each run: who made it, its size and whether it worked.`}
      wrapSubtitle
      trailing={<CopyButton value={REPORT_ADDRESS} label="Copy the report address" />}
    />
  );
}

function ChecksList({ owner }: { readonly owner: boolean }): ReactNode {
  const health = useDriveHealth();
  const backup = useDriveBackupStatus(owner);
  if (health.data === undefined) {
    return <SettingsQueryState query={health} event="drive_settings.health_refetch_failed" />;
  }
  return (
    <List inset title="Checks and backups">
      <ScrubRow health={health.data} owner={owner} />
      {owner ? <ScrubScheduleRow /> : null}
      {backup.data === undefined ? null : <BackupRow status={backup.data} />}
      {owner ? <ReportRow /> : null}
    </List>
  );
}

export function StorageSection(): ReactNode {
  const owner = useIsOwner();
  return (
    <DriveSettingsSection section="storage">
      <View className="gap-3">
        <QuotaList owner={owner} />
        <ChecksList owner={owner} />
      </View>
    </DriveSettingsSection>
  );
}
