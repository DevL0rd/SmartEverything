import type { MachineUpdateStatus } from '@smarteverything/domain';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { confirmDesktopInstall } from './desktop-install';

const SHOWN = 'a'.repeat(64);
const REPLACEMENT = 'b'.repeat(64);
const OFFER = { version: '0.1.3', id: SHOWN };

function bridgeWith(offerId = SHOWN): {
  readonly installUpdate: Mock<(expected: string) => Promise<MachineUpdateStatus>>;
} {
  const status: MachineUpdateStatus = {
    state: 'available',
    version: '0.1.3',
    installable: true,
    progress: null,
    detail: 'Available',
    offerId,
  };
  return {
    installUpdate: vi.fn((expected: string): Promise<MachineUpdateStatus> =>
      Promise.resolve(expected === status.offerId ? { ...status, state: 'installing' } : status),
    ),
  };
}

describe('desktop installer confirmation', () => {
  it('asks in the shell before handing the captured offer to the native updater', async () => {
    const bridge = bridgeWith();
    const ask = vi.fn((): Promise<boolean> => {
      expect(bridge.installUpdate).not.toHaveBeenCalled();
      return Promise.resolve(true);
    });
    await confirmDesktopInstall(bridge, OFFER, ask, () => false);
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ confirmLabel: 'Install' }),
      'desktop',
    );
    expect(bridge.installUpdate).toHaveBeenCalledExactlyOnceWith(SHOWN);
  });

  it('passes the original ID when a same-version replacement arrives during confirmation', async () => {
    const bridge = bridgeWith(REPLACEMENT);
    let approve = (): void => {
      throw new Error('Confirmation resolver was not initialized');
    };
    const consent = new Promise<boolean>((resolve) => {
      approve = (): void => {
        resolve(true);
      };
    });
    const operation = confirmDesktopInstall(
      bridge,
      OFFER,
      () => consent,
      () => false,
    );
    expect(bridge.installUpdate).not.toHaveBeenCalled();
    approve();
    await operation;
    expect(bridge.installUpdate).toHaveBeenCalledExactlyOnceWith(SHOWN);
  });

  it('rechecks the call guard after the user accepts the captured offer', async () => {
    const bridge = bridgeWith();
    let approve: (accepted: boolean) => void = () => undefined;
    const consent = new Promise<boolean>((resolve) => {
      approve = resolve;
    });
    let busy = false;
    const ask = vi.fn(() => consent);
    const operation = confirmDesktopInstall(bridge, OFFER, ask, () => busy);
    expect(ask).toHaveBeenCalledOnce();
    busy = true;
    approve(true);
    await operation;
    expect(bridge.installUpdate).not.toHaveBeenCalled();
  });

  it('does not request a declined or call-blocked installer', async () => {
    const bridge = bridgeWith();
    await confirmDesktopInstall(
      bridge,
      OFFER,
      () => Promise.resolve(false),
      () => false,
    );
    const ask = vi.fn(() => Promise.resolve(true));
    await confirmDesktopInstall(bridge, OFFER, ask, () => true);
    expect(ask).not.toHaveBeenCalled();
    expect(bridge.installUpdate).not.toHaveBeenCalled();
  });
});
