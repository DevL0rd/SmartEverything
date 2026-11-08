import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import type { DriveItem, DriveRoot, DriveVersion } from '@smarteverything/domain';
import { Arc, Bars } from '../../../components/charts';
import { Button } from '../../../components/button';
import { CopyButton } from '../../../components/copy-button';
import { Text } from '../../../components/text';
import type { StatusTone } from '../../../components/tone';
import { notifyFailure } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import type { ColourRole } from '../../../design/tokens';
import { count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { moment } from '../../../format/time';
import { readMinute, useDayKey } from '../../../store/clock';
import { useActiveProfile } from '../../../store/people';
import { sameJson } from '../../../store/same-json';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { flattenPages, useDriveSyncClients, useDriveVersions } from '../../nas/data';
import { openItemFile } from '../folder/folder-footer';
import { useByName } from '../folder/folder-list';
import { itemsText } from '../folder/folder-model';
import { haveShare } from '../roots/root-card-model';
import { useRootSyncLine } from '../roots/sync-status-line';
import {
  RING_SIZE,
  RING_THICKNESS,
  changedByOf,
  computerRingsOf,
  dimensionsOf,
  editWindowStart,
  editsPerDay,
  editsTotal,
  integrityOf,
  needsOlderVersions,
  pathOf,
  previewableOf,
  sizeTextOf,
  whereOf,
  whoSeesOf,
  type ComputerRing,
  type DetailsSubject,
  type IntegrityLine,
} from './details-model';
import { PreviewPicture } from './preview-tab';

function Fact({
  label,
  first = false,
  children,
}: {
  readonly label: string;
  readonly first?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      className={cn(
        'min-h-row-h flex-row items-center gap-3 px-4 py-2',
        first ? '' : 'border-t border-outline-variant',
      )}
    >
      <Text variant="footnote" tone="variant" className="w-24 shrink-0">
        {label}
      </Text>
      <View className="min-w-0 flex-1 flex-row items-center gap-2">{children}</View>
    </View>
  );
}

function Value({
  text,
  mono = false,
  tone,
}: {
  readonly text: string;
  readonly mono?: boolean;
  readonly tone?: 'positive' | 'critical' | 'variant';
}): ReactNode {
  return (
    <Text
      variant="callout"
      selectable
      numberOfLines={mono ? 1 : 2}
      {...(tone === undefined ? {} : { tone })}
      className={cn('tabular min-w-0 flex-1', mono ? 'font-mono' : '')}
    >
      {text}
    </Text>
  );
}

function integrityTone(line: IntegrityLine): 'positive' | 'critical' | 'variant' {
  return line.tone === 'positive' || line.tone === 'critical' ? line.tone : 'variant';
}

function deviceLabelsIn(state: StoreState, deviceIds: readonly string[]): readonly string[] {
  return deviceIds.map((deviceId) => state.tables.devices.byId[deviceId]?.label ?? '');
}

function useDeviceName(versions: readonly DriveVersion[]): (deviceId: string) => string | null {
  const deviceIds = [
    ...new Set(
      versions.flatMap((version) => (version.deviceId === null ? [] : [version.deviceId])),
    ),
  ];
  const labels = useStoreSelector((state) => deviceLabelsIn(state, deviceIds), sameJson, [
    deviceIds.join('\n'),
  ]);
  const names = new Map(deviceIds.map((deviceId, index) => [deviceId, labels[index] ?? '']));
  return (deviceId) => {
    const name = names.get(deviceId);
    return name === undefined || name === '' ? null : name;
  };
}

interface EditHistory {
  readonly versions: readonly DriveVersion[];
  readonly today: string;
  readonly settled: boolean;
}

function useEditHistory(item: DriveItem): EditHistory {
  const today = useDayKey();
  const pages = useDriveVersions(item.id, item.rootId);
  const versions = flattenPages(pages.data, (page) => page.items);
  const older = needsOlderVersions(versions, editWindowStart(today), pages.hasNextPage);
  const fetching = pages.isFetchingNextPage;
  const { fetchNextPage } = pages;
  useEffect(() => {
    if (!older || fetching) return;
    fetchNextPage().catch(notifyFailure('Earlier versions could not be read.'));
  }, [older, fetching, fetchNextPage]);
  return { versions, today, settled: pages.data !== undefined && !older };
}

function stampOf(at: string, by: string | null): string {
  return joinParts([moment(at, readMinute()), by]);
}

function WhatFacts({ subject }: { readonly subject: DetailsSubject }): ReactNode {
  const { root, item } = subject;
  const dimensions = dimensionsOf(item);
  const path = pathOf(root, item);
  return (
    <>
      <Fact label="Kind" first>
        <Value text={sizeTextOf(item)} />
      </Fact>
      {dimensions === null ? null : (
        <Fact label="Dimensions">
          <Value text={dimensions} />
        </Fact>
      )}
      {item.kind === 'folder' ? (
        <Fact label="Contains">
          <Value text={itemsText(item.childCount)} />
        </Fact>
      ) : null}
      <Fact label="Where">
        <Value text={whereOf(root, item)} />
      </Fact>
      {path === null ? null : (
        <Fact label="Path">
          <Value text={path} mono />
          <CopyButton value={path} label="Copy path" />
        </Fact>
      )}
    </>
  );
}

function Facts({
  subject,
  history,
}: {
  readonly subject: DetailsSubject;
  readonly history: EditHistory;
}): ReactNode {
  const { root, item } = subject;
  const byName = useByName();
  const me = useActiveProfile()?.id ?? null;
  const deviceName = useDeviceName(history.versions);
  const changedBy = changedByOf(item, history.versions[0], byName, deviceName);
  const integrity = integrityOf(item);
  return (
    <View className="overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1">
      <WhatFacts subject={subject} />
      <Fact label="Modified">
        <Value text={stampOf(item.modifiedAt, changedBy)} />
      </Fact>
      <Fact label="Created">
        <Value text={stampOf(item.addedAt, byName(item.addedByProfileId))} />
      </Fact>
      <Fact label="Who sees it">
        <Value text={whoSeesOf(root, me, byName)} />
      </Fact>
      {integrity === null ? null : (
        <Fact label="Integrity">
          <Value text={integrity.text} tone={integrityTone(integrity)} />
        </Fact>
      )}
    </View>
  );
}

const RING_COLOUR: Readonly<Record<StatusTone | 'offline', ColourRole>> = {
  positive: 'positive',
  info: 'info',
  warning: 'warning',
  critical: 'critical',
  offline: 'track',
};

function useComputerRings(root: DriveRoot): readonly ComputerRing[] {
  const line = useRootSyncLine(root);
  const clients = useDriveSyncClients();
  if (line === null) return [];
  return computerRingsOf(line.computers, clients, (needBytes) => haveShare(root.bytes, needBytes));
}

function RingRow({ ring }: { readonly ring: ComputerRing }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={`${ring.name}, ${ring.word}`}
      className="flex-row items-center gap-2"
    >
      <View aria-hidden className="shrink-0">
        <Arc
          value={ring.share}
          size={RING_SIZE}
          thickness={RING_THICKNESS}
          colour={RING_COLOUR[ring.tone ?? 'offline']}
        />
      </View>
      <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
        {ring.name}
      </Text>
      <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
        {ring.word}
      </Text>
    </View>
  );
}

