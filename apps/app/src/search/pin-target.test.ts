import { describe, expect, it, vi } from 'vitest';
import type { SearchEntry, SearchTarget } from '@smarteverything/domain';
import type { ResultNode } from './nodes';

vi.mock('../app-shell/routes', () => ({
  TAB_ROUTES: [
    { key: 'fitness', tab: 'fitness', title: 'Fitness', icon: 'fitness', href: '/fitness' },
  ],
  ROUTES: [
    { key: 'fitness', tab: 'fitness', title: 'Fitness', icon: 'fitness', href: '/fitness' },
    { key: 'fitness-sleep', tab: 'fitness', title: 'Sleep', icon: 'moon', href: '/fitness/sleep' },
  ],
}));
vi.mock('../settings/tree', () => ({ settingsPage: (): undefined => undefined }));
vi.mock('../settings/registry', () => ({ settingPageOf: (): undefined => undefined }));
vi.mock('../features/device-visuals', () => ({ deviceIcon: (): string => 'bulb' }));

const { pinTargetOfNode } = await import('./pin-target');

const ID = '11111111-1111-4111-8111-111111111111';

function entryOf(
  group: SearchEntry['group'],
  open: SearchTarget,
  run: SearchTarget | null = null,
): SearchEntry {
  return {
    id: 'entry',
    group,
    title: 'Entry',
    detail: '',
    keywords: [],
    state: null,
    run,
    runLabel: null,
    open,
    openLabel: 'Open',
    suggested: false,
  };
}

function nodeOf(
  group: SearchEntry['group'],
  open: SearchTarget,
  run: SearchTarget | null = null,
): ResultNode {
  return {
    key: 'entry',
    item: { kind: 'entry', entry: entryOf(group, open, run), title: 'Entry' },
    score: 1,
    hit: true,
    found: true,
    range: null,
    children: [],
  };
}

describe('what a search result offers to pin', () => {
  it('offers a device, a room and a camera as themselves', () => {
    expect(pinTargetOfNode(nodeOf('device', { kind: 'device', deviceId: ID }))).toStrictEqual({
      kind: 'device',
      deviceId: ID,
      focus: null,
    });
    expect(pinTargetOfNode(nodeOf('room', { kind: 'room', roomId: ID }))).toStrictEqual({
      kind: 'room',
      roomId: ID,
    });
    expect(
      pinTargetOfNode(nodeOf('device', { kind: 'camera', deviceId: ID, talk: false })),
    ).toStrictEqual({ kind: 'camera', deviceId: ID });
  });

  it('offers a scene or an automation by what it runs, not by the page it opens', () => {
    const scene = nodeOf(
      'scene',
      { kind: 'page', path: 'scenes#edit' },
      { kind: 'scene', sceneId: ID },
    );
    expect(pinTargetOfNode(scene)).toStrictEqual({ kind: 'scene', sceneId: ID });
    const automation = nodeOf(
      'automation',
      { kind: 'page', path: 'automations#edit' },
      { kind: 'automation', automationId: ID, enabled: true },
    );
    expect(pinTargetOfNode(automation)).toStrictEqual({
      kind: 'automation',
      automationId: ID,
      focus: null,
    });
  });

  it('offers a sub-page but not a section, a setting or a command', () => {
    expect(pinTargetOfNode(nodeOf('page', { kind: 'page', path: 'fitness-sleep' }))).toStrictEqual({
      kind: 'page',
      path: 'fitness-sleep',
    });
    expect(pinTargetOfNode(nodeOf('page', { kind: 'page', path: 'fitness' }))).toBeNull();
    expect(pinTargetOfNode(nodeOf('setting', { kind: 'page', path: 'fitness-sleep' }))).toBeNull();
    expect(
      pinTargetOfNode(
        nodeOf('action', { kind: 'command', deviceId: ID, capability: 'power', value: true }),
      ),
    ).toBeNull();
  });

  it('offers nothing for the rows under a device', () => {
    const child: ResultNode = {
      ...nodeOf('device', { kind: 'device', deviceId: ID }),
      item: {
        kind: 'phrase',
        deviceId: ID,
        entry: entryOf('device', { kind: 'device', deviceId: ID }),
        phrase: 'Turn on',
      },
    };
    expect(pinTargetOfNode(child)).toBeNull();
  });
});
