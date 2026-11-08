import {
  GOOGLE_SYNC_STATE,
  type GoogleProduct,
  type GoogleSyncState,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_STATE = storedRow(GOOGLE_SYNC_STATE, { json: ['channel'] });

const COLUMNS = 'profile_id, product, resource_id, sync_token, channel, last_pull_at';

export interface GoogleSyncResource {
  readonly profileId: string;
  readonly product: GoogleProduct;
  readonly resourceId: string;
}

export class GoogleSyncStateRepository {
  constructor(private readonly context: StoreContext) {}

  find(resource: GoogleSyncResource): GoogleSyncState | undefined {
    return this.context.sql.get(
      STORED_STATE,
      `select ${COLUMNS} from google_sync_state
       where profile_id = $profileId and product = $product and resource_id = $resourceId`,
      { ...resource },
    );
  }

  forProfile(profileId: string): GoogleSyncState[] {
    return this.context.sql.all(
      STORED_STATE,
      `select ${COLUMNS} from google_sync_state where profile_id = $profileId
       order by product, resource_id`,
      { profileId },
    );
  }

  byChannel(channelId: string): GoogleSyncState | undefined {
    return this.context.sql.get(
      STORED_STATE,
      `select ${COLUMNS} from google_sync_state
       where json_extract(channel, '$.channel_id') = $channelId`,
      { channelId },
    );
  }

  put(input: GoogleSyncState): GoogleSyncState {
    return this.context.write(() => {
      const row = GOOGLE_SYNC_STATE.parse(input);
      this.context.sql.run(
        'save the google sync state',
        `insert into google_sync_state
           (profile_id, product, resource_id, sync_token, channel, last_pull_at)
         values ($profile_id, $product, $resource_id, $sync_token, $channel, $last_pull_at)
         on conflict (profile_id, product, resource_id) do update
           set sync_token = excluded.sync_token, channel = excluded.channel,
               last_pull_at = excluded.last_pull_at`,
        { ...row, channel: row.channel === null ? null : jsonText(row.channel) },
      );
      return row;
    });
  }

  remove(resource: GoogleSyncResource): void {
    this.context.write(() => {
      this.context.sql.run(
        'forget the google sync state',
        `delete from google_sync_state
         where profile_id = $profileId and product = $product and resource_id = $resourceId`,
        { ...resource },
      );
    });
  }
}
