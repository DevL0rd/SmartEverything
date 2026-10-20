import { z } from 'zod';
import { moment, type StoreContext } from '../context';

const MARK = z.strictObject({ at: z.iso.datetime({ offset: true }) });

export class HubMarksRepository {
  constructor(private readonly context: StoreContext) {}

  read(name: string): string | null {
    return (
      this.context.sql.get(MARK, 'select at from hub_marks where name=$name', { name })?.at ?? null
    );
  }

  write(name: string, at: string): void {
    this.context.sql.run(
      'remember when the hub did something',
      'insert into hub_marks(name,at) values($name,$at) on conflict(name) do update set at=excluded.at',
      { name, at: moment(at) },
    );
  }

  clear(name: string): void {
    this.context.sql.run('forget a hub mark', 'delete from hub_marks where name=$name', { name });
  }
}
