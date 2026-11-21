import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Seeded } from './store.ts';
import type { Counted, FilesContext } from './context.ts';
import { layoutOf } from './layout.ts';
import { writeJpeg, writeVideo, type Shot } from './media.ts';
import type { Random } from './random.ts';

const EVENT = z.object({ id: z.string(), device_id: z.string(), occurred_at: z.string() });
const EVENTS_PER_CAMERA = 14;
const CLIP_SECONDS = 4;
const CLIP_EVERY = 3;

function compactTime(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:.]/gu, '');
}

function shotOf(rng: Random, takenAt: Date): Shot {
  return {
    takenAt,
    place: null,
    make: 'Test camera',
    model: 'Wide 1080p',
    width: 1280,
    height: 720,
    hue: rng.int(0, 359),
  };
}

export async function seedCameraRecordings(store: Seeded, context: FilesContext): Promise<Counted> {
  const layout = layoutOf(context.paths);
  const rng = context.rng('camera-recordings');
  const events = store.database
    .prepare(
      `select e.id, e.device_id, e.occurred_at from events e join cameras c on c.device_id = e.device_id
       where e.kind in ('person', 'motion', 'pet') and e.occurred_at < $now
       order by e.occurred_at desc`,
    )
    .all({ now: context.anchor.now.toISOString() })
    .map((row) => EVENT.parse(row));
  const taken = new Map<string, number>();
  let snapshots = 0;
  let clips = 0;
  for (const event of events) {
    const count = taken.get(event.device_id) ?? 0;
    if (count >= EVENTS_PER_CAMERA) continue;
    taken.set(event.device_id, count + 1);
    const at = new Date(event.occurred_at);
    const stem = compactTime(event.occurred_at);
    const folder = layout.home.recordings(event.device_id);
    const snapshot = `${event.device_id}/${stem}.jpg`;
    await writeJpeg(join(folder, `${stem}.jpg`), shotOf(rng, at), 'Test camera');
    store.cameras.addRecording({
      deviceId: event.device_id,
      eventId: event.id,
      kind: 'snapshot',
      storagePath: snapshot,
      startedAt: at.toISOString(),
      durationMs: null,
      bytes: (await stat(join(folder, `${stem}.jpg`))).size,
    });
    snapshots += 1;
    if (count % CLIP_EVERY !== 0) continue;
    const clip = `${event.device_id}/${stem}.mp4`;
    await writeVideo(join(folder, `${stem}.mp4`), at, CLIP_SECONDS, 10);
    store.cameras.addRecording({
      deviceId: event.device_id,
      eventId: event.id,
      kind: 'clip',
      storagePath: clip,
      startedAt: at.toISOString(),
      durationMs: CLIP_SECONDS * 1000,
      bytes: (await stat(join(folder, `${stem}.mp4`))).size,
    });
    clips += 1;
  }
  return { snapshots, clips };
}
