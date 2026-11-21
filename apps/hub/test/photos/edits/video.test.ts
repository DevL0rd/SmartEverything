import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EditJob } from '@smarteverything/domain';
import { ffmpegPath } from '../../../src/media/ffmpeg-path';
import { probeVideo } from '../../../src/photos/pipeline/probe';
import {
  detectArguments,
  encodeArguments,
  lengthSeconds,
  toneMapped,
  type VideoPlan,
} from '../../../src/photos/edits/video-args';
import { VideoEditService } from '../../../src/photos/edits/video';
import { FfmpegFailedError, runFfmpeg } from '../../../src/photos/edits/video-run';
import { DriveMediaRepository } from '../../../src/store/repositories/drive-media';
import { bundleColourWorker, type ColourWorkerBundle } from './edit-fixture';
import { openRig, sha, type Rig } from './service-fixture';

const run = promisify(execFile);

const FRAME = 1 / 30;

let bundle: ColourWorkerBundle;
let scratch = '';
let clip: Buffer;
let rig: Rig;
let service: VideoEditService;

beforeAll(async () => {
  bundle = await bundleColourWorker();
  scratch = await mkdtemp(join(tmpdir(), 'video-edit-'));
  const path = join(scratch, 'clip.mp4');
  await run(ffmpegPath(), [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x240:rate=30:duration=3',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=3',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    path,
  ]);
  clip = await readFile(path);
}, 120_000);

afterAll(async () => {
  bundle.dispose();
  await rm(scratch, { recursive: true, force: true });
});

beforeEach(async () => {
  rig = await openRig(bundle.script, { erase: () => Promise.reject(new Error('no eraser here')) });
  service = new VideoEditService(rig.deps);
});

afterEach(async () => {
  await rig.opened.close();
});

