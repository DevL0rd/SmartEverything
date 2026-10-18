import type { MachineUpdateStatus } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { updateRowOf } from './app-update-model';

function status(overrides: Partial<MachineUpdateStatus>): MachineUpdateStatus {
  return {
    state: 'none',
    version: null,
    detail: 'You have the newest version.',
    installable: false,
    ...overrides,
  };
}

describe('the app update row', () => {
  it('offers a check while up to date', () => {
    expect(updateRowOf(status({}))).toStrictEqual({
      kind: 'action',
      title: 'Check for updates',
      subtitle: 'You have the newest version.',
      act: 'check',
    });
  });

  it('offers the install for a release that can be installed', () => {
    expect(
      updateRowOf(
        status({ state: 'available', version: '0.4.2', installable: true, detail: 'Ready.' }),
      ),
    ).toMatchObject({ kind: 'action', title: 'Update to version 0.4.2', act: 'install' });
  });

  it('only informs for a release this copy cannot install', () => {
    expect(
      updateRowOf(
        status({
          state: 'available',
          version: '0.4.2',
          detail: 'Update it in your package manager.',
        }),
      ),
    ).toStrictEqual({
      kind: 'info',
      title: 'Version 0.4.2 is available',
      value: 'Not here',
      subtitle: 'Update it in your package manager.',
    });
  });

  it.each([
    ['downloading', 'Downloading…'],
    ['installing', 'Installing…'],
  ] as const)('shows %s as progress', (state, value) => {
    expect(updateRowOf(status({ state, detail: 'Working.' }))).toMatchObject({
      kind: 'info',
      value,
    });
  });

  it('offers to check again after a failure and keeps the reason', () => {
    expect(updateRowOf(status({ state: 'failed', detail: 'Broke.' }))).toStrictEqual({
      kind: 'action',
      title: 'Check for updates again',
      subtitle: 'Broke.',
      act: 'check',
    });
  });
});
