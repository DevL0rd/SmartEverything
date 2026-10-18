import { describe, expect, it } from 'vitest';
import type { IrCodeRow, IrRemoteRow } from '@smarteverything/domain';
import { deviceFixture, stateFixture } from '../../../store/device-fixture';
import { makeTable, type StoreState } from '../../../store/state';
import { actionOf, sceneGroupsOf, sceneReady, stepLabel, type SceneStep } from './scene-model';

const STAMP = '2026-10-18T10:00:00.000Z';
const BLASTER = '00000000-0000-4000-8000-0000000000b1';
const TV = '00000000-0000-4000-8000-0000000000c1';

const LIBRARY: SceneStep = { kind: 'library', remote: 'TV', deviceId: TV, key: 'KEY_POWER' };
const LEARNED: SceneStep = {
  kind: 'learned',
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
  const devices = [
    deviceFixture(0, { id: BLASTER, kind: 'ir_blaster', name: 'Living Room IR' }),
    deviceFixture(1, {
      id: TV,
      kind: 'ir_remote',
      name: 'TV',
      parent_id: BLASTER,
      capabilities: [
        {
          key: 'remote_key',
          label: 'Remote button',
          access: 'write',
          value: { kind: 'enum', options: ['KEY_POWER', 'KEY_MUTE'] },
        },
      ],
    }),
    deviceFixture(2, { id: 'other', kind: 'ir_remote', name: 'Elsewhere', parent_id: 'x' }),
  ];
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
  it('sends a library key as a remote_key command to the remote', () => {
    expect(actionOf(LIBRARY)).toEqual({
      type: 'command',
      deviceId: TV,
      capability: 'remote_key',
      value: 'KEY_POWER',
    });
  });

  it('sends a learned key as an ir_send command to the blaster', () => {
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
    expect(stepLabel(LIBRARY)).toBe('TV · Power');
    expect(stepLabel(LEARNED)).toBe('Amp · Input');
  });

  it('is ready only with a name and at least one step', () => {
    expect(sceneReady('Movie night', [LIBRARY])).toBe(true);
    expect(sceneReady('  ', [LIBRARY])).toBe(false);
    expect(sceneReady('Movie night', [])).toBe(false);
  });
});

describe('sceneGroupsOf', () => {
  it('offers the keys of this blaster’s library and learned remotes only', () => {
    const groups = sceneGroupsOf(world(), BLASTER);
    expect(groups.map((group) => group.name)).toEqual(['TV', 'Amp']);
    expect(groups[0]?.steps.map((step) => step.key)).toEqual(['KEY_POWER', 'KEY_MUTE']);
    expect(groups[1]?.steps.map((step) => step.key)).toEqual(['Input', 'Power']);
  });

  it('leaves out remotes with no keys', () => {
    expect(sceneGroupsOf(world(), BLASTER).some((group) => group.name === 'Empty')).toBe(false);
  });
});
