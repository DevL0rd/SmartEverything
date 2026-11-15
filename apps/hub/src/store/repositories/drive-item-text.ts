import { z } from 'zod';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';

export const DRIVE_TEXT_SOURCES = ['document', 'image'] as const;

export const DRIVE_TEXT_STATES = ['ok', 'empty', 'failed', 'unsupported'] as const;

export type DriveTextSource = (typeof DRIVE_TEXT_SOURCES)[number];

export type DriveTextState = (typeof DRIVE_TEXT_STATES)[number];

const COLUMNS = 'item_id, rev, source, state, reason, chars, extracted_at';

const TEXT_COLUMNS = z.strictObject({
  item_id: z.string(),
  rev: z.number(),
  source: z.enum(DRIVE_TEXT_SOURCES),
  state: z.enum(DRIVE_TEXT_STATES),
  reason: z.string().nullable(),
  chars: z.number(),
  extracted_at: z.string(),
});

export interface DriveItemText {
  readonly itemId: string;
  readonly rev: number;
  readonly source: DriveTextSource;
  readonly state: DriveTextState;
  readonly reason: string | null;
  readonly chars: number;
  readonly extractedAt: string;
}

const STORED_TEXT = storedRow(
  TEXT_COLUMNS.transform((row): DriveItemText => ({
    itemId: row.item_id,
    rev: row.rev,
    source: row.source,
    state: row.state,
    reason: row.reason,
    chars: row.chars,
    extractedAt: row.extracted_at,
  })),
  {},
);

export type DriveItemTextWrite =
  | {
      readonly itemId: string;
      readonly rev: number;
      readonly source: DriveTextSource;
      readonly state: 'ok';
      readonly body: string;
    }
  | {
      readonly itemId: string;
      readonly rev: number;
      readonly source: DriveTextSource;
      readonly state: 'empty';
    }
  | {
      readonly itemId: string;
      readonly rev: number;
      readonly source: DriveTextSource;
      readonly state: 'failed' | 'unsupported';
      readonly reason: string;
    };

export class DriveItemTextRepository {
  constructor(private readonly context: StoreContext) {}

  find(itemId: string): DriveItemText | undefined {
    return this.context.sql.get(
      STORED_TEXT,
      `select ${COLUMNS} from drive_item_text where item_id = $itemId`,
      { itemId },
    );
  }

  put(input: DriveItemTextWrite): void {
    this.context.write(() => {
      const body = input.state === 'ok' ? input.body : '';
      this.context.sql.run(
        'record the text found in the drive item',
        `insert into drive_item_text (${COLUMNS})
          values ($itemId, $rev, $source, $state, $reason, $chars, $now)
          on conflict (item_id) do update set rev = excluded.rev, source = excluded.source,
            state = excluded.state, reason = excluded.reason, chars = excluded.chars,
            extracted_at = excluded.extracted_at`,
        {
          itemId: input.itemId,
          rev: input.rev,
          source: input.source,
          state: input.state,
          reason: 'reason' in input ? input.reason : null,
          chars: body.length,
          now: this.context.now(),
        },
      );
      this.context.sql.run(
        'drop the old searchable text of the drive item',
        'delete from drive_item_text_search where item_id = $itemId',
        { itemId: input.itemId },
      );
      if (input.state === 'ok') {
        this.context.sql.run(
          'index the text of the drive item',
          'insert into drive_item_text_search (item_id, body) values ($itemId, $body)',
          { itemId: input.itemId, body },
        );
      }
    });
  }

  remove(itemId: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'forget the text found in the drive item',
        'delete from drive_item_text where item_id = $itemId',
        { itemId },
      );
    });
  }
}
