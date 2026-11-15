import { MAIL_LOG_ROW, type MailLogRow } from '@smarteverything/domain';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';

const STORED_MAIL = storedRow(MAIL_LOG_ROW, {});

const COLUMNS = 'id, kind, to_hash, subject, outcome, detail, at';

export type MailLogInput = Omit<MailLogRow, 'id' | 'at'>;

export class MailLogRepository {
  constructor(private readonly context: StoreContext) {}

  insert(input: MailLogInput): MailLogRow {
    return this.context.write(() => {
      const row = MAIL_LOG_ROW.parse({
        ...input,
        id: this.context.newId(),
        at: this.context.now(),
      });
      this.context.sql.run(
        'log the mail',
        `insert into mail_log (${COLUMNS})
         values ($id, $kind, $to_hash, $subject, $outcome, $detail, $at)`,
        row,
      );
      return row;
    });
  }

  recent(count: number): MailLogRow[] {
    return this.context.sql.all(
      STORED_MAIL,
      `select ${COLUMNS} from mail_log order by at desc, id limit $count`,
      { count },
    );
  }
}
