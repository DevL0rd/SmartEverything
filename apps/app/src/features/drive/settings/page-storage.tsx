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
import { bytes } from '../../../format/number';
import { sentenceCase } from '../../../format/text';
import { moment } from '../../../format/time';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import { useIsPhone } from '../../../design/size-class';
import { useMinute } from '../../../store/clock';
import { useMutationState } from '../../../store/mutation';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { useIsOwner } from '../../../store/selectors';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { trackSetting } from '../../settings';
import { useDriveBackupStatus, useDriveHealth, useDriveQuotas, useDriveUsage } from '../data';
import { SCRUB_EXPLAINER, ScrubProgress, damagedText } from '../storage/scrub-progress';
import { gigabytesInitialOf, gigabytesOf, gigabytesProblemOf } from './gigabytes';
import { DriveSettingsSection } from './page';
import { SettingsQueryState } from './settings-query-state';
import { NUMBER_LENGTH } from './page-sharing';
import { ScrubScheduleRow } from './page-storage-schedule';

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

export function scrubLineOf(scrub: DriveScrubState, now: number): StatusLine {
  if (scrub.state === 'running') {
    return {
      text: `Reading every file back from the disk · started ${moment(scrub.startedAt, now)}`,
      tone: 'variant',
    };
  }
  if (scrub.state === 'stopped') {
    return {
      text: `Stopped · started ${moment(scrub.startedAt, now)} · Scrub now carries on`,
      tone: 'variant',
    };
  }
  const tone: Tone = scrub.corrupt === 0 ? 'variant' : 'critical';
  if (scrub.lastFinishedAt === null) {
    return { text: `Not checked yet · ${SCRUB_EXPLAINER.toLowerCase()}`, tone: 'variant' };
  }
  return {
    text: `Last checked ${moment(scrub.lastFinishedAt, now)} · ${damagedText(scrub.corrupt)}`,
    tone,
  };
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function backupLineOf(status: DriveBackupStatus, now: number): StatusLine {
  const last = status.last;
  if (last === null) return { text: 'No backup has reported in yet', tone: 'variant' };
  const when = moment(last.at, now);
  if (last.ok) {
    return {
      text: `${sentenceCase(when)} · ${bytes(last.bytes)} · from ${last.reporter}`,
      tone: 'positive',
    };
  }
  const good =
    status.lastOkAt === null
      ? 'no good backup yet'
      : `last good ${lowerFirst(moment(status.lastOkAt, now))}`;
  return {
    text: `Failed ${lowerFirst(when)} · from ${last.reporter} · ${good}`,
    tone: 'critical',
  };
}

export type QuotaTarget = Pick<QuotaLine, 'profileId' | 'name' | 'quota'>;

export function useQuotaRequest(
  line: QuotaTarget,
  opener: TextEditRequest['opener'],
): TextEditRequest {
  const client = useQueryClient();
  return {
    id: `drive.storage.quota.${line.profileId}`,
    opener,
    title: `Space for ${line.name}`,
    label: 'Limit in GB',
    initial: gigabytesInitialOf(line.quota),
    placeholder: 'No limit',
    confirmLabel: 'Save',
    maxLength: NUMBER_LENGTH,
    kind: 'number',
    allowEmpty: true,
    helper: 'Files, earlier versions and trash all count. Leave it empty for no limit.',
    problemOf: gigabytesProblemOf,
    save: (text) => saveQuota(client, line.profileId, gigabytesOf(text)),
  };
}

function QuotaBar({
  line,
  share,
}: {
  readonly line: QuotaLine;
  readonly share: number;
}): ReactNode {
  return (
    <ProgressBar
      progress={share}
      colour={line.tone === 'critical' ? 'critical' : 'primary'}
      label={line.subtitle}
    />
  );
}

function quotaBarOf(line: QuotaLine, below: boolean): { below?: ReactNode; trailing?: ReactNode } {
  if (line.share === null) return {};
  const bar = <QuotaBar line={line} share={line.share} />;
  return below ? { below: bar } : { trailing: <View className="w-24">{bar}</View> };
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
  const phone = useIsPhone();
  return (
    <>
      <ListRow
        title={line.name}
        icon="user"
        subtitle={line.subtitle}
        subtitleTone={line.tone}
        wrapSubtitle
        {...quotaBarOf(line, phone)}
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
  const title = owner ? 'Space per person' : 'Your space';
  if (usage.data === undefined) {
    return (
      <SettingsQueryState
        query={usage}
        event="drive_settings.usage_refetch_failed"
        rows={Math.max(1, people.length)}
        failed="Space use could not be read"
        title={title}
      />
    );
  }
  const limits = quotas.data ?? [];
  const editable = owner && quotas.data !== undefined;
  return (
    <List inset title={title}>
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
  if (!owner || scrub.state === 'running') return null;
  return (
    <Button
      label="Scrub now"
      icon="shield"
      variant="tonal"
      loading={mutation.busy}
      onPress={() => {
        mutation.run(() => scrubNow(client), {
          failure: 'The check did not start',
          label: 'drive_scrub.start',
        });
      }}
    />
  );
}

function ScrubRow({
  health,
  owner,
}: {
  readonly health: DriveHealth;
  readonly owner: boolean;
}): ReactNode {
  const scrub = health.scrub;
  const line = scrubLineOf(scrub, useMinute());
  const stacked = useIsPhone();
  const action = <ScrubTrailing scrub={scrub} owner={owner} />;
  return (
    <View>
      <ListRow
        title="Check files for damage"
        icon="shield"
        iconTone={health.corrupt > 0 ? 'critical' : 'variant'}
        subtitle={line.text}
        subtitleTone={line.tone}
        wrapSubtitle
        {...(stacked ? {} : { trailing: action })}
      />
      {stacked && owner && scrub.state !== 'running' ? (
        <View className="flex-row pb-3 pl-18 pr-4">{action}</View>
      ) : null}
      {scrub.state === 'idle' ? null : (
        <View className="px-4 pb-3">
          <ScrubProgress scrub={scrub} />
        </View>
      )}
    </View>
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

const CHECKS_TITLE = 'Checks and backups';

function ChecksList({ owner }: { readonly owner: boolean }): ReactNode {
  const health = useDriveHealth();
  const backup = useDriveBackupStatus(owner);
  if (health.data === undefined) {
    return (
      <SettingsQueryState
        query={health}
        event="drive_settings.health_refetch_failed"
        rows={owner ? 4 : 2}
        failed="Checks could not be read"
        title={CHECKS_TITLE}
      />
    );
  }
  return (
    <List inset title={CHECKS_TITLE}>
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
    <DriveSettingsSection>
      <View className="gap-3">
        <QuotaList owner={owner} />
        <ChecksList owner={owner} />
      </View>
    </DriveSettingsSection>
  );
}
