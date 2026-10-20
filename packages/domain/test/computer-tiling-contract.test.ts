import { describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  COMPUTER_FEATURE_LIST,
  COMPUTER_LIVE_NOTICE,
  NODE_FRAME,
  NODE_REQUEST,
  NODE_VERB_SCOPES,
  STATE_TOPICS,
  TILING_CHANGE,
  TILING_STATE,
} from '../src';

const DEVICE = '00000000-0000-4000-8000-000000000001';
const AT = '2026-10-18T09:00:00.000Z';

const STATE = {
  overviewOpen: false,
  outputs: [{ name: 'DP-1', width: 2560, height: 1440 }],
  workspaces: [
    {
      id: 1,
      index: 1,
      name: 'code',
      output: 'DP-1',
      active: true,
      focused: true,
      urgent: false,
      activeWindowId: 7,
      columns: [
        { display: 'normal', windowIds: [7, 9] },
        { display: 'tabbed', windowIds: [11] },
      ],
    },
  ],
  windows: [
    {
      id: 7,
      title: 'main.ts',
      appId: 'code',
      workspaceId: 1,
      focused: true,
      floating: false,
      urgent: false,
    },
  ],
};

const EVERY_CHANGE = [
  { action: 'focus-window', windowId: 7 },
  { action: 'focus-workspace', workspace: 2 },
  { action: 'focus-workspace', workspace: 'code' },
  { action: 'move-window-to-workspace', windowId: 7, workspace: 'web', focus: false },
  { action: 'move-column-to-workspace', workspace: 3 },
  { action: 'move-column-to-monitor', output: 'HDMI-A-1' },
  { action: 'switch-preset-column-width' },
  { action: 'center-column' },
  { action: 'toggle-overview' },
  { action: 'set-workspace-name', name: 'mail', workspace: 2 },
  { action: 'set-workspace-name', name: 'mail' },
] as const;

describe('tiling changes', () => {
  it.each(EVERY_CHANGE)('accept the allowed action %j', (change) => {
    expect(TILING_CHANGE.safeParse(change).success).toBe(true);
  });

  it('follow the moved window to its workspace unless told not to', () => {
    const moved = TILING_CHANGE.parse({
      action: 'move-column-to-workspace',
      workspace: 2,
    });
    expect(moved).toEqual({ action: 'move-column-to-workspace', workspace: 2, focus: true });
  });

  it('refuse an action that is not allowed, including loading a configuration file', () => {
    const refused = [
      { action: 'load_config_file', path: '/etc/passwd' },
      { action: 'LoadConfigFile', path: '/home/person/.config/konveyor.kdl' },
      { action: 'set_app_rule', appId: 'code' },
      { action: 'spawn', command: 'sh' },
      { name: 'focus-window', arguments: [], properties: {}, id: 1 },
      {},
    ];
    for (const change of refused) {
      expect(TILING_CHANGE.safeParse(change).success).toBe(false);
    }
  });

  it('refuse extra fields so nothing else reaches the compositor', () => {
    const smuggled = [
      { action: 'toggle-overview', arguments: ['x'] },
      { action: 'focus-window', windowId: 7, properties: { id: '8' } },
      { action: 'move-column-to-monitor', output: 'DP-1', path: '/etc/passwd' },
    ];
    for (const change of smuggled) {
      expect(TILING_CHANGE.safeParse(change).success).toBe(false);
    }
  });

  it('refuse a workspace that cannot be told apart from a position or a window that cannot exist', () => {
    const refused = [
      { action: 'focus-workspace', workspace: 0 },
      { action: 'focus-workspace', workspace: 256 },
      { action: 'focus-workspace', workspace: '7' },
      { action: 'focus-workspace', workspace: ' ' },
      { action: 'set-workspace-name', name: '3' },
      { action: 'set-workspace-name', name: '' },
      { action: 'focus-window', windowId: 0 },
      { action: 'focus-window', windowId: 1.5 },
      { action: 'move-column-to-monitor', output: ' ' },
    ];
    for (const change of refused) {
      expect(TILING_CHANGE.safeParse(change).success).toBe(false);
    }
  });
});

describe('the tiling layout', () => {
  it('describes screens, workspaces with columns of windows and the window in front', () => {
    expect(TILING_STATE.parse(STATE)).toEqual(STATE);
  });

  it('refuses a column mode or a window that Konveyor does not have', () => {
    const column = { ...STATE.workspaces[0], columns: [{ display: 'stacked', windowIds: [1] }] };
    expect(TILING_STATE.safeParse({ ...STATE, workspaces: [column] }).success).toBe(false);
    const window = { ...STATE.windows[0], id: 0 };
    expect(TILING_STATE.safeParse({ ...STATE, windows: [window] }).success).toBe(false);
  });
});

describe('tiling on the computer link', () => {
  it('is a feature a computer announces and later withdraws without a new greeting', () => {
    expect(COMPUTER_FEATURE_LIST.parse(['windows', 'tiling'])).toEqual(['windows', 'tiling']);
    const frame = { type: 'features', features: ['windows'] };
    expect(NODE_FRAME.parse(frame)).toEqual(frame);
  });

  it('is read and changed with two requests that follow the apps permission', () => {
    expect(NODE_REQUEST.safeParse({ verb: 'tiling' }).success).toBe(true);
    const change = { verb: 'tiling_set', change: { action: 'toggle-overview' } };
    expect(NODE_REQUEST.safeParse(change).success).toBe(true);
    expect(NODE_REQUEST.safeParse({ verb: 'tiling_set', change: { action: 'x' } }).success).toBe(
      false,
    );
    expect(NODE_VERB_SCOPES.tiling).toBe('apps');
    expect(NODE_VERB_SCOPES.tiling_set).toBe('apps');
  });

  it('is a topic the app can watch and a part of the live notice', () => {
    expect(STATE_TOPICS).toContain('tiling');
    const notice = { type: 'computer_live', deviceId: DEVICE, at: AT, parts: { tiling: STATE } };
    expect(COMPUTER_LIVE_NOTICE.parse(notice)).toEqual(notice);
    const stateFrame = { type: 'state', at: AT, parts: { tiling: STATE } };
    expect(NODE_FRAME.parse(stateFrame)).toEqual(stateFrame);
  });

  it('is reachable as two member endpoints', () => {
    expect(API_ENDPOINTS.readComputerTiling.path).toBe('/api/computers/:deviceId/tiling');
    expect(API_ENDPOINTS.changeComputerTiling.method).toBe('POST');
    expect(API_ENDPOINTS.changeComputerTiling.access).toBe('member');
  });
});
