import { describe, expect, it } from 'vitest';
import { parseClocks } from '../../src/node/collectors/linux/gpu-amd';
import { parseFixedLine, parseLiveLine } from '../../src/node/collectors/linux/gpu-nvidia';
import { parseFdinfo, parsePmonLine } from '../../src/node/controls/linux/gpu-processes';

describe('nvidia-smi lines', () => {
  it('reads the fixed facts of a gpu once', () => {
    expect(parseFixedLine('0, NVIDIA GeForce RTX 4090 Laptop GPU, 16376, 175.00, 2175')).toEqual([
      0,
      {
        name: 'NVIDIA GeForce RTX 4090 Laptop GPU',
        memoryTotalBytes: 16_376 * 1024 * 1024,
        powerLimitWatts: 175,
        maxClockMhz: 2175,
      },
    ]);
    expect(parseFixedLine('garbage')).toBeNull();
  });

  it('reads the live values and treats not available as unknown', () => {
    const parsed = parseLiveLine('1, 14, 2048, 51, 33.46, 780, 6001, [N/A], 0, 24');
    expect(parsed?.[0]).toBe(1);
    expect(parsed?.[1]).toEqual({
      load: 14,
      memoryUsedBytes: 2048 * 1024 * 1024,
      temperature: 51,
      powerWatts: 33.5,
      clockMhz: 780,
      memoryClockMhz: 6001,
      fanPercent: null,
      encoderLoad: 0,
      decoderLoad: 24,
    });
    expect(parseLiveLine('x, 1')).toBeNull();
  });
});

describe('amdgpu clocks', () => {
  it('marks the active level and the highest one', () => {
    expect(parseClocks('0: 400Mhz\n1: 1800Mhz *\n2: 2400Mhz\n')).toEqual({
      current: 1800,
      max: 2400,
    });
    expect(parseClocks('')).toEqual({ current: null, max: null });
  });
});

describe('per program gpu use', () => {
  it('reads a pmon line and ignores headers', () => {
    expect(
      parsePmonLine(
        '    0       1945   C+G     14      5      -      -      -      -    kwin_wayland',
      ),
    ).toEqual([1945, 14]);
    expect(
      parsePmonLine('    0       2625     G      -      -      -      -      -      -    kboard'),
    ).toEqual([2625, 0]);
    expect(parsePmonLine('# gpu         pid   type     sm    mem')).toBeNull();
  });

  it('reads the busiest engine of a drm client from fdinfo', () => {
    const text =
      'pos:\t0\ndrm-driver:\tamdgpu\ndrm-client-id:\t42\ndrm-engine-gfx:\t1000 ns\ndrm-engine-compute:\t2500 ns\n';
    expect(parseFdinfo(text)).toEqual({ client: '42', busyNs: 2500 });
    expect(parseFdinfo('pos:\t0\n')).toBeNull();
    expect(parseFdinfo('drm-client-id: 1\n')).toBeNull();
  });
});
