import { describe, expect, it } from 'vitest';
import { embedExif, uprightExif } from '../../../src/photos/edits/exif';
import { inscribedSize, pixelBox } from '../../../src/photos/edits/geometry';
import { EditJobs, FINISHED_KEEP_MS, PROGRESS_NOTICE_MS } from '../../../src/photos/edits/jobs';
import { Lane } from '../../../src/photos/edits/lane';

function tiff(little: boolean, orientation: number): Buffer {
  const out = Buffer.alloc(8 + 2 + 12 + 4);
  out.write(little ? 'II' : 'MM', 0, 'latin1');
  const w16 = (at: number, value: number): void => {
    if (little) out.writeUInt16LE(value, at);
    else out.writeUInt16BE(value, at);
  };
  const w32 = (at: number, value: number): void => {
    if (little) out.writeUInt32LE(value, at);
    else out.writeUInt32BE(value, at);
  };
  w16(2, 42);
  w32(4, 8);
  w16(8, 1);
  w16(10, 0x0112);
  w16(12, 3);
  w32(14, 1);
  w16(18, orientation);
  return out;
}

describe('the geometry helpers', () => {
  it('fits the largest upright rectangle of the same shape inside a turned photo', () => {
    expect(inscribedSize(200, 100, 0)).toStrictEqual({ width: 200, height: 100 });
    const turned = inscribedSize(200, 100, 10);
    expect(turned.width / turned.height).toBeCloseTo(2, 1);
    expect(turned.width).toBeLessThan(200);
    expect(inscribedSize(200, 100, -10)).toStrictEqual(turned);
    expect(inscribedSize(1, 1, 45)).toStrictEqual({ width: 1, height: 1 });
  });

  it('turns a fractional box into pixels inside the photo', () => {
    expect(pixelBox({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 }, 100, 80)).toStrictEqual({
      left: 25,
      top: 40,
      width: 50,
      height: 40,
    });
    expect(pixelBox({ x: 1, y: 1, w: 0.2, h: 0.2 }, 100, 80)).toStrictEqual({
      left: 99,
      top: 79,
      width: 1,
      height: 1,
    });
  });
});

describe('the exif carry', () => {
  it('sets an upright orientation in either byte order and leaves other bytes alone', () => {
    for (const little of [true, false]) {
      const source = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff(little, 6)]);
      const fixed = uprightExif(source);
      const at = 6 + 18;
      expect(little ? fixed.readUInt16LE(at) : fixed.readUInt16BE(at)).toBe(1);
      expect(source[at]).toBe(little ? 6 : 0);
      expect(fixed.length).toBe(source.length);
    }
    expect(uprightExif(tiff(true, 8)).readUInt16LE(18)).toBe(1);
    expect(uprightExif(Buffer.from('short'))).toStrictEqual(Buffer.from('short'));
    const none = Buffer.from(tiff(true, 3));
    none.writeUInt16LE(0x0110, 10);
    expect(uprightExif(none).readUInt16LE(18)).toBe(3);
  });

  it('puts the exif right after the start of the jpeg and skips one that cannot fit', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9]);
    const exif = tiff(true, 1);
    const out = embedExif(jpeg, exif);
    expect(out.subarray(0, 4)).toStrictEqual(Buffer.from([0xff, 0xd8, 0xff, 0xe1]));
    expect(out.readUInt16BE(4)).toBe(exif.length + 6 + 2);
    expect(out.subarray(6, 12).toString('latin1')).toBe('Exif\0\0');
    expect(out.subarray(out.length - 6)).toStrictEqual(jpeg.subarray(2));
    expect(embedExif(jpeg, Buffer.alloc(70_000))).toBe(jpeg);
  });
});

describe('the edit jobs', () => {
  it('shows a job only to the person who started it and clamps progress below done', () => {
    let at = 0;
    const jobs = new EditJobs(
      () => new Date(at),
      () => undefined,
    );
    const id = jobs.create('item', 'sam');
    expect(jobs.read(id, 'sam')).toMatchObject({ state: 'queued', progress: 0 });
    expect(() => jobs.read(id, 'lee')).toThrow('no such edit job');
    jobs.running(id);
    jobs.progress(id, 7);
    expect(jobs.read(id, 'sam')).toMatchObject({ state: 'running', progress: 0.999 });
    jobs.progress(id, -1);
    expect(jobs.read(id, 'sam').progress).toBe(0);
    jobs.done(id, 'result');
    expect(jobs.read(id, 'sam')).toMatchObject({
      state: 'done',
      progress: 1,
      resultItemId: 'result',
    });
    const failed = jobs.create('item', 'sam');
    jobs.fail(failed, 'broke');
    expect(jobs.read(failed, 'sam')).toMatchObject({ state: 'failed', error: 'broke' });
    at = FINISHED_KEEP_MS + 1;
    jobs.create('item', 'sam');
    expect(() => jobs.read(id, 'sam')).toThrow('no such edit job');
  });

  it('announces every change of a job to the person who started it', () => {
    const heard: [string, string, number][] = [];
    let at = 0;
    const jobs = new EditJobs(
      () => new Date(at),
      (profileId, job) => heard.push([profileId, job.state, job.progress]),
    );
    const id = jobs.create('item', 'sam');
    jobs.running(id);
    at += PROGRESS_NOTICE_MS;
    jobs.progress(id, 0.5);
    jobs.done(id, 'result');
    expect(heard).toEqual([
      ['sam', 'queued', 0],
      ['sam', 'running', 0],
      ['sam', 'running', 0.5],
      ['sam', 'done', 1],
    ]);
  });

  it('holds back progress notices that follow another notice too closely and still reads them', () => {
    const heard: number[] = [];
    let at = 0;
    const jobs = new EditJobs(
      () => new Date(at),
      (_profileId, job) => heard.push(job.progress),
    );
    const id = jobs.create('item', 'sam');
    jobs.running(id);
    for (let step = 1; step <= 9; step += 1) {
      at += PROGRESS_NOTICE_MS / 4;
      jobs.progress(id, step / 10);
    }
    expect(jobs.read(id, 'sam').progress).toBe(0.9);
    expect(heard).toStrictEqual([0, 0, 0.4, 0.8]);
    jobs.done(id, 'result');
    expect(heard.at(-1)).toBe(1);
  });

  it('ignores a change to a job that is gone', () => {
    const jobs = new EditJobs(
      () => new Date(),
      () => undefined,
    );
    expect(() => {
      jobs.running('missing');
    }).not.toThrow();
  });
});

describe('the lane', () => {
  it('runs work one after the other and survives a failure', async () => {
    const lane = new Lane();
    const order: string[] = [];
    const slow = lane.run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('slow');
    });
    const failing = lane.run(() => Promise.reject(new Error('no')));
    const last = lane.run(() => {
      order.push('last');
      return Promise.resolve();
    });
    await slow;
    await expect(failing).rejects.toThrow('no');
    await last;
    expect(order).toStrictEqual(['slow', 'last']);
  });
});
