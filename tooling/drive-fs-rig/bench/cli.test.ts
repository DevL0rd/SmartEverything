import { describe, expect, it } from 'vitest';
import { parseLocal, parseRun } from './cli.ts';

const NOW = new Date('2026-11-14T19:05:30Z');

describe('parseRun', () => {
  it('defaults to both kinds, five runs and every workload', () => {
    const config = parseRun([], NOW);
    expect(config.kinds).toEqual(['nfs', 'se']);
    expect(config.runs).toBe(5);
    expect(config.workloads).toBeNull();
    expect(config.sweep).toBe(false);
    expect(config.small).toBe(false);
    expect(config.helper).toBeNull();
    expect(config.stamp).toBe('20261114-1905');
  });

  it('reads kinds, runs, workloads and flags', () => {
    const config = parseRun(
      [
        '--kinds',
        'se',
        '--runs',
        '3',
        '--workloads',
        'untar,rm-tree',
        '--sweep',
        '--small',
        '--helper',
        '/x/helper',
      ],
      NOW,
    );
    expect(config).toMatchObject({
      kinds: ['se'],
      runs: 3,
      workloads: ['untar', 'rm-tree'],
      sweep: true,
      small: true,
      helper: '/x/helper',
    });
  });

  it('rejects unknown kinds, bad run counts and bad selections', () => {
    expect(() => parseRun(['--kinds', 'smb'], NOW)).toThrow(/Unknown kind/u);
    expect(() => parseRun(['--runs', '0'], NOW)).toThrow(/--runs/u);
    expect(() => parseRun(['--runs', 'x'], NOW)).toThrow(/--runs/u);
    expect(() => parseRun(['--workloads', 'nope'], NOW)).toThrow(/Unknown workload/u);
  });
});

describe('parseLocal', () => {
  it('needs a named instance so the default rig is never touched', () => {
    expect(() => parseLocal([], NOW, '')).toThrow(/DRIVE_RIG_INSTANCE/u);
  });

  it('defaults to every local kind, three runs and the local scale', () => {
    const config = parseLocal([], NOW, 'mount-bench');
    expect(config.kinds).toContain('nfs');
    expect(config.kinds).toContain('se-par');
    expect(config.runs).toBe(3);
    expect(config.scale).toBe('local');
    expect(config.firstRun).toBe(1);
    expect(config.workloads).toBeNull();
  });

  it('reads kinds, runs, scale and workloads and rejects unknown values', () => {
    expect(
      parseLocal(
        ['--kinds', 'nfs,smb', '--runs', '2', '--scale', 'small', '--workloads', 'create-32'],
        NOW,
        'x',
      ),
    ).toMatchObject({ kinds: ['nfs', 'smb'], runs: 2, scale: 'small', workloads: ['create-32'] });
    expect(parseLocal(['--first-run', '2'], NOW, 'x').firstRun).toBe(2);
    expect(() => parseLocal(['--kinds', 'ftp'], NOW, 'x')).toThrow(/Unknown kind/u);
    expect(() => parseLocal(['--scale', 'huge'], NOW, 'x')).toThrow(/--scale/u);
  });
});
