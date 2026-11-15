import { PLANNER_PUBLIC_TOKEN } from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { newPublicToken } from './public-token';

const EXPORT_LINK = z.strictObject({
  collection_id: z.uuid(),
  token: PLANNER_PUBLIC_TOKEN,
  created_at: z.iso.datetime({ offset: true }),
});

export type PlannerExportLinkRow = z.infer<typeof EXPORT_LINK>;

const STORED_LINK = storedRow(EXPORT_LINK, {});

const COLUMNS = 'collection_id, token, created_at';

export class PlannerExportLinksRepository {
  constructor(private readonly context: StoreContext) {}

  find(collectionId: string): PlannerExportLinkRow | undefined {
    return this.context.sql.get(
      STORED_LINK,
      `select ${COLUMNS} from planner_export_links where collection_id = $collectionId`,
      { collectionId },
    );
  }

  byToken(token: string): PlannerExportLinkRow | undefined {
    return this.context.sql.get(
      STORED_LINK,
      `select ${COLUMNS} from planner_export_links where token = $token`,
      { token },
    );
  }

  publish(collectionId: string): PlannerExportLinkRow {
    return this.context.write(() => {
      const row = EXPORT_LINK.parse({
        collection_id: collectionId,
        token: newPublicToken(),
        created_at: this.context.now(),
      });
      this.context.sql.run(
        'publish the planner calendar feed',
        `insert or replace into planner_export_links (${COLUMNS})
         values ($collection_id, $token, $created_at)`,
        row,
      );
      return row;
    });
  }

  remove(collectionId: string): void {
    this.context.write(() => {
      found(this.find(collectionId), 'planner export link', collectionId);
      this.context.sql.run(
        'stop publishing the planner calendar feed',
        'delete from planner_export_links where collection_id = $collectionId',
        { collectionId },
      );
    });
  }
}
