import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import type { DriveItem, DriveVersion } from '@smarteverything/domain';
import { Bars } from '../../../components/charts';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { count } from '../../../format/number';
import { useDayKey } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { InfoCard, InfoFact, InfoValue, type SourceInfoSpec } from '../../files';
import { FolderColourRow } from '../components/folder-colour';
import { flattenPages, useDriveGrantRows, useDriveVersions } from '../data';
import {
  editWindowStart,
  editsPerDay,
  editsTotal,
  integrityOf,
  needsOlderVersions,
  whoSeesOf,
  type DetailsSubject,
  type IntegrityLine,
} from '../details/details-model';
import { OnComputers } from '../details/on-computers';
import { driveInfoIdsOf, type DriveInfoId, type DriveNode, type DriveOrigin } from './drive-node';
import { useDriveSubject } from './drive-tabs';

export interface EditHistory {
  readonly versions: readonly DriveVersion[];
  readonly today: string;
  readonly settled: boolean;
}

export function useEditHistory(item: DriveItem): EditHistory {
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

export function useWhoSees(subject: DetailsSubject): string {
  const profiles = useProfiles();
  const grants = useDriveGrantRows();
  const { ownerProfileId, item, access } = subject;
  const nameOf = (profileId: string | null): string | null =>
    profiles.find((profile) => profile.id === profileId)?.name ?? null;
  return whoSeesOf({
    access,
    ownerName: nameOf(ownerProfileId),
    people: grants.flatMap((grant) => {
      if (grant.itemId !== item.id) return [];
      const name = nameOf(grant.profileId);
      return name === null ? [] : [name];
    }),
  });
}

export function integrityTone(line: IntegrityLine): 'positive' | 'critical' | 'variant' {
  return line.tone === 'positive' || line.tone === 'critical' ? line.tone : 'variant';
}

export function EditsChart({ history }: { readonly history: EditHistory }): ReactNode {
  if (!history.settled) return null;
  const bars = editsPerDay(history.versions, history.today);
  const total = editsTotal(bars);
  return (
    <View className="gap-2 rounded-lg border-hairline border-outline-variant bg-surface-1 p-4">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="label" tone="variant">
          Edits per day
        </Text>
        <Text variant="caption" tone="variant" className="tabular">
          {total === 0 ? 'No edits in 30 days' : `${count(total)} in 30 days`}
        </Text>
      </View>
      <Bars bars={bars} colour="primary" height={40} label="Edits per day over the last 30 days" />
      <View className="flex-row justify-between gap-3">
        <Text variant="caption" tone="variant">
          30 days ago
        </Text>
        <Text variant="caption" tone="variant">
          Today
        </Text>
      </View>
    </View>
  );
}

interface SectionProps {
  readonly node: DriveNode;
}

function AccessFacts({ subject }: { readonly subject: DetailsSubject }): ReactNode {
  const whoSees = useWhoSees(subject);
  const integrity = integrityOf(subject.item);
  return (
    <InfoCard>
      <InfoFact label="Who sees it" first>
        <InfoValue text={whoSees} />
      </InfoFact>
      {integrity === null ? null : (
        <InfoFact label="Integrity" first={false}>
          <InfoValue text={integrity.text} tone={integrityTone(integrity)} />
        </InfoFact>
      )}
    </InfoCard>
  );
}

function AccessSection({ node }: SectionProps): ReactNode {
  const subject = useDriveSubject(node);
  return subject === null ? null : <AccessFacts subject={subject} />;
}

function ColourSection({ node }: SectionProps): ReactNode {
  const subject = useDriveSubject(node);
  if (subject?.item.kind !== 'folder') return null;
  const { item } = subject;
  return (
    <View className="gap-2">
      <Text variant="body-strong">Colour</Text>
      <FolderColourRow key={`${item.id}:${item.colour ?? 'none'}`} folder={item} />
    </View>
  );
}

function ComputersSection({ node }: SectionProps): ReactNode {
  const subject = useDriveSubject(node);
  return subject === null ? null : <OnComputers rootId={subject.rootId} item={subject.item} />;
}

function EditsOf({ item }: { readonly item: DriveItem }): ReactNode {
  return <EditsChart history={useEditHistory(item)} />;
}

function EditsSection({ node }: SectionProps): ReactNode {
  const subject = useDriveSubject(node);
  return subject === null ? null : <EditsOf item={subject.item} />;
}

const SECTIONS: Readonly<Record<DriveInfoId, SourceInfoSpec<DriveOrigin>>> = {
  access: { id: 'access', Section: AccessSection },
  colour: { id: 'colour', Section: ColourSection },
  computers: { id: 'computers', Section: ComputersSection },
  edits: { id: 'edits', Section: EditsSection },
};

export function driveInfoSectionsOf(node: DriveNode): readonly SourceInfoSpec<DriveOrigin>[] {
  return driveInfoIdsOf(node).map((id) => SECTIONS[id]);
}
