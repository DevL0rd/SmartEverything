import type { SyncthingFolder } from '@smarteverything/domain';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Badge } from '../../../components/badge';
import { ListRow } from '../../../components/list-row';
import { FolderRing } from './folder-ring';
import { folderState, kindChip } from './folder-model';

function folderSpoken(folder: SyncthingFolder): string {
  const kind = kindChip(folder);
  return `${folder.label}, ${folderState(folder).text}${kind === null ? '' : `, ${kind}`}`;
}

export function FolderRow({
  folder,
  onPress,
  href,
}: {
  readonly folder: SyncthingFolder;
  readonly onPress?: () => void;
  readonly href?: Href;
}): ReactNode {
  const state = folderState(folder);
  const kind = kindChip(folder);
  return (
    <ListRow
      title={folder.label}
      subtitle={state.text}
      subtitleTone={state.tone === 'critical' ? 'critical' : 'variant'}
      label={folderSpoken(folder)}
      leading={
        <FolderRing
          state={state}
          size={28}
          label={`${folder.label}, ${String(state.percent)} percent synced`}
        />
      }
      trailing={kind === null ? undefined : <Badge label={kind} />}
      chevron
      {...(onPress === undefined ? {} : { onPress })}
      {...(href === undefined ? {} : { href })}
    />
  );
}
