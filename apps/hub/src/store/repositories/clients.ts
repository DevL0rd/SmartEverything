import { CLIENT_ROW, type ClientRow, type Role } from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { StoreConflictError } from '../sql';

const STORED_CLIENT = storedRow(CLIENT_ROW, { flags: ['built_in'] });

const COLUMNS = 'id, name, platform, role, built_in, profile_id, created_at, last_seen_at';

const SEEN_EVERY_MS = 60_000;

export interface NewClient {
  readonly name: string;
  readonly platform: ClientRow['platform'];
  readonly role: Role;
  readonly tokenHash: string;
}

export interface ClientChange {
  readonly name?: string | undefined;
  readonly role?: Role | undefined;
}

const PAIRING = z.object({ role: z.enum(['owner', 'member']), expires_at: z.string() });

export type PairingClaim =
  | { readonly claimed: true; readonly role: Role }
  | { readonly claimed: false; readonly reason: 'unknown' | 'expired' | 'used' };

export const OWNER_CLIENT_NAME = 'This computer';

export class ClientsRepository {
  constructor(private readonly context: StoreContext) {}

  list(): ClientRow[] {
    return this.context.sql.all(
      STORED_CLIENT,
      `select ${COLUMNS} from clients order by created_at, rowid`,
    );
  }

  byId(id: string): ClientRow {
    return found(
      this.context.sql.get(STORED_CLIENT, `select ${COLUMNS} from clients where id = $id`, { id }),
      'client',
      id,
    );
  }

  byTokenHash(tokenHash: string): ClientRow | undefined {
    return this.context.sql.get(
      STORED_CLIENT,
      `select ${COLUMNS} from clients where token_hash = $tokenHash`,
      { tokenHash },
    );
  }

  owner(): ClientRow | undefined {
    return this.context.sql.get(STORED_CLIENT, `select ${COLUMNS} from clients where built_in = 1`);
  }

  create(client: NewClient, builtIn = false): ClientRow {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'add the client',
        `insert into clients (id, name, platform, role, built_in, token_hash, profile_id, created_at)
         values ($id, $name, $platform, $role, $builtIn, $tokenHash,
           (select id from profiles order by position, created_at limit 1), $now)`,
        {
          id,
          name: client.name,
          platform: client.platform,
          role: client.role,
          builtIn: builtIn ? 1 : 0,
          tokenHash: client.tokenHash,
          now: this.context.now(),
        },
      );
      const row = this.byId(id);
      this.context.changed('clients', 'INSERT', row, null);
      return row;
    });
  }

  replaceToken(id: string, tokenHash: string): void {
    this.context.sql.run(
      'replace the client token',
      'update clients set token_hash = $tokenHash where id = $id',
      { id, tokenHash },
    );
  }

  update(id: string, change: ClientChange): ClientRow {
    return this.context.write(() => {
      const before = this.byId(id);
      if (before.built_in && change.role === 'member') {
        throw new StoreConflictError('change the role', 'the desktop owner cannot become a member');
      }
      const set = assignments({ ...change });
      this.context.sql.run('change the client', `update clients set ${set.text} where id = $id`, {
        ...set.parameters,
        id,
      });
      const after = this.byId(id);
      this.context.changed('clients', 'UPDATE', after, before);
      return after;
    });
  }

  useProfile(id: string, profileId: string): ClientRow {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'choose the profile',
        'update clients set profile_id = $profileId where id = $id',
        { id, profileId },
      );
      const after = this.byId(id);
      this.context.changed('clients', 'UPDATE', after, before);
      return after;
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      const before = this.byId(id);
      if (before.built_in) {
        throw new StoreConflictError('remove the client', 'the desktop owner cannot be unpaired');
      }
      this.context.sql.run('remove the client', 'delete from clients where id = $id', { id });
      this.context.changed('clients', 'DELETE', null, before);
    });
  }

  seen(client: ClientRow): void {
    const last = client.last_seen_at === null ? 0 : Date.parse(client.last_seen_at);
    const now = this.context.now();
    if (Date.parse(now) - last < SEEN_EVERY_MS) {
      return;
    }
    this.context.write(() => {
      this.context.sql.run(
        'note the client',
        'update clients set last_seen_at = $now where id = $id',
        {
          id: client.id,
          now,
        },
      );
      this.context.changed('clients', 'UPDATE', this.byId(client.id), client);
    });
  }

  addPairing(codeHash: string, role: Role, createdBy: string, expiresAt: string): void {
    this.context.sql.run(
      'add the pairing code',
      `insert into pairings (code_hash, role, created_by, expires_at)
       values ($codeHash, $role, $createdBy, $expiresAt)`,
      { codeHash, role, createdBy, expiresAt },
    );
  }

  claimPairing(codeHash: string): PairingClaim {
    return this.context.write(() => {
      const pairing = this.context.sql.get(
        PAIRING.extend({ claimed_at: z.string().nullable() }),
        'select role, expires_at, claimed_at from pairings where code_hash = $codeHash',
        { codeHash },
      );
      if (pairing === undefined) {
        return { claimed: false, reason: 'unknown' };
      }
      if (pairing.claimed_at !== null) {
        return { claimed: false, reason: 'used' };
      }
      if (Date.parse(pairing.expires_at) <= Date.parse(this.context.now())) {
        return { claimed: false, reason: 'expired' };
      }
      this.context.sql.run(
        'claim the pairing code',
        'update pairings set claimed_at = $now where code_hash = $codeHash',
        { codeHash, now: this.context.now() },
      );
      return { claimed: true, role: pairing.role };
    });
  }

  forgetPairingsBefore(moment: string): number {
    return this.context.sql.run(
      'forget old pairing codes',
      'delete from pairings where expires_at < $moment',
      { moment },
    );
  }
}
