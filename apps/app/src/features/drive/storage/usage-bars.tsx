import type { DriveQuota, DriveUsage } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { BarMarker } from '../../../components/charts/segment-bar';
import { ErrorState } from '../../../components/error-state';
import type { IconName } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { bytes } from '../../../format/number';
import { useIsOwner, useRows, useSession } from '../../../store/selectors';
import { useDriveQuotas, useDriveUsage } from '../../nas/data';

export interface ToneMix {
  readonly toward: 'on-surface' | 'bg';
  readonly share: number;
}

export interface PersonTone {
  readonly colour: ColourRole;
  readonly mix: ToneMix | null;
}

export interface UsageNames {
  readonly me: string | null;
  readonly personOf: (profileId: string) => string | null;
}

export interface UsageRow {
  readonly key: string;
  readonly name: string;
  readonly usedBytes: number;
  readonly quotaBytes: number | null;
  readonly tone: PersonTone;
}

const YOU_TONE: PersonTone = { colour: 'viz-blue', mix: null };
const GROUP_TONE: PersonTone = { colour: 'on-surface-faint', mix: null };
const KEPT_PER_STEP = 0.55;
const SHARED_KEY = 'shared';
const SHARED_NAME = 'Shared with home';
const UNKNOWN_PERSON = 'Someone';

export function otherPersonTone(step: number): PersonTone {
  if (step === 0) return { colour: 'viz-magenta', mix: null };
  const level = Math.ceil(step / 2);
  return {
    colour: 'viz-magenta',
    mix: { toward: step % 2 === 1 ? 'on-surface' : 'bg', share: 1 - KEPT_PER_STEP ** level },
  };
}

function usedOf(usage: DriveUsage): number {
  return usage.live + usage.versions + usage.trash;
}

function nameOf(profileId: string, names: UsageNames): string {
  return profileId === names.me ? 'You' : (names.personOf(profileId) ?? UNKNOWN_PERSON);
}

export function usageRowsOf(
  usage: readonly DriveUsage[],
  quotas: readonly DriveQuota[] | null,
  names: UsageNames,
): readonly UsageRow[] {
  const limits = new Map((quotas ?? []).map((quota) => [quota.profileId, quota.bytes]));
  const people = usage.flatMap((entry) => (entry.profileId === null ? [] : [entry]));
  const you = people.filter((entry) => entry.profileId === names.me);
  const others = people
    .filter((entry) => entry.profileId !== names.me)
    .sort((a, b) => usedOf(b) - usedOf(a));
  const shared = usage.filter((entry) => entry.profileId === null);
  const personRow = (entry: DriveUsage, tone: PersonTone): UsageRow => ({
    key: entry.profileId ?? SHARED_KEY,
    name: entry.profileId === null ? SHARED_NAME : nameOf(entry.profileId, names),
    usedBytes: usedOf(entry),
    quotaBytes: entry.profileId === null ? null : (limits.get(entry.profileId) ?? null),
    tone,
  });
  return [
    ...you.map((entry) => personRow(entry, YOU_TONE)),
    ...others.map((entry, step) => personRow(entry, otherPersonTone(step))),
    ...shared.map((entry) => personRow(entry, GROUP_TONE)),
  ];
}

export function usageScaleOf(rows: readonly UsageRow[], allUsedBytes: number): number {
  const used = rows.reduce((all, row) => all + row.usedBytes, 0);
  return Math.max(1, allUsedBytes, used, ...rows.map((row) => row.quotaBytes ?? 0));
}

export function usageValueOf(row: UsageRow, quotasKnown: boolean): string {
  if (row.quotaBytes !== null) return `${bytes(row.usedBytes)} of ${bytes(row.quotaBytes)} quota`;
  if (!quotasKnown || row.key === SHARED_KEY) return bytes(row.usedBytes);
  return `${bytes(row.usedBytes)} · no quota`;
}

function ToneFill({ tone, grow }: { readonly tone: PersonTone; readonly grow: number }): ReactNode {
  const base = useColour(tone.colour);
  const toward = useColour(tone.mix?.toward ?? 'bg');
  const paint = { flexGrow: grow, flexBasis: 0, backgroundColor: base } as const;
  const mix = { backgroundColor: toward, opacity: tone.mix?.share ?? 0 } as const;
  return (
    <View style={paint} className="h-full overflow-hidden rounded-full">
      {tone.mix === null ? null : <View style={mix} className="absolute inset-0" />}
    </View>
  );
}