async function finished(jobId: string): Promise<{ job: EditJob; seen: number[] }> {
  const seen: number[] = [];
  for (let waited = 0; waited < 240_000; waited += 100) {
    const job = service.read(rig.owner, jobId);
    seen.push(job.progress);
    if (job.state === 'done' || job.state === 'failed') return { job, seen };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('the video job did not finish');
}

async function durationOf(relPath: string): Promise<number> {
  return (await probeVideo(join(rig.mine.path, relPath))).durationSeconds;
}

describe('the ffmpeg arguments', () => {
  const plan: VideoPlan = {
    source: '/in.mov',
    target: '/out.mov',
    transforms: '/motion.trf',
    format: 'mov',
    trim: { startMs: 500, endMs: 2500 },
    stabilize: true,
    toneMap: false,
  };

  it('seeks to the start, keeps the length and measures motion without audio', () => {
    const detect = detectArguments(plan);
    expect(detect.slice(detect.indexOf('-ss'), detect.indexOf('-ss') + 2)).toStrictEqual([
      '-ss',
      '0.5',
    ]);
    expect(detect[detect.indexOf('-t') + 1]).toBe('2');
    expect(detect).toContain('-an');
    expect(detect.join(' ')).toContain(
      'vidstabdetect=stepsize=6:shakiness=8:accuracy=9:result=/motion.trf',
    );
  });

  it('re-encodes with the transform filter and the chosen container', () => {
    const encode = encodeArguments(plan);
    expect(encode.join(' ')).toContain('vidstabtransform=input=/motion.trf');
    expect(encode).toContain('libx264');
    expect(encode.slice(-3)).toStrictEqual(['-f', 'mov', '/out.mov']);
  });

  it('tone maps a high dynamic range source and leaves a plain trim without filters', () => {
    expect(encodeArguments({ ...plan, stabilize: false, toneMap: true }).join(' ')).toContain(
      'tonemap',
    );
    expect(encodeArguments({ ...plan, stabilize: false })).not.toContain('-vf');
    expect(toneMapped({ transfer: 'PQ' })).toBe(true);
    expect(toneMapped({ transfer: null })).toBe(false);
    expect(lengthSeconds({ trim: null }, { durationSeconds: 7 })).toBe(7);
    expect(lengthSeconds(plan, { durationSeconds: 7 })).toBe(2);
  });
});

describe('running ffmpeg', () => {
  it('fails with the exit code and keeps the full error text apart from the message', async () => {
    const failure = await runFfmpeg(
      ['-v', 'error', '-i', join(scratch, 'missing.mp4'), '-f', 'null', '-'],
      1,
      () => undefined,
      new AbortController().signal,
    ).catch((cause: unknown) => cause);
    if (!(failure instanceof FfmpegFailedError)) throw new Error('ffmpeg did not fail');
    expect(failure.stderr).toContain('missing.mp4');
    expect(failure.message).not.toContain('missing.mp4');
  });
});

describe('editing a video', () => {
  it('trims frame exact into a new version and keeps the original as the earlier version', async () => {
    const item = await rig.seed('Photos/clip.mp4', clip);
    const { jobId } = await service.start(rig.owner, item.id, {
      trim: { startMs: 500, endMs: 1500 },
      stabilize: false,
      mode: 'version',
    });
    const { job, seen } = await finished(jobId);
    expect(job).toMatchObject({
      state: 'done',
      progress: 1,
      resultItemId: item.id,
      error: null,
      itemId: item.id,
    });
    expect(seen.every((value, index) => index === 0 || value >= (seen[index - 1] ?? 0))).toBe(true);
    expect(Math.abs((await durationOf('Photos/clip.mp4')) - 1)).toBeLessThanOrEqual(FRAME + 0.001);
    const versions = rig.opened.store.driveVersions.forItem(item.id, null, 10);
    expect(versions.versions.map((version) => version.sha256)).toContain(sha(clip));
  }, 120_000);

  it('saves a trimmed copy and leaves the original alone', async () => {
    const item = await rig.seed('Photos/clip.mp4', clip);
    const { jobId } = await service.start(rig.owner, item.id, {
      trim: { startMs: 1000, endMs: 2000 },
      stabilize: false,
      mode: 'copy',
    });
    const { job } = await finished(jobId);
    expect(job.state).toBe('done');
    expect(job.resultItemId).not.toBe(item.id);
    expect(sha(await rig.bytesOf('Photos/clip.mp4'))).toBe(sha(clip));
    expect(Math.abs((await durationOf('Photos/clip (edited).mp4')) - 1)).toBeLessThanOrEqual(
      FRAME + 0.001,
    );
    const media = new DriveMediaRepository(rig.opened.store.context);
    const stack = media.byId(item.id).stack_id;
    expect(stack).not.toBeNull();
    expect(media.byId(job.resultItemId ?? '').stack_id).toBe(stack);
  }, 120_000);

  it('stabilizes with two passes, reporting progress across both, and keeps the length', async () => {
    const item = await rig.seed('Photos/clip.mp4', clip);
    const { jobId } = await service.start(rig.owner, item.id, {
      trim: null,
      stabilize: true,
      mode: 'copy',
    });
    const { job, seen } = await finished(jobId);
    expect(job.state).toBe('done');
    expect(Math.max(...seen.slice(0, -1))).toBeLessThan(1);
    expect(Math.abs((await durationOf('Photos/clip (edited).mp4')) - 3)).toBeLessThanOrEqual(
      2 * FRAME,
    );
  }, 180_000);

  it('trims and stabilizes together', async () => {
    const item = await rig.seed('Photos/clip.mp4', clip);
    const { jobId } = await service.start(rig.owner, item.id, {
      trim: { startMs: 0, endMs: 1000 },
      stabilize: true,
      mode: 'copy',
    });
    expect((await finished(jobId)).job.state).toBe('done');
    expect(Math.abs((await durationOf('Photos/clip (edited).mp4')) - 1)).toBeLessThanOrEqual(
      FRAME + 0.001,
    );
  }, 180_000);

  it('fails the job with the reason and leaves the file when the video cannot be read', async () => {
    const broken = Buffer.from('this is not a video file at all');
    const item = await rig.seed('Photos/broken.mp4', broken);
    const { jobId } = await service.start(rig.owner, item.id, {
      trim: { startMs: 0, endMs: 500 },
      stabilize: false,
      mode: 'copy',
    });
    const { job } = await finished(jobId);
    expect(job.state).toBe('failed');
    expect(job.error).not.toBe('');
    expect(sha(await rig.bytesOf('Photos/broken.mp4'))).toBe(sha(broken));
  }, 120_000);

  it('refuses a bad trim, a version of an unsupported container and a stranger', async () => {
    const item = await rig.seed('Photos/clip.mp4', clip);
    const late = await service.start(rig.owner, item.id, {
      trim: { startMs: 5000, endMs: 6000 },
      stabilize: false,
      mode: 'copy',
    });
    expect((await finished(late.jobId)).job).toMatchObject({
      state: 'failed',
      error: 'The trim starts after the video ends.',
    });
    const whole = await service.start(rig.owner, item.id, {
      trim: { startMs: 0, endMs: 99_000 },
      stabilize: false,
      mode: 'copy',
    });
    expect((await finished(whole.jobId)).job.error).toBe('The trim keeps the whole video.');
    const odd = await rig.seed('Photos/odd.avi', clip);
    await expect(
      service.start(rig.owner, odd.id, {
        trim: { startMs: 0, endMs: 500 },
        stabilize: false,
        mode: 'version',
      }),
    ).rejects.toThrow('MP4 copy');
    const photo = await rig.seed('Photos/a.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    await expect(
      service.start(rig.owner, photo.id, { trim: null, stabilize: true, mode: 'copy' }),
    ).rejects.toThrow('Only videos');
    const started = await service.start(rig.owner, item.id, {
      trim: { startMs: 0, endMs: 500 },
      stabilize: false,
      mode: 'copy',
    });
    expect(() => service.read(rig.member, started.jobId)).toThrow('no such edit job');
    await finished(started.jobId);
  }, 180_000);
});
