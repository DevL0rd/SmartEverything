import { z } from 'zod';
import type { StoreContext } from '../context';

export interface DriveInodeLease {
  readonly start: number;
  readonly count: number;
}

const SEQ = z.strictObject({ seq: z.number() });

const HIGHEST = z.strictObject({ highest: z.number().nullable() });

const HELD = z.strictObject({ held: z.number() });

export class DriveInodeLeasesRepository {
  constructor(private readonly context: StoreContext) {}

  grant(nodeId: string, count: number): DriveInodeLease {
    return this.context.write(() => {
      const { sql } = this.context;
      const seq = sql.get(SEQ, `select seq from sqlite_sequence where name = 'drive_inodes'`);
      const highest =
        sql.get(HIGHEST, 'select max(id) as highest from drive_inodes')?.highest ?? 0;
      const start = Math.max(seq?.seq ?? 0, highest) + 1;
      const end = start + count;
      if (seq === undefined) {
        sql.run(
          'start the inode sequence for a lease',
          `insert into sqlite_sequence (name, seq) values ('drive_inodes', $last)`,
          { last: end - 1 },
        );
      } else {
        sql.run(
          'reserve the leased inode numbers',
          `update sqlite_sequence set seq = $last where name = 'drive_inodes'`,
          { last: end - 1 },
        );
      }
      sql.run(
        'record the inode lease of the computer',
        'insert into drive_inode_leases (node_id, start, end) values ($nodeId, $start, $end)',
        { nodeId, start, end },
      );
      return { start, count };
    });
  }

  holds(nodeId: string, ino: number): boolean {
    return (
      this.context.sql.get(
        HELD,
        `select count(*) as held from drive_inode_leases
          where node_id = $nodeId and start <= $ino and end > $ino`,
        { nodeId, ino },
      )?.held === 1
    );
  }
}
