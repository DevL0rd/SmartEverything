import { MEDIA_SIZES, isPrivate, privacySwitchOf, type MediaSize } from '@smarteverything/domain';
import { z } from 'zod';
import { READS, defineTool, type Tool, type ToolContext, type ToolImage } from './registry';
import { inRooms, placedDevices, type Placed } from './targets';

export const IMAGE_LIMIT_BYTES = 4 * 1024 * 1024;

export const SNAPSHOT_TYPE = 'image/jpeg';

const LOOK = z.strictObject({
  deviceIds: z
    .array(z.uuid())
    .min(1)
    .optional()
    .describe('These cameras; every camera when left out'),
  rooms: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe('Cameras in these rooms, by id or name'),
  size: z
    .enum(MEDIA_SIZES)
    .default('full')
    .describe('full for the stream’s own resolution, thumb for a 480 px wide picture'),
});

type Look = z.infer<typeof LOOK>;

interface Shot {
  readonly item: Record<string, unknown>;
  readonly image: ToolImage | null;
}

function chosenCameras(context: ToolContext, input: Look): Placed[] {
  const cameras = new Set(context.store.cameras.list().map((camera) => camera.device_id));
  return placedDevices(context.store).filter(
    ({ device, room }) =>
      cameras.has(device.id) &&
      (input.deviceIds === undefined || input.deviceIds.includes(device.id)) &&
      (input.rooms === undefined || inRooms(room, input.rooms)) &&
      (input.deviceIds !== undefined || !device.hidden),
  );
}

function blocked(context: ToolContext, { device }: Placed): string | null {
  if (!device.online) {
    return 'offline';
  }
  const privacy = privacySwitchOf(device);
  const state = context.store.state
    .list()
    .find((row) => row.device_id === device.id && row.capability === privacy?.key);
  return privacy !== null && isPrivate(privacy, state?.value) ? 'privacy_on' : null;
}

async function shotOf(context: ToolContext, placed: Placed, size: MediaSize): Promise<Shot> {
  const item = {
    deviceId: placed.device.id,
    camera: placed.name,
    room: placed.room?.name ?? null,
  };
  const reason = blocked(context, placed);
  if (reason !== null) {
    return { item: { ...item, status: reason }, image: null };
  }
  try {
    const frame = await context.hub.snapshot(placed.device.id, size);
    if (frame.byteLength > IMAGE_LIMIT_BYTES) {
      return {
        item: { ...item, status: 'failed', reason: 'The picture is too large; ask for size thumb' },
        image: null,
      };
    }
    const takenAt = context.clock.now().toISOString();
    return {
      item: { ...item, status: 'ok', takenAt, image: true },
      image: { data: Buffer.from(frame).toString('base64'), mimeType: SNAPSHOT_TYPE },
    };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { item: { ...item, status: 'failed', reason }, image: null };
  }
}

export const LIVE_CAMERA_TOOL: Tool = defineTool({
  name: 'take_camera_snapshots',
  input: LOOK,
  annotations: { ...READS, idempotentHint: false, openWorldHint: true },
  run: async (context, input) => {
    const shots = await Promise.all(
      chosenCameras(context, input).map((placed) => shotOf(context, placed, input.size)),
    );
    return {
      structured: {
        cameras: shots.map((shot) => shot.item),
        order: 'Images follow in the order of the cameras with status ok',
      },
      images: shots.flatMap((shot) => (shot.image === null ? [] : [shot.image])),
    };
  },
});
