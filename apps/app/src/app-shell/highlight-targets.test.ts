import { describe, expect, it, vi } from 'vitest';
import { anchorKeysOf } from './highlight-targets';

vi.mock('./nav-targets', () => ({
  settingTargetOf: (target: {
    readonly page: string;
    readonly setting: string | null;
  }): { readonly page: string; readonly row: string | null } => ({
    page: target.page,
    row: target.setting,
  }),
}));

const ID = '44444444-4444-4444-8444-444444444444';

describe('the elements a target can point at', () => {
  it('points a section at its navigation item', () => {
    expect(anchorKeysOf({ kind: 'section', section: 'fitness' }, null)).toEqual([
      'nav:section:fitness',
    ]);
  });

  it('points a navigation node at itself', () => {
    expect(anchorKeysOf({ kind: 'nav', node: 'pin-1' }, null)).toEqual(['nav:pin-1']);
  });

  it('points a setting at its row, the focus winning over the page row', () => {
    const setting = { kind: 'setting', page: 'wake', setting: 'word' } as const;
    expect(anchorKeysOf(setting, null)).toEqual(['setting:word']);
    expect(anchorKeysOf(setting, 'phrase')).toEqual(['setting:phrase']);
    expect(anchorKeysOf({ kind: 'setting', page: 'wake', setting: null }, null)).toEqual([]);
  });

  it('points a device at its tile, or at a capability when focused', () => {
    const device = { kind: 'device', deviceId: ID, focus: null } as const;
    expect(anchorKeysOf(device, null)).toEqual([`tile:device:${ID}`]);
    expect(anchorKeysOf(device, 'brightness')).toEqual([`capability:${ID}:brightness`]);
  });

  it('points an automation at a step only when a step is named', () => {
    const automation = { kind: 'automation', automationId: ID, focus: null } as const;
    expect(anchorKeysOf(automation, null)).toEqual([]);
    expect(anchorKeysOf(automation, 'step-1')).toEqual(['step:step-1']);
  });

  it('has nothing to point at on pages, rooms, cameras, groups, scenes and chats', () => {
    const targets = [
      { kind: 'page', path: 'fitness/sleep' },
      { kind: 'room', roomId: ID },
      { kind: 'camera', deviceId: ID },
      { kind: 'group', groupId: ID },
      { kind: 'scene', sceneId: ID },
      { kind: 'chat', chatId: ID },
    ] as const;
    for (const target of targets) {
      expect(anchorKeysOf(target, 'anything')).toEqual([]);
    }
  });
});