function ToneDot({ tone }: { readonly tone: PersonTone }): ReactNode {
  return (
    <View className="size-2 flex-row overflow-hidden rounded-full">
      <ToneFill tone={tone} grow={1} />
    </View>
  );
}

function UsageTrack({ row, scale }: { readonly row: UsageRow; readonly scale: number }): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const share = Math.min(1, row.usedBytes / scale);
  const rest = { flexGrow: 1 - share, flexBasis: 0 } as const;
  return (
    <View className="h-4 w-full justify-center" onLayout={onLayout}>
      <View className="h-2 w-full flex-row overflow-hidden rounded-full bg-surface-3">
        {share > 0 ? <ToneFill tone={row.tone} grow={share} /> : null}
        <View style={rest} />
      </View>
      {row.quotaBytes === null ? null : (
        <BarMarker share={Math.min(1, row.quotaBytes / scale)} width={width} size="size-3" />
      )}
    </View>
  );
}

function UsageLine({
  row,
  scale,
  quotasKnown,
}: {
  readonly row: UsageRow;
  readonly scale: number;
  readonly quotasKnown: boolean;
}): ReactNode {
  const value = usageValueOf(row, quotasKnown);
  const spoken = `${row.name}, ${value}`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={spoken} className="gap-1">
      <View className="flex-row items-center gap-2">
        <ToneDot tone={row.tone} />
        <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
          {row.name}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular shrink-0">
          {value}
        </Text>
      </View>
      <UsageTrack row={row} scale={scale} />
    </View>
  );
}

export interface UsageRowsProps {
  readonly rows: readonly UsageRow[];
  readonly scale: number;
  readonly quotasKnown: boolean;
  readonly owner: boolean;
}

export function UsageRows({ rows, scale, quotasKnown, owner }: UsageRowsProps): ReactNode {
  return (
    <Card title={owner ? 'By person' : 'Your space'} icon="users">
      <Text variant="footnote" tone="variant">
        {quotasKnown
          ? 'Share of all used space · the dot marks a quota'
          : 'Share of all used space'}
      </Text>
      <View className="gap-3">
        {rows.map((row) => (
          <UsageLine key={row.key} row={row} scale={scale} quotasKnown={quotasKnown} />
        ))}
      </View>
    </Card>
  );
}

export interface CardQuery {
  readonly isError: boolean;
  readonly error: unknown;
  readonly refetch: () => Promise<unknown>;
}

export function StorageCardState({
  title,
  icon,
  query,
  failure,
}: {
  readonly title: string;
  readonly icon: IconName;
  readonly query: CardQuery;
  readonly failure: string;
}): ReactNode {
  return (
    <Card title={title} icon={icon}>
      {query.isError ? (
        <ErrorState
          error={query.error}
          retry={() => {
            background(query.refetch(), failure);
          }}
        />
      ) : (
        <Skeleton shape="tile" className="h-24" />
      )}
    </Card>
  );
}

function useUsageNames(): UsageNames {
  const me = useSession().client.profile_id;
  const people = new Map(useRows('profiles').map((person) => [person.id, person.name]));
  return { me, personOf: (id) => people.get(id) ?? null };
}

export function UsageBars({ usedBytes }: { readonly usedBytes: number }): ReactNode {
  const owner = useIsOwner();
  const usage = useDriveUsage();
  const quotas = useDriveQuotas(owner);
  const names = useUsageNames();
  const known = owner ? (quotas.data ?? null) : null;
  if (usage.data === undefined || (owner && quotas.data === undefined)) {
    const failed = usage.isError ? usage : quotas;
    return (
      <StorageCardState
        title={owner ? 'By person' : 'Your space'}
        icon="users"
        query={failed}
        failure="drive.storage.usage_refetch_failed"
      />
    );
  }
  const rows = usageRowsOf(usage.data, known, names);
  if (rows.length === 0) return null;
  return (
    <UsageRows
      rows={rows}
      scale={usageScaleOf(rows, usedBytes)}
      quotasKnown={known !== null}
      owner={owner}
    />
  );
}
