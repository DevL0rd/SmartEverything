import { describe, expect, it } from 'vitest';
import { actionRows, permissionRows } from './machine-view';

describe('the remote actions a machine reports', () => {
  it('lists each reported action once, in the shared order, with its reason when it is not ready', () => {
    const rows = actionRows([
      { action: 'unlock', state: 'unsupported', reason: 'Android cannot unlock.' },
      { action: 'ring', state: 'ready' },
      {
        action: 'lock',
        state: 'needs_permission',
        permission: 'android_accessibility',
        reason: 'Turn on the accessibility service.',
      },
    ]);
    expect(rows.map((row) => [row.action, row.state, row.detail])).toEqual([
      ['ring', 'ready', null],
      ['lock', 'needs_permission', 'Turn on the accessibility service.'],
      ['unlock', 'unsupported', 'Android cannot unlock.'],
    ]);
  });

  it('shows nothing for actions the machine never reported', () => {
    expect(actionRows([])).toEqual([]);
  });
});

describe('the permissions a machine reports', () => {
  it('names each permission and says where to grant it on that machine', () => {
    const rows = permissionRows(
      [
        { permission: 'mac_screen_recording', granted: false },
        { permission: 'linux_portal_screenshot', granted: false },
        { permission: 'linux_linger', granted: true },
      ],
      'Studio',
    );
    expect(rows).toEqual([
      {
        id: 'mac_screen_recording',
        label: 'Screen Recording',
        granted: false,
        how: 'Turn on Screen Recording in the system settings on Studio.',
      },
      {
        id: 'linux_portal_screenshot',
        label: 'Screenshot permission',
        granted: false,
        how: 'Take one screenshot of Studio and accept the screenshot permission prompt it shows.',
      },
      {
        id: 'linux_linger',
        label: 'Run while signed out',
        granted: true,
        how: 'Run while signed out needs an administrator to allow it once on Studio.',
      },
    ]);
  });
});
