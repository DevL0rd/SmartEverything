import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_CATALOGUE,
  FILE_PATH,
  MACHINE_ACTIONS,
  MACHINE_ACTION_CAPABILITY,
  MACHINE_ACTION_RISK,
  MACHINE_ACTION_SUPPORTS,
  MACHINE_PERMISSIONS,
  MACHINE_PERMISSION_IDS,
  MACHINE_PERMISSION_STATES,
  NODE_HELLO,
  NODE_FRAME,
  NODE_REQUEST,
  NODE_VERB_SCOPES,
  PHONE_ACTION,
  PHONE_REPORT,
  PUSH_COMMAND_TTL_SECONDS,
  PUSH_COMMANDS_OVER_LIVE,
  SEE_REQUEST,
  machineActionOfCapability,
  machineActionOfPhoneAction,
  machineActionRefusal,
  machineOpenTargetOf,
  reportedMachineActions,
  type MachineActionSupport,
} from '../src';

const HELLO = {
  machineId: 'a'.repeat(32),
  hostname: 'desk',
  os: { name: 'Linux', kernel: '6' },
  hardware: { vendor: null, product: null, portable: false },
  cpu: { model: 'CPU', threads: 2, hybrid: false },
  memoryBytes: 8e9,
  interfaces: [],
  bootedAt: '2026-10-18T09:00:00.000Z',
};

describe('machine action support reports', () => {
  it('says ready, needs a named permission, or cannot, each with the facts it needs', () => {
    expect(
      MACHINE_ACTION_SUPPORTS.parse([
        { action: 'ring', state: 'ready' },
        {
          action: 'lock',
          state: 'needs_permission',
          permission: 'android_accessibility',
          reason: 'Locking needs the accessibility service.',
        },
        {
          action: 'unlock',
          state: 'unsupported',
          reason: 'Android cannot unlock a secure screen.',
        },
      ]),
    ).toHaveLength(3);
  });

  it('rejects a missing permission, an unknown action and the same action twice', () => {
    expect(
      MACHINE_ACTION_SUPPORTS.safeParse([
        { action: 'lock', state: 'needs_permission', reason: 'x' },
      ]).success,
    ).toBe(false);
    expect(MACHINE_ACTION_SUPPORTS.safeParse([{ action: 'explode', state: 'ready' }]).success).toBe(
      false,
    );
    expect(
      MACHINE_ACTION_SUPPORTS.safeParse([
        { action: 'ring', state: 'ready' },
        { action: 'ring', state: 'ready' },
      ]).success,
    ).toBe(false);
  });

  it('reports each permission once', () => {
    expect(
      MACHINE_PERMISSION_STATES.safeParse([
        { permission: 'mac_automation', granted: true },
        { permission: 'mac_automation', granted: false },
      ]).success,
    ).toBe(false);
  });

  it('keeps only usable actions when listing what a machine offers', () => {
    const supports: MachineActionSupport[] = [
      { action: 'ring', state: 'ready' },
      { action: 'lock', state: 'unsupported', reason: 'no' },
      {
        action: 'open',
        state: 'needs_permission',
        permission: 'android_overlay',
        reason: 'Needs permission.',
      },
    ];
    expect(reportedMachineActions(supports).map((support) => support.action)).toEqual([
      'ring',
      'open',
    ]);
  });
});

describe('why a machine action is refused', () => {
  const supports: MachineActionSupport[] = [
    { action: 'ring', state: 'ready' },
    {
      action: 'screenshot',
      state: 'needs_permission',
      permission: 'mac_screen_recording',
      reason: 'macOS has not allowed screen recording.',
    },
    { action: 'unlock', state: 'unsupported', reason: 'macOS has no way to unlock.' },
  ];

  it('allows a ready action', () => {
    expect(machineActionRefusal(supports, 'ring')).toBeNull();
  });

  it('names the permission and where to grant it', () => {
    expect(machineActionRefusal(supports, 'screenshot')).toBe(
      'macOS has not allowed screen recording. Grant "Screen Recording" on that machine.',
    );
  });

  it('repeats the machine reason for an unsupported action', () => {
    expect(machineActionRefusal(supports, 'unlock')).toBe('macOS has no way to unlock.');
  });

  it('says plainly when the machine never reported the action', () => {
    expect(machineActionRefusal(supports, 'launch_app')).toBe(
      'This machine has not reported that it can launch app.',
    );
  });
});

describe('machine actions as device capabilities', () => {
  it('maps every action that is a device control to a catalogued capability and back', () => {
    MACHINE_ACTIONS.forEach((action) => {
      const key = MACHINE_ACTION_CAPABILITY[action];
      if (key !== null) {
        expect(CAPABILITY_CATALOGUE[key].label.length).toBeGreaterThan(0);
        expect(machineActionOfCapability(key)).toBe(action);
      }
    });
    expect(machineActionOfCapability('brightness')).toBeNull();
  });

  it('asks for a person only before unlock', () => {
    expect(MACHINE_ACTIONS.filter((action) => MACHINE_ACTION_RISK[action] === 'confirm')).toEqual([
      'unlock',
    ]);
  });

  it('knows a label, a platform and a way to grant every permission', () => {
    MACHINE_PERMISSION_IDS.forEach((id) => {
      expect(MACHINE_PERMISSIONS[id].label.length).toBeGreaterThan(0);
    });
  });
});

