import { ROOM_ROW, type RoomRow } from '@smarteverything/domain';
import { assignments, found, type StoreContext } from '../context';

export function roomKey(name: string): string {
  return name.trim().toLowerCase();
}

const COLUMNS = 'id, name, position';

export interface RoomChange {
  readonly name?: string | undefined;
  readonly position?: number | undefined;
}

export class RoomsRepository {
  constructor(private readonly context: StoreContext) {}

  list(): RoomRow[] {
    return this.context.sql.all(ROOM_ROW, `select ${COLUMNS} from rooms order by position, name`);
  }

  byId(id: string): RoomRow {
    return found(
      this.context.sql.get(ROOM_ROW, `select ${COLUMNS} from rooms where id = $id`, { id }),
      'room',
      id,
    );
  }

  create(name: string, position: number): RoomRow {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'add the room',
        'insert into rooms (id, name, position) values ($id, $name, $position)',
        { id, name, position },
      );
      const row = this.byId(id);
      this.context.changed('rooms', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, change: RoomChange): RoomRow {
    return this.context.write(() => {
      const before = this.byId(id);
      const set = assignments({ ...change });
      this.context.sql.run('change the room', `update rooms set ${set.text} where id = $id`, {
        ...set.parameters,
        id,
      });
      const after = this.byId(id);
      this.context.changed('rooms', 'UPDATE', after, before);
      return after;
    });
  }

  remove(id: string, unplaced: (roomId: string) => void): void {
    this.context.write(() => {
      const before = this.byId(id);
      unplaced(id);
      this.context.sql.run('remove the room', 'delete from rooms where id = $id', { id });
      this.context.changed('rooms', 'DELETE', null, before);
    });
  }

  matchNames(names: readonly string[]): ReadonlyMap<string, string> {
    const rooms = new Map(this.list().map((room) => [roomKey(room.name), room.id]));
    return new Map(
      names.flatMap((name) => {
        const id = rooms.get(roomKey(name));
        return id === undefined ? [] : [[name, id] as const];
      }),
    );
  }
}
