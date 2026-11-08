import {
  EMPTY_IR_REMOTE_STATE,
  type DeviceScope,
  type IrCodeRow,
  type IrRemoteRow,
  type IrRemoteState,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../../../store/store';
import { applianceExternalId } from '../../../infrared/appliance-devices';
import { reported, sendAndWait, type CommandRequest } from './commanding';
import { deviceScopeOfActor } from './person-reach';
import { COMMANDS, READS, defineTool, type Tool } from './registry';
import { inRooms, placedDevices, resolveNamed, type Placed } from './targets';

type Button = Pick<IrCodeRow, 'button' | 'format' | 'code'>;

interface Remote {
  readonly row: Pick<IrRemoteRow, 'id' | 'name' | 'category' | 'brand'> & {
    readonly blaster_id: string | null;
  };
  readonly blaster: Placed | undefined;
  readonly buttons: readonly Button[];
  readonly appliance: Placed | null;
}

function learnedRemotes(
  store: Store,
  scope: DeviceScope | null,
  placed: readonly Placed[],
): Remote[] {
  const blasters = new Map(placed.map((entry) => [entry.device.id, entry]));
  const codes = store.infrared.codes();
  return store.infrared
    .remotes()
    .filter((row) => scope === null || blasters.has(row.blaster_id))
    .map((row) => ({
      row,
      blaster: blasters.get(row.blaster_id),
      buttons: codes.filter((code) => code.remote_id === row.id),
      appliance: null,
    }));
}

function applianceRemotes(store: Store, placed: readonly Placed[]): Remote[] {
  const byId = new Map(placed.map((entry) => [entry.device.id, entry]));
  const byExternal = new Map(placed.map((entry) => [entry.device.external_id, entry]));
  return store.irAppliances.list().flatMap((row) => {
    const appliance = byExternal.get(applianceExternalId(row.id));
    if (appliance === undefined) return [];
    return [
      {
        row,
        blaster: row.blaster_id === null ? undefined : byId.get(row.blaster_id),
        buttons: store.irAppliances.keys(row.id),
        appliance,
      },
    ];
  });
}

function remotes(store: Store, scope: DeviceScope | null): Remote[] {
  const placed = placedDevices(store, scope);
  return [...learnedRemotes(store, scope, placed), ...applianceRemotes(store, placed)];
}

function ownDevice(appliance: Placed | null): Record<string, unknown> {
  if (appliance === null) return {};
  return {
    device_id: appliance.device.id,
    online: appliance.device.online,
    room: appliance.room?.name ?? null,
    room_id: appliance.room?.id ?? null,
  };
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

function summary(
  { row, blaster, buttons, appliance }: Remote,
  assumed: IrRemoteState,
): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    brand: row.brand,
    blaster_id: row.blaster_id,
    ...where(blaster),
    ...ownDevice(appliance),
    buttons: buttons.map((button) => button.button),
    assumed,
  };
}

function pressOf(remote: Remote, button: Button): CommandRequest {
  if (remote.appliance !== null) {
    return {
      device_id: remote.appliance.device.id,
      capability: 'remote_key',
      value: button.button,
    };
  }
  return {
    device_id: remote.row.blaster_id,
    capability: 'ir_send',
    value: { format: button.format, code: button.code },
  };
}

export const REMOTE_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'remote_find',
    input: z.strictObject({
      rooms: z.array(z.string().min(1)).min(1).optional().describe('Room ids or names'),
    }),
    annotations: READS,
    run: (context, input) => {
      const { store } = context;
      const states = store.settings.read().ir_remotes;
      return {
        structured: {
          remotes: remotes(store, deviceScopeOfActor(context))
            .filter(
              (remote) =>
                input.rooms === undefined || inRooms(remote.blaster?.room ?? null, input.rooms),
            )
            .map((remote) => summary(remote, states[remote.row.id] ?? EMPTY_IR_REMOTE_STATE)),
        },
      };
    },
  }),
  defineTool({
    name: 'remote_press',
    input: z.strictObject({
      remote: z.string().min(1).describe('Remote id or name'),
      button: z.string().min(1).describe('Button name, such as Power or Temp +'),
    }),
    annotations: COMMANDS,
    run: async (context, input) => {
      const remote = resolveNamed(
        remotes(context.store, deviceScopeOfActor(context)),
        input.remote,
        'remote',
        {
          names: (candidate) => [candidate.row.name],
          label: (candidate) => candidate.row.name,
          id: (candidate) => candidate.row.id,
        },
      );
      const button = resolveNamed(remote.buttons, input.button, `button on ${remote.row.name}`, {
        names: (code) => [code.button],
        label: (code) => code.button,
      });
      const outcome = await sendAndWait(context, [pressOf(remote, button)]);
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
