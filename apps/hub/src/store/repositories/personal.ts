import {
  LAYOUT_ROW,
  PUSH_TARGET_ROW,
  type JsonValue,
  type LayoutRow,
  type PushTargetRow,
  layoutScopeOf,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { StoreConflictError, jsonText } from '../sql';

const STORED_LAYOUT = storedRow(LAYOUT_ROW, { json: ['layout'] });

const LAYOUT_COLUMNS = 'client_id, profile_id, page, layout, updated_at';

export interface LayoutOwner {
  readonly clientId: string;
  readonly profileId: string;
}

function ownerOf(
  owner: LayoutOwner,
  page: string,
): { readonly column: 'client_id' | 'profile_id'; readonly id: string } {
  return layoutScopeOf(page) === 'client'
    ? { column: 'client_id', id: owner.clientId }
    : { column: 'profile_id', id: owner.profileId };
}

const PUSH_COLUMNS = 'token, client_id, platform, created_at';

export class PersonalRepository {
  constructor(private readonly context: StoreContext) {}

  layout(owner: LayoutOwner, page: string): LayoutRow | undefined {
    const scoped = ownerOf(owner, page);
    return this.context.sql.get(
      STORED_LAYOUT,
      `select ${LAYOUT_COLUMNS} from layouts where ${scoped.column} = $owner and page = $page`,
      { owner: scoped.id, page },
    );
  }

  layouts(owner: LayoutOwner): LayoutRow[] {
    return this.context.sql
      .all(
        STORED_LAYOUT,
        `select ${LAYOUT_COLUMNS} from layouts
         where client_id = $clientId or profile_id = $profileId order by page`,
        { clientId: owner.clientId, profileId: owner.profileId },
      )
      .filter((row) => {
        const scoped = ownerOf(owner, row.page);
        return row[scoped.column] === scoped.id;
      });
  }

  saveLayout(
    owner: LayoutOwner,
    page: string,
    layout: Readonly<Record<string, JsonValue>>,
    onSequence?: (seq: number) => void,
  ): LayoutRow {
    return this.context.write(() => {
      const before = this.layout(owner, page);
      const scoped = ownerOf(owner, page);
      this.context.sql.run(
        'save the layout',
        `insert into layouts (${scoped.column}, page, layout, updated_at) values ($owner, $page, $layout, $now)
         on conflict (${scoped.column}, page) where ${scoped.column} is not null
         do update set layout = excluded.layout, updated_at = excluded.updated_at`,
        { owner: scoped.id, page, layout: jsonText(layout), now: this.context.now() },
      );
      const after = found(this.layout(owner, page), 'layout', page);
      this.context.changedWithSequence(
        'layouts',
        before === undefined ? 'INSERT' : 'UPDATE',
        { record: after, oldRecord: before ?? null },
        onSequence,
      );
      return after;
    });
  }

  pushTargets(): PushTargetRow[] {
    return this.context.sql.all(
      PUSH_TARGET_ROW,
      `select ${PUSH_COLUMNS} from push_targets order by created_at, rowid`,
    );
  }

  savePushTarget(
    token: string,
    clientId: string,
    platform: PushTargetRow['platform'],
  ): PushTargetRow {
    return this.context.write(() => {
      const before = this.pushTarget(token);
      this.context.sql.run(
        'save the push target',
        `insert into push_targets (token, client_id, platform, created_at) values ($token, $clientId, $platform, $now)
         on conflict (token) do update set client_id = excluded.client_id, platform = excluded.platform`,
        { token, clientId, platform, now: this.context.now() },
      );
      const after = found(this.pushTarget(token), 'push target', 'just saved');
      this.context.changed(
        'push_targets',
        before === undefined ? 'INSERT' : 'UPDATE',
        after,
        before ?? null,
      );
      return after;
    });
  }

  removePushTarget(token: string, clientId: string): void {
    this.context.write(() => {
      const before = found(this.pushTarget(token), 'push target', 'with that token');
      if (before.client_id !== clientId) {
        throw new StoreConflictError('forget the push target', 'it belongs to another client');
      }
      this.context.sql.run(
        'forget the push target',
        'delete from push_targets where token = $token',
        { token },
      );
      this.context.changed('push_targets', 'DELETE', null, before);
    });
  }

  private pushTarget(token: string): PushTargetRow | undefined {
    return this.context.sql.get(
      PUSH_TARGET_ROW,
      `select ${PUSH_COLUMNS} from push_targets where token = $token`,
      { token },
    );
  }
}
