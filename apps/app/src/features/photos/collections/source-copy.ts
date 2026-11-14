import type { PhotoSource } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export interface SourceCopy {
  readonly icon: IconName;
  readonly note: string;
  readonly emptyTitle: string;
  readonly emptyBody: string;
  readonly keepLabel: string;
  readonly keepFailure: string;
}

export const SOURCE_COPY: Readonly<Record<PhotoSource, SourceCopy>> = {
  cameras: {
    icon: 'lock',
    note: 'Read from your cameras and kept as long as each camera keeps them. Keep in Drive saves a copy in Saved › Cameras.',
    emptyTitle: 'No camera clips yet',
    emptyBody: 'Clips and snapshots your home cameras save show up here, newest first.',
    keepLabel: 'Keep in Drive',
    keepFailure: 'The clips were not kept',
  },
  ai: {
    icon: 'sparkles',
    note: 'Images made or sent in your own chats. Only you see them. Keep saves a copy in your library so it stays when the chat goes.',
    emptyTitle: 'No images made with AI yet',
    emptyBody: 'Images the assistant makes in your chats show up here, newest first.',
    keepLabel: 'Keep',
    keepFailure: 'The images were not kept',
  },
};

export const SOURCES_OFFLINE_TITLE = 'The hub is offline';

export const SOURCES_OFFLINE_BODY = 'Showing what you saw last. Keeping needs your home hub.';
