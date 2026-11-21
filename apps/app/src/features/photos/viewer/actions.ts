import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { DriveChange } from '@smarteverything/domain';
import { changeDrive, createDriveShare } from '../../../api/drive';
import { makeStackCover } from '../../../api/photos';
import { copyText } from '../../../components/copy-button';
import { notify } from '../../../components/toast-store';
import { useMutationState, type MutationState } from '../../../store/mutation';
import { shownDriveChange } from '../../drive';
import { dropPhotoItems } from '../data';
import { moveToTrash } from '../library/actions';
import type { MediaItem } from './info-model';

export interface ViewerActions {
  readonly busy: boolean;
  readonly favourite: () => void;
  readonly trash: () => void;
  readonly addToAlbum: (albumId: string, title: string) => void;
  readonly shareLink: () => void;
  readonly makeCover: (stackId: string, itemId: string) => void;
}

export function trashFromViewer(
  itemId: string,
  client: QueryClient,
  trash: typeof moveToTrash = moveToTrash,
): Promise<boolean> {
  return trash(
    [itemId],
    (landed) => {
      dropPhotoItems(client, landed);
    },
    shownDriveChange(client, changeDrive),
  );
}

function shareLinkOf(mutation: MutationState, itemId: string): void {
  mutation.run(
    () => createDriveShare({ itemId, permission: 'view', expiresAt: null, password: null }),
    {
      failure: 'The link was not made',
      label: 'share',
      onDone: (created) => {
        copyText(created.url, created.public ? 'Link' : 'Home network link');
      },
    },
  );
}

export function useViewerActions(item: MediaItem, onTrashed: () => void): ViewerActions {
  const mutation = useMutationState();
  const client = useQueryClient();
  const shown = shownDriveChange(client, changeDrive);
  const change = (body: DriveChange, failure: string, onDone?: () => void): void => {
    mutation.run(() => shown(body), {
      failure,
      label: body.action,
      ...(onDone === undefined ? {} : { onDone }),
    });
  };
  return {
    busy: mutation.busy,
    favourite: (): void => {
      change(
        { action: item.starred ? 'unstar' : 'star', itemIds: [item.id] },
        item.starred ? 'The photo was not unfavourited' : 'The photo was not favourited',
      );
    },
    trash: (): void => {
      mutation.run(() => trashFromViewer(item.id, client), {
        failure: 'The photo was not moved to trash',
        label: 'trash',
        onDone: (moved) => {
          if (moved) onTrashed();
        },
      });
    },
    addToAlbum: (albumId, title): void => {
      change({ action: 'album_add', albumId, itemIds: [item.id] }, 'The photo was not added', () =>
        notify({ message: `Added to ${title}` }),
      );
    },
    shareLink: (): void => {
      shareLinkOf(mutation, item.id);
    },
    makeCover: (stackId, itemId): void => {
      mutation.run(() => makeStackCover(stackId, itemId), {
        failure: 'The cover was not changed',
        label: 'make_cover',
      });
    },
  };
}