describe('what to open on a machine', () => {
  it('tells a link from an absolute path on any system', () => {
    expect(machineOpenTargetOf('https://example.com/a')).toEqual({
      kind: 'url',
      url: 'https://example.com/a',
    });
    expect(machineOpenTargetOf('mailto:a@b.co')).toMatchObject({ kind: 'url' });
    expect(machineOpenTargetOf('/home/me/a.pdf')).toEqual({ kind: 'path', path: '/home/me/a.pdf' });
    expect(machineOpenTargetOf('C:\\Users\\me\\a.pdf')).toMatchObject({ kind: 'path' });
    expect(machineOpenTargetOf('\\\\nas\\share\\a.pdf')).toMatchObject({ kind: 'path' });
  });

  it('refuses a relative path, a script link and empty text, quoting what it got', () => {
    expect(() => machineOpenTargetOf('docs/a.pdf')).toThrow('received "docs/a.pdf"');
    expect(() => machineOpenTargetOf('javascript:alert(1)')).toThrow('Expected a web');
    expect(() => machineOpenTargetOf('')).toThrow('Expected a web');
  });

  it('accepts POSIX, drive and network paths for files and nothing relative', () => {
    ['/a', 'c:/a', 'D:\\a', '\\\\host\\share'].forEach((path) => {
      expect(FILE_PATH.safeParse(path).success).toBe(true);
    });
    ['a/b', '\\\\host', 'C:a', ''].forEach((path) => {
      expect(FILE_PATH.safeParse(path).success).toBe(false);
    });
  });
});

describe('the wire contract for machine actions', () => {
  it('lets a computer say what it can do in its hello and change it later', () => {
    expect(NODE_HELLO.parse(HELLO)).toMatchObject({ actions: [], permissions: [] });
    expect(
      NODE_HELLO.parse({ ...HELLO, actions: [{ action: 'ring', state: 'ready' }] }).actions,
    ).toHaveLength(1);
    expect(
      NODE_FRAME.safeParse({
        type: 'machine',
        actions: [{ action: 'ring', state: 'ready' }],
        permissions: [{ permission: 'mac_automation', granted: true }],
      }).success,
    ).toBe(true);
  });

  it('lets a phone report the same and ask for the new actions', () => {
    const bare = PHONE_REPORT.parse({ at: '2026-10-18T10:00:00.000Z', values: {}, events: [] });
    expect(bare.actions).toBeUndefined();
    expect(bare.permissions).toBeUndefined();
    const actions = [
      { type: 'launch_app', app: 'Chrome' },
      { type: 'lock' },
      { type: 'show_unlock' },
      { type: 'screenshot' },
      { type: 'receive_file', fileId: '3d000000-0000-4000-8000-000000000031' },
    ];
    actions.forEach((action) => {
      expect(PHONE_ACTION.parse(action)).toEqual(action);
    });
    expect(PHONE_ACTION.safeParse({ type: 'launch_app', app: '' }).success).toBe(false);
  });

  it('gates the new node verbs by the scope of what they do', () => {
    const requests = [
      { verb: 'ring', on: true },
      { verb: 'open', target: { kind: 'path', path: '/a' } },
      { verb: 'unlock' },
      { verb: 'show_unlock' },
    ];
    expect(requests.map((request) => NODE_VERB_SCOPES[NODE_REQUEST.parse(request).verb])).toEqual([
      'apps',
      'apps',
      'power',
      'power',
    ]);
  });

  it('gives an approval a full minute', () => {
    expect(PUSH_COMMAND_TTL_SECONDS.machine_approval).toBe(60);
  });

  it('sends the withdrawal of an approval over the live link like the approval itself', () => {
    expect(PUSH_COMMANDS_OVER_LIVE).toContain('machine_approval_cancel');
    expect(PUSH_COMMAND_TTL_SECONDS.machine_approval_cancel).toBeGreaterThan(0);
  });
});

describe('phone actions as machine actions', () => {
  it('names the machine action each phone action performs and none for plain settings', () => {
    const named = [
      { type: 'ring', on: true },
      { type: 'ring', on: false },
      { type: 'flashlight', mode: 'on' },
      { type: 'launch_app', app: 'Chrome' },
      { type: 'open_url', url: 'https://example.com', label: 'example.com' },
      { type: 'screenshot' },
      { type: 'lock' },
      { type: 'show_unlock' },
      { type: 'receive_file', fileId: '3d000000-0000-4000-8000-000000000031' },
    ].map((action) => machineActionOfPhoneAction(PHONE_ACTION.parse(action)));
    expect(named).toEqual([
      'ring',
      'stop_ring',
      'flashlight',
      'launch_app',
      'open',
      'screenshot',
      'lock',
      'show_unlock',
      'receive_file',
    ]);
    expect(
      machineActionOfPhoneAction(PHONE_ACTION.parse({ type: 'set_dnd', on: true })),
    ).toBeNull();
  });
});

describe('the see request for a phone', () => {
  it('takes a phone by name or alone and refuses the fields of other sources', () => {
    expect(SEE_REQUEST.parse({ source: 'phone_screenshot', phone: 'Pixel' })).toEqual({
      source: 'phone_screenshot',
      phone: 'Pixel',
    });
    expect(SEE_REQUEST.parse({ source: 'phone_screenshot' })).toEqual({
      source: 'phone_screenshot',
    });
    expect(SEE_REQUEST.safeParse({ source: 'phone_screenshot', computer: 'Desk' }).success).toBe(
      false,
    );
  });
});