function OnComputers({ subject }: { readonly subject: DetailsSubject }): ReactNode {
  const rings = useComputerRings(subject.root);
  if (rings.length === 0) return null;
  return (
    <View className="gap-2">
      <Text variant="label" tone="variant">
        On your computers
      </Text>
      {rings.map((ring) => (
        <RingRow key={ring.key} ring={ring} />
      ))}
    </View>
  );
}

function Edits({ history }: { readonly history: EditHistory }): ReactNode {
  if (!history.settled) return null;
  const bars = editsPerDay(history.versions, history.today);
  const total = editsTotal(bars);
  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="label" tone="variant">
          Edits per day
        </Text>
        <Text variant="caption" tone="variant" className="tabular">
          {total === 0 ? 'No edits in 30 days' : `${count(total)} in 30 days`}
        </Text>
      </View>
      <Bars bars={bars} colour="primary" height={40} label="Edits per day over the last 30 days" />
    </View>
  );
}

function Actions({
  item,
  share,
}: {
  readonly item: DriveItem;
  readonly share: ((item: DriveItem) => void) | undefined;
}): ReactNode {
  const file = item.kind !== 'folder';
  if (!file && share === undefined) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {file ? (
        <Button
          label="Open"
          icon="externalLink"
          grow
          onPress={() => {
            openItemFile(item, false);
          }}
        />
      ) : null}
      {share === undefined ? null : (
        <Button
          label="Share"
          icon="share"
          variant="tonal"
          onPress={() => {
            share(item);
          }}
        />
      )}
      {file ? (
        <Button
          label="Download"
          icon="download"
          variant="tonal"
          onPress={() => {
            openItemFile(item, true);
          }}
        />
      ) : null}
    </View>
  );
}

function FileHistory({ subject }: { readonly subject: DetailsSubject }): ReactNode {
  const history = useEditHistory(subject.item);
  return (
    <>
      <Facts subject={subject} history={history} />
      <OnComputers subject={subject} />
      <Edits history={history} />
    </>
  );
}

const NO_HISTORY: EditHistory = { versions: [], today: '', settled: false };

export function InfoTab({
  subject,
  share,
  pane,
}: {
  readonly subject: DetailsSubject;
  readonly share: ((item: DriveItem) => void) | undefined;
  readonly pane: boolean;
}): ReactNode {
  const { item } = subject;
  return (
    <View className="gap-4">
      {previewableOf(item) ? <PreviewPicture item={item} /> : null}
      {pane ? <Actions item={item} share={share} /> : null}
      {item.kind === 'folder' ? (
        <>
          <Facts subject={subject} history={NO_HISTORY} />
          <OnComputers subject={subject} />
        </>
      ) : (
        <FileHistory subject={subject} />
      )}
    </View>
  );
}
