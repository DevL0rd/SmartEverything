import {
  IR_CODE_ROW,
  IR_REMOTE_ROW,
  type IrCodeRow,
  type IrRemoteRow,
} from '@smarteverything/domain';
import { found, type StoreContext } from '../context';

const REMOTE_COLUMNS = 'id, blaster_id, name, category, brand, created_at';
const CODE_COLUMNS = 'id, remote_id, button, format, code, created_at';

export interface NewRemote {
  readonly blaster_id: string;
  readonly name: string;
  readonly category: string;
  readonly brand: string | null;
}

export interface SavedCode {
  readonly remote_id: string;
  readonly button: string;
  readonly format: IrCodeRow['format'];
  readonly code: string;
}

export class InfraredRepository {
  constructor(private readonly context: StoreContext) {}

  remotes(): IrRemoteRow[] {
    return this.context.sql.all(
      IR_REMOTE_ROW,
      `select ${REMOTE_COLUMNS} from ir_remotes order by name, id`,
    );
  }

  remote(id: string): IrRemoteRow {
    return found(
      this.context.sql.get(
        IR_REMOTE_ROW,
        `select ${REMOTE_COLUMNS} from ir_remotes where id = $id`,
        { id },
      ),
      'IR remote',
      id,
    );
  }

  addRemote(remote: NewRemote): IrRemoteRow {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'add the remote',
        `insert into ir_remotes (id, blaster_id, name, category, brand, created_at)
         values ($id, $blasterId, $name, $category, $brand, $now)`,
        {
          id,
          blasterId: remote.blaster_id,
          name: remote.name,
          category: remote.category,
          brand: remote.brand,
          now: this.context.now(),
        },
      );
      const row = this.remote(id);
      this.context.changed('ir_remotes', 'INSERT', row, null);
      return row;
    });
  }

  removeRemote(id: string): void {
    this.context.write(() => {
      const before = this.remote(id);
      for (const code of this.codes().filter((candidate) => candidate.remote_id === id)) {
        this.removeCode(code.id);
      }
      this.context.sql.run('remove the remote', 'delete from ir_remotes where id = $id', { id });
      this.context.changed('ir_remotes', 'DELETE', null, before);
    });
  }

  codes(): IrCodeRow[] {
    return this.context.sql.all(
      IR_CODE_ROW,
      `select ${CODE_COLUMNS} from ir_codes order by button, id`,
    );
  }

  code(id: string): IrCodeRow {
    return found(
      this.context.sql.get(IR_CODE_ROW, `select ${CODE_COLUMNS} from ir_codes where id = $id`, {
        id,
      }),
      'IR code',
      id,
    );
  }

  saveCode(code: SavedCode): IrCodeRow {
    return this.context.write(() => {
      this.remote(code.remote_id);
      const before = this.context.sql.get(
        IR_CODE_ROW,
        `select ${CODE_COLUMNS} from ir_codes where remote_id = $remoteId and button = $button`,
        { remoteId: code.remote_id, button: code.button },
      );
      const id = before?.id ?? this.context.newId();
      this.context.sql.run(
        'save the code',
        `insert into ir_codes (id, remote_id, button, format, code, created_at)
         values ($id, $remoteId, $button, $format, $code, $now)
         on conflict (remote_id, button) do update set format = excluded.format, code = excluded.code`,
        {
          id,
          remoteId: code.remote_id,
          button: code.button,
          format: code.format,
          code: code.code,
          now: this.context.now(),
        },
      );
      const after = this.code(id);
      this.context.changed(
        'ir_codes',
        before === undefined ? 'INSERT' : 'UPDATE',
        after,
        before ?? null,
      );
      return after;
    });
  }

  removeCode(id: string): void {
    this.context.write(() => {
      const before = this.code(id);
      this.context.sql.run('remove the code', 'delete from ir_codes where id = $id', { id });
      this.context.changed('ir_codes', 'DELETE', null, before);
    });
  }
}
