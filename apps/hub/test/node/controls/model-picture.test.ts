import { mapPicturePoint, type ComputerCapture, type ScreenRegion } from '@smarteverything/domain';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { LinuxCapture } from '../../../src/node/controls/linux/linux-capture';
import { modelSized } from '../../../src/node/controls/model-picture';

const AT = '2026-10-18T10:00:00.000Z';

async function screenshot(width: number, height: number): Promise<ComputerCapture> {
  const data = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .jpeg()
    .toBuffer();
  return { mimeType: 'image/jpeg', data: data.toString('base64'), width, height, at: AT };
}

async function decodedSize(capture: ComputerCapture): Promise<[number, number]> {
  const { width, height } = await sharp(Buffer.from(capture.data, 'base64')).metadata();
  return [width, height];
}

function shooting(capture: ComputerCapture): LinuxCapture {
  const unused = { capture: (): Promise<ComputerCapture> => Promise.reject(new Error('unused')) };
  return new LinuxCapture({ capture: () => Promise.resolve(capture) }, unused, () => true);
}

describe('the model-sized screen picture', () => {
  it.each([
    [3840, 2160, 1568, 882],
    [2560, 1440, 1568, 882],
    [5120, 1440, 1568, 441],
    [1080, 2400, 706, 1568],
  ])('scales a %ix%i screen to %ix%i with the bytes of that size', async (width, height, w, h) => {
    const scaled = await modelSized(await screenshot(width, height));
    expect([scaled.width, scaled.height]).toEqual([w, h]);
    expect(await decodedSize(scaled)).toEqual([w, h]);
    expect(scaled.at).toBe(AT);
  });

  it('hands a picture within the long edge through untouched, never upscaled', async () => {
    const small = await screenshot(1366, 768);
    expect(await modelSized(small)).toBe(small);
  });

  it('remembers the scaled size, not the screen size, as the picture the pointer follows', async () => {
    const shot = shooting(await screenshot(3840, 2160));
    expect(shot.picture()).toBeNull();
    const taken = await shot.capture('screen');
    expect(taken.width).toBe(1568);
    expect(shot.picture()).toEqual({ width: 1568, height: 882 });
  });
});

describe('clicks in the scaled picture land on real screen pixels', () => {
  const left: ScreenRegion = { id: 1, x: 0, y: 0, width: 2560, height: 1440 };
  const right: ScreenRegion = { id: 2, x: 2560, y: 360, width: 2560, height: 1080 };

  it('maps back across two monitors with an offset at their real pixels', async () => {
    const shot = shooting(await screenshot(5120, 1440));
    await shot.capture('screen');
    const picture = shot.picture();
    if (picture === null) throw new Error('no picture');
    expect(picture).toEqual({ width: 1568, height: 441 });
    const onLeft = mapPicturePoint(picture, [left, right], { x: 392, y: 220 });
    expect(onLeft.region.id).toBe(1);
    expect(onLeft.x).toBeCloseTo(1280, -1);
    expect(onLeft.y).toBeCloseTo(720, -1);
    const onRight = mapPicturePoint(picture, [left, right], { x: 1176, y: 220 });
    expect(onRight.region.id).toBe(2);
    expect(onRight.x).toBeCloseTo(1280, -1);
    expect(onRight.y).toBeCloseTo(360, -1);
  });

  it('maps a HiDPI screen whose picture has twice the pixels of its logical size', async () => {
    const logical: ScreenRegion = { id: 1, x: 0, y: 0, width: 1920, height: 1080 };
    const shot = shooting(await screenshot(3840, 2160));
    await shot.capture('screen');
    const picture = shot.picture();
    if (picture === null) throw new Error('no picture');
    const mapped = mapPicturePoint(picture, [logical], { x: 784, y: 441 });
    expect(mapped.x).toBeCloseTo(960, -1);
    expect(mapped.y).toBeCloseTo(540, -1);
  });

  it('reaches the last pixel row and column of the screen from the last picture pixel', async () => {
    const shot = shooting(await screenshot(2560, 1440));
    await shot.capture('screen');
    const picture = shot.picture();
    if (picture === null) throw new Error('no picture');
    const mapped = mapPicturePoint(picture, [left], { x: 1567, y: 881 });
    expect(mapped.x).toBeGreaterThan(2558);
    expect(mapped.y).toBeGreaterThan(1438);
    expect(mapped.x).toBeLessThan(2560);
    expect(mapped.y).toBeLessThan(1440);
  });
});
