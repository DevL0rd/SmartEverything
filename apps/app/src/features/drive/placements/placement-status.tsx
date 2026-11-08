import type { ReactNode } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import type {
  DrivePlacement,
  DrivePlacementBasicLimits,
  DrivePlacementHold,
  DrivePlacementMode,
  DrivePlacementStatus,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import type { StatusTone } from '../../../components/tone';
import { bytes } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';

export type PlacementTone = StatusTone | null;

export type PlacementUpgrade = 'winfsp' | 'fuse3' | null;

export interface PlacementWords {
  readonly tone: PlacementTone;
  readonly line: string;
  readonly notes: readonly string[];
  readonly upgrade: PlacementUpgrade;
  readonly held: boolean;
}

export const WINFSP_URL = 'https://winfsp.dev/rel/';

export const MODE_WORD: Readonly<Record<DrivePlacementMode, string>> = {
  synced: 'Synced',
  mounted: 'Mounted only',
};

export const ROUTE_WORD = { local: 'home network', remote: 'public address' } as const;

const HOLD_LINE: Readonly<Record<DrivePlacementHold, string>> = {
  trashed: 'Stopped · folder is in the trash',
  no_access: 'Stopped · no access to this folder any more',
  sync_off: 'Stopped · sync is off for this folder',
};

const READ_ONLY_NOTE = 'Read only until write-back arrives';

interface Line {
  readonly tone: PlacementTone;
  readonly line: string;
}

export function basicLimitsOf(limits: DrivePlacementBasicLimits): string {
  return joinParts([
    'Basic',
    limits.maxFileBytes === null ? null : `${bytes(limits.maxFileBytes)} file limit`,
    limits.wholeFileOpen ? 'files open whole' : null,
    'not available offline',
  ]);
}

export function upgradeOf(limits: DrivePlacementBasicLimits | null): PlacementUpgrade {
  if (limits === null || limits.wholeFileOpen) return null;
  return limits.maxFileBytes === null ? 'fuse3' : 'winfsp';
}

function openFilesOf(status: DrivePlacementStatus): string | null {
  return status.openFiles === 0 ? null : `${plural(status.openFiles, 'file')} open`;
}

function waitingOf(status: DrivePlacementStatus): string | null {
  return status.pendingUploads === 0 ? null : `${plural(status.pendingUploads, 'upload')} waiting`;
}

function mountedLine(status: DrivePlacementStatus): string {
  return joinParts([
    MODE_WORD.mounted,
    status.tier === 'basic' ? 'basic' : null,
    status.route === null ? null : ROUTE_WORD[status.route],
    openFilesOf(status),
  ]);
}

function offlineLine(mode: DrivePlacementMode, status: DrivePlacementStatus): string {
  if (mode === 'synced') return joinParts(['Offline', waitingOf(status) ?? 'local copy stays']);
  if (status.tier === 'basic') return 'Offline';
  return joinParts([
    'Offline',
    status.pinnedBytes === 0 ? 'nothing kept offline' : `${bytes(status.pinnedBytes)} kept offline`,
  ]);
}

function syncingLine(status: DrivePlacementStatus, needBytes: number): string {
  return joinParts([
    'Syncing',
    needBytes === 0 ? null : `${bytes(needBytes)} left`,
    waitingOf(status),
  ]);
}

function stateLine(placement: DrivePlacement, needBytes: number): Line {
  const { status, mode } = placement;
  switch (status.state) {
    case 'starting':
      return { tone: 'info', line: mode === 'mounted' ? 'Mounting' : 'Starting sync' };
    case 'mounted':
      return { tone: 'positive', line: mountedLine(status) };
    case 'syncing':
      return { tone: 'info', line: syncingLine(status, needBytes) };
    case 'up_to_date':
      return { tone: 'positive', line: 'Synced · up to date' };
    case 'offline':
      return { tone: null, line: offlineLine(mode, status) };
    case 'stopped':
      return { tone: null, line: joinParts(['Stopped', status.reason]) };
    case 'failed':
      return { tone: 'critical', line: joinParts(['Failed', status.reason]) };
    case 'blocked':
      return { tone: 'warning', line: joinParts(['Blocked', status.reason]) };
  }
}

function notesOf(placement: DrivePlacement): readonly string[] {
  const { status, mode } = placement;
  return [
    ...(status.basicLimits === null ? [] : [basicLimitsOf(status.basicLimits)]),
    ...(mode === 'mounted' && status.readOnly ? [READ_ONLY_NOTE] : []),
  ];
}

export function placementWordsOf(placement: DrivePlacement, needBytes: number): PlacementWords {
  if (placement.hold !== null) {
    return {
      tone: 'warning',
      line: HOLD_LINE[placement.hold],
      notes: [],
      upgrade: null,
      held: true,
    };
  }
  if (!placement.enabled) {
    return { tone: null, line: 'Paused', notes: [], upgrade: null, held: false };
  }
  const { tone, line } = stateLine(placement, needBytes);
  return {
    tone,
    line,
    notes: notesOf(placement),
    upgrade: upgradeOf(placement.status.basicLimits),
    held: false,
  };
}

function UpgradeOffer({
  upgrade,
  computer,
}: {
  readonly upgrade: PlacementUpgrade;
  readonly computer: string;
}): ReactNode {
  if (upgrade === 'fuse3') {
    return (
      <Text variant="footnote" tone="variant">
        {`Install fuse3 on ${computer} for the full version, with offline files and no file limit.`}
      </Text>
    );
  }
  if (upgrade === 'winfsp') {
    return (
      <View className="flex-row flex-wrap items-center gap-x-2">
        <Text variant="footnote" tone="variant" className="min-w-0 shrink">
          {`Install WinFsp on ${computer} for the full version.`}
        </Text>
        <Button
          label="Get WinFsp"
          variant="text"
          icon="externalLink"
          onPress={() => {
            background(Linking.openURL(WINFSP_URL), 'url.open_failed');
          }}
        />
      </View>
    );
  }
  return null;
}

export function PlacementNotes({
  words,
  computer,
}: {
  readonly words: PlacementWords;
  readonly computer: string;
}): ReactNode {
  if (words.notes.length === 0 && words.upgrade === null) return null;
  return (
    <View className="gap-1">
      {words.notes.map((note) => (
        <Text key={note} variant="footnote" tone="variant">
          {note}
        </Text>
      ))}
      <UpgradeOffer upgrade={words.upgrade} computer={computer} />
    </View>
  );
}
