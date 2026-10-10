import type { IrCodeRow, IrRemoteRow } from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../../../store/store';
import { reported, sendAndWait } from './commanding';
import { PHYSICAL, READS, ToolError, defineTool, type Tool } from './registry';
import { inRooms, placedDevices, type Placed } from './targets';

function pick<T>(rows: readonly T[], wanted: string, fields: (row: T) => readonly string[]): T[] {
  const text = wanted.trim().toLowerCase();
  const exact = rows.filter((row) => fields(row).some((field) => field.toLowerCase() === text));
  return exact.length > 0
    ? exact
    : rows.filter((row) => fields(row).some((field) => field.toLowerCase().includes(text)));
}

interface Remote {
  readonly row: IrRemoteRow;
  readonly blaster: Placed | undefined;
  readonly buttons: readonly IrCodeRow[];
}

function remotes(store: Store): Remote[] {
  const blasters = new Map(placedDevices(store).map((placed) => [placed.device.id, placed]));
  const codes = store.infrared.codes();
  return store.infrared.remotes().map((row) => ({
    row,
    blaster: blasters.get(row.blaster_id),
    buttons: codes.filter((code) => code.remote_id === row.id),
  }));
}

function where(blaster: Placed | undefined): Record<string, unknown> {
  if (blaster === undefined) {
    return { blaster: null, online: false, room: null, room_id: null };
  }
  return {
    blaster: blaster.name,
    online: blaster.device.online,
    room: blaster.room?.name ?? null,
    room_id: blaster.room?.id ?? null,
  };
}

function summary({ row, blaster, buttons }: Remote): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    brand: row.brand,
    blaster_id: row.blaster_id,
    ...where(blaster),
    buttons: buttons.map((button) => button.button),
  };
}

function only<T>(found: readonly T[], what: string, wanted: string): T {
  const [first, second] = found;
  if (first === undefined) {
    throw new ToolError(`There is no ${what} "${wanted}"; list_remotes shows them`, 'not_found');
  }
  if (second !== undefined) {
    throw new ToolError(`"${wanted}" names more than one ${what}; use its id or full name`);
  }
  return first;
}

export const REMOTE_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'list_remotes',
    input: z.strictObject({
      rooms: z.array(z.string().min(1)).min(1).optional().describe('Room ids or names'),
    }),
    annotations: READS,
    run: ({ store }, input) => ({
      structured: {
        remotes: remotes(store)
          .filter(
            (remote) =>
              input.rooms === undefined || inRooms(remote.blaster?.room ?? null, input.rooms),
          )
          .map(summary),
      },
    }),
  }),
  defineTool({
    name: 'press_remote_button',
    input: z.strictObject({
      remote: z.string().min(1).describe('Remote id or name'),
      button: z.string().min(1).describe('Button name, such as Power or Temp +'),
    }),
    annotations: PHYSICAL,
    run: async (context, input) => {
      const remote = only(
        pick(remotes(context.store), input.remote, (candidate) => [
          candidate.row.id,
          candidate.row.name,
        ]),
        'remote',
        input.remote,
      );
      const button = only(
        pick(remote.buttons, input.button, (code) => [code.button]),
        `button on ${remote.row.name}`,
        input.button,
      );
      const outcome = await sendAndWait(context, [
        {
          device_id: remote.row.blaster_id,
          capability: 'ir_send',
          value: { format: button.format, code: button.code },
        },
      ]);
      return {
        structured: {
          remote: remote.row.name,
          button: button.button,
          ...reported(context, outcome),
        },
      };
    },
  }),
];
