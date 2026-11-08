import { background } from '@smarteverything/logging';
import { noticeHandler } from '../../../store/notice-registry';

export const HUB_UPDATE_SOURCE_KEY = ['hub-updates', 'source'] as const;

export const HUB_UPDATE_SOURCE_NOTICES = noticeHandler(
  ['hub_update_source_changed'],
  (_notice, { client }) => {
    const filter = { queryKey: HUB_UPDATE_SOURCE_KEY };
    background(
      client.cancelQueries(filter).then(() => client.invalidateQueries(filter)),
      'hub_update.source_refresh_failed',
    );
  },
);
