import type { ReactNode } from 'react';
import type { DriveItem } from '@smarteverything/domain';
import { useDriveRoots, useViewerId } from '../data';
import { detailsSubjectOf, type DetailsSubject } from '../details/details-model';
import { ActivityTab } from '../details/activity-tab';
import { VersionsTab } from '../details/versions-tab';
import { CommentsTab } from '../comments/comments-tab';
import { SharingTab } from '../share/sharing-tab';
import type { SourceTabSpec } from '../../files';
import { driveRequests } from './drive-actions';
import { useAllShared } from './drive-location';
import { isForeignRoot } from './drive-places';
import {
  driveTabIdsOf,
  itemOf,
  type DriveNode,
  type DriveOrigin,
  type DriveTabId,
} from './drive-node';

const TAB_LABEL: Readonly<Record<DriveTabId, string>> = {
  comments: 'Comments',
  versions: 'Versions',
  activity: 'Activity',
  sharing: 'Sharing',
};

export function useDriveSubject(node: DriveNode): DetailsSubject | null {
  return useItemSubject(itemOf(node));
}

export function useItemSubject(item: DriveItem | null): DetailsSubject | null {
  const roots = useDriveRoots();
  const viewerId = useViewerId();
  const foreign = item !== null && isForeignRoot(roots, item.rootId, viewerId);
  const shared = useAllShared(foreign);
  if (item === null) return null;
  return detailsSubjectOf({ roots, viewerId, shared: shared.entries }, item);
}

function shareNode(node: DriveNode): void {
  driveRequests.set({ kind: 'share', nodes: [node] });
}

interface TabProps {
  readonly node: DriveNode;
}

function CommentsPane({ node }: TabProps): ReactNode {
  const subject = useDriveSubject(node);
  return subject === null ? null : <CommentsTab key={node.key} subject={subject} />;
}

function VersionsPane({ node }: TabProps): ReactNode {
  const subject = useDriveSubject(node);
  return subject === null ? null : <VersionsTab key={node.key} subject={subject} />;
}

function ActivityPane({ node }: TabProps): ReactNode {
  const subject = useDriveSubject(node);
  return subject === null ? null : <ActivityTab key={node.key} subject={subject} />;
}

function SharingPane({ node }: TabProps): ReactNode {
  const subject = useDriveSubject(node);
  if (subject === null) return null;
  return (
    <SharingTab
      key={node.key}
      subject={subject}
      onShare={() => {
        shareNode(node);
      }}
    />
  );
}

const TABS: Readonly<Record<DriveTabId, SourceTabSpec<DriveOrigin>>> = {
  comments: { id: 'comments', label: TAB_LABEL.comments, Tab: CommentsPane },
  versions: { id: 'versions', label: TAB_LABEL.versions, Tab: VersionsPane },
  activity: { id: 'activity', label: TAB_LABEL.activity, Tab: ActivityPane },
  sharing: { id: 'sharing', label: TAB_LABEL.sharing, Tab: SharingPane },
};

export function driveTabsOf(node: DriveNode): readonly SourceTabSpec<DriveOrigin>[] {
  return driveTabIdsOf(node).map((id) => TABS[id]);
}
