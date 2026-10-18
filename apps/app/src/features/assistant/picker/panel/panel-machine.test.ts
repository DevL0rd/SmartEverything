import { describe, expect, it } from 'vitest';
import { ENGINE } from '@smarteverything/domain';
import { computerFacts, engineMachineId, folderName, machineLine } from './panel-machine';
import type { ComputerEngine } from '../../provider/computer-engine';

const DEVICE = '0b3f4c1e-5d7a-4e0b-9a41-6a6d2f0c8a11';

describe('the machine row line', () => {
  it('shows an online machine with the last folder segment', () => {
    expect(machineLine({ health: { kind: 'online' }, folder: '/home/dana/repo/' })).toEqual({
      text: 'Online · repo',
      warning: false,
    });
  });

  it('shows plain Online without a folder or in the home folder', () => {
    expect(machineLine({ health: { kind: 'online' }, folder: null }).text).toBe('Online');
    expect(machineLine({ health: { kind: 'online' }, folder: '~' }).text).toBe('Online');
  });

  it('warns when the machine is offline or has a problem', () => {
    expect(machineLine({ health: { kind: 'offline' }, folder: '/a/b' })).toEqual({
      text: 'Offline',
      warning: true,
    });
    expect(
      machineLine({ health: { kind: 'problem', reason: 'Runtime not running' }, folder: null }),
    ).toEqual({ text: 'Runtime not running', warning: true });
  });

  it('says it is checking while the machines load', () => {
    expect(machineLine({ health: { kind: 'unknown' }, folder: null }).text).toBe('Checking…');
  });

  it('reads Windows folders too', () => {
    expect(folderName('C:\\Users\\dana\\repo')).toBe('repo');
  });
});

describe('which machine an engine runs on', () => {
  it('maps each engine to its library source id', () => {
    const device = ENGINE.parse({ kind: 'claude', device_id: DEVICE, model: 'opus' });
    const hub = ENGINE.parse({ kind: 'openrouter', model: null });
    const harness = ENGINE.parse({
      kind: 'dsh',
      execution_target: { kind: 'device', device_id: DEVICE },
      session_id: null,
      model_route_id: DEVICE,
      model: 'sonnet',
    });
    expect(engineMachineId(device)).toBe(`device:${DEVICE}`);
    expect(engineMachineId(hub)).toBe('server');
    expect(engineMachineId(harness)).toBe(`device:${DEVICE}`);
  });
});

describe('the folder of a computer engine', () => {
  const engine = (settings: object): ComputerEngine => {
    const parsed = ENGINE.parse({ kind: 'claude', device_id: DEVICE, model: 'opus', settings });
    if (parsed.kind !== 'claude') throw new Error('expected a Claude engine');
    return parsed;
  };

  it('can be chosen by the owner when the computer is online, so a chat can get local tools', () => {
    const facts = computerFacts(engine({}), { online: true, reason: null }, true);
    expect(facts.canChooseFolder).toBe(true);
    expect(facts.folder).toBeNull();
  });

  it('shows the folder the chat already uses', () => {
    expect(
      computerFacts(engine({ cwd: '/home/dana/repo' }), { online: true, reason: null }, true)
        .folder,
    ).toBe('/home/dana/repo');
  });

  it('cannot be chosen by a non-owner or on an offline or unknown computer', () => {
    expect(computerFacts(engine({}), { online: true, reason: null }, false).canChooseFolder).toBe(
      false,
    );
    expect(computerFacts(engine({}), { online: false, reason: null }, true).canChooseFolder).toBe(
      false,
    );
    expect(computerFacts(engine({}), undefined, true).canChooseFolder).toBe(false);
  });
});
