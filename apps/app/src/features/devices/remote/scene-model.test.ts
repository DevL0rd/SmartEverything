import { describe, expect, it } from 'vitest';
import type { IrCodeRow, IrRemoteRow } from '@smarteverything/domain';
import { deviceFixture, stateFixture } from '../../../store/device-fixture';
import { makeTable, type StoreState } from '../../../store/state';
import { actionOf, sceneGroupsOf, sceneReady, stepLabel, type SceneStep } from './scene-model';

const STAMP = '2026-10-18T10:00:00.000Z';
const BLASTER = '00000000-0000-4000-8000-0000000000b1';

const LEARNED: SceneStep = {
  remote: 'Amp',
  blasterId: BLASTER,
  key: 'Input',
  format: 'pulses',
  code: 'AAAA',
};

function remote(id: string, name: string): IrRemoteRow {
  return { id, blaster_id: BLASTER, name, category: 'audio', brand: null, created_at: STAMP };
}

function code(id: string, remoteId: string, button: string): IrCodeRow {
  return { id, remote_id: remoteId, button, format: 'pulses', code: 'AAAA', created_at: STAMP };
}

function world(): StoreState {
  const devices = [deviceFixture(0, { id: BLASTER, kind: 'ir_blaster', name: 'Living Room IR' })];
  const base = stateFixture(devices, {});
  const remotes = [remote('amp', 'Amp'), remote('empty', 'Empty')];
  const codes = [code('c1', 'amp', 'Input'), code('c2', 'amp', 'Power')];
  return {
    ...base,
    tables: {
      ...base.tables,
      ir_remotes: makeTable(
        Object.fromEntries(remotes.map((row) => [row.id, row])),
        remotes.map((row) => row.id),
        1,
      ),
      ir_codes: makeTable(
        Object.fromEntries(codes.map((row) => [row.id, row])),
        codes.map((row) => row.id),
        1,
      ),
    },
  };
}

describe('actionOf', () => {
  it('sends a key as an ir_send command to the blaster', () => {
    expect(actionOf(LEARNED)).toEqual({
      type: 'command',
      deviceId: BLASTER,
      capability: 'ir_send',
      value: { format: 'pulses', code: 'AAAA' },
    });
  });
});

describe('scene steps', () => {
  it('labels a step with its remote and a readable key', () => {
    expect(stepLabel(LEARNED)).toBe('Amp · Input');
  });

  it('is ready only with a name and at least one step', () => {
    expect(sceneReady('Movie night', [LEARNED])).toBe(true);
    expect(sceneReady('  ', [LEARNED])).toBe(false);
    expect(sceneReady('Movie night', [])).toBe(false);
  });
});

describe('sceneGroupsOf', () => {
  it('offers the keys of this blaster’s learned remotes only', () => {
    const groups = sceneGroupsOf(world(), BLASTER);
    expect(groups.map((group) => group.name)).toEqual(['Amp']);
    expect(groups[0]?.steps.map((step) => step.key)).toEqual(['Input', 'Power']);
  });

  it('leaves out remotes with no keys', () => {
    expect(sceneGroupsOf(world(), BLASTER).some((group) => group.name === 'Empty')).toBe(false);
  });
});
