import type { MachineUpdateStatus } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { updateMenuItems } from '../../src/updates/update-tray.js';

const ACTIONS = { check: (): void => undefined, install: (): void => undefined };

function status(overrides: Partial<MachineUpdateStatus>): MachineUpdateStatus {
  return {
    state: 'none',
    version: null,
    detail: 'You have the newest version.',
    installable: false,
    ...overrides,
  };
}

describe('the update entries in the tray menu', () => {
  it('offers a check when nothing is pending', () => {
    expect(updateMenuItems(status({}), ACTIONS)).toMatchObject([{ label: 'Check for updates' }]);
  });

  it('offers the install when a release can be installed', () => {
    const items = updateMenuItems(
      status({ state: 'available', version: '0.4.2', installable: true }),
      ACTIONS,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ label: 'Update to version 0.4.2', click: ACTIONS.install });
  });

  it('only informs when the release cannot be installed here', () => {
    const items = updateMenuItems(
      status({ state: 'available', version: '0.4.2', detail: 'Update it elsewhere.' }),
      ACTIONS,
    );
    expect(items).toStrictEqual([{ label: 'Update it elsewhere.', enabled: false }]);
  });

  it.each(['downloading', 'installing'] as const)('shows the progress text while %s', (state) => {
    expect(updateMenuItems(status({ state, detail: 'Working.' }), ACTIONS)).toStrictEqual([
      { label: 'Working.', enabled: false },
    ]);
  });

  it('shows the failure and a way to check again', () => {
    const items = updateMenuItems(status({ state: 'failed', detail: 'Broke.' }), ACTIONS);
    expect(items).toMatchObject([
      { label: 'Broke.', enabled: false },
      { label: 'Check for updates again' },
    ]);
  });
});
