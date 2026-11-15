import { describe, expect, it } from 'vitest';
import { caseMatrix, disturbanceName, triggerFraction } from './crash.ts';
import { choose, parseSelection } from './recovery-runner.ts';
import { CASES as ROUTE_CASES } from './route-switch.ts';

describe('crash case matrix', () => {
  const matrix = caseMatrix();

  it('has unique names', () => {
    expect(new Set(matrix.map((item) => item.name)).size).toBe(matrix.length);
  });

  it('runs every disturbance on both workloads, plain and during a route switch', () => {
    for (const workload of ['big', 'batch'] as const) {
      for (const timing of ['plain', 'switching'] as const) {
        const names = matrix
          .filter((item) => item.workload === workload && item.timing === timing)
          .map((item) => disturbanceName(item.disturbance));
        expect(names).toEqual(
          expect.arrayContaining([
            'kill-helper',
            'kill-desktop',
            'cut-5s',
            'cut-60s',
            'cut-100s',
            'reset-5s',
            'reset-60s',
            'reset-100s',
            'reply-loss',
          ]),
        );
      }
    }
  });

  it('holds the longest outage beyond the 90 second lease', () => {
    const seconds = matrix.flatMap((item) =>
      item.disturbance.kind === 'cut' ? [item.disturbance.seconds] : [],
    );
    expect(Math.max(...seconds)).toBeGreaterThan(90);
  });

  it('tests the fsync journal resume once per workload', () => {
    const reboots = matrix.filter((item) => item.disturbance.kind === 'reboot-after-fsync');
    expect(reboots.map((item) => item.workload).sort()).toEqual(['batch', 'big']);
  });

  it('fires reply loss later in the upload than the other disturbances', () => {
    expect(triggerFraction('big', { kind: 'reply-loss' })).toBeGreaterThan(
      triggerFraction('big', { kind: 'kill-helper' }),
    );
  });
});

describe('route switch cases', () => {
  it('covers reading and uploading across switches and a disconnect', () => {
    expect(ROUTE_CASES.map((item) => item.name)).toEqual([
      'read/lan-public-lan',
      'upload/lan-public-lan',
      'read/disconnect-reconnect',
      'upload/disconnect-reconnect',
    ]);
  });
});

describe('selection', () => {
  it('repeats three times by default and filters by substring', () => {
    const selection = parseSelection(['--case', 'cut-5s', '--case', 'reset']);
    expect(selection.repeat).toBe(3);
    expect(
      choose([{ name: 'big/cut-5s/plain' }, { name: 'big/kill-helper/plain' }], selection.filters),
    ).toEqual([{ name: 'big/cut-5s/plain' }]);
  });

  it('refuses a repeat below one', () => {
    expect(() => parseSelection(['--repeat', '0'])).toThrow('--repeat');
  });
});
