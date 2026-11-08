import { describe, expect, it, vi, type Mock } from 'vitest';
import { confirmStartupScope, type StartupScope } from './startup-log-scope';

interface Fixture {
  readonly bootAt: number;
  readonly now: () => number;
  readonly read: Mock<() => Promise<StartupScope | null>>;
  readonly write: Mock<(scope: StartupScope) => Promise<void>>;
  readonly restore: Mock<(scope: StartupScope, before: number) => Promise<boolean>>;
  readonly clear: Mock<() => void>;
}

function fixture(previous: StartupScope | null): Fixture {
  return {
    bootAt: 100,
    now: (): number => 110,
    read: vi.fn(() => Promise.resolve(previous)),
    write: vi.fn<(scope: StartupScope) => Promise<void>>(() => Promise.resolve()),
    restore: vi.fn<(scope: StartupScope, before: number) => Promise<boolean>>(() =>
      Promise.resolve(true),
    ),
    clear: vi.fn(),
  };
}

describe('startup log provenance', () => {
  it('restores the last bound scope before persisting the new startup boundary', async () => {
    const previous = { scope: 'same hub/device/profile', since: 20 };
    const options = fixture(previous);
    await confirmStartupScope(options, previous.scope, () => true);
    expect(options.restore).toHaveBeenCalledExactlyOnceWith(previous, 100);
    expect(options.write).toHaveBeenCalledExactlyOnceWith({ scope: previous.scope, since: 110 });
    expect(options.restore.mock.invocationCallOrder[0]).toBeLessThan(
      options.write.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it.each([null, { scope: 'old hub/device/profile', since: 20 }])(
    'does not attribute unowned or differently owned logs to a new session',
    async (previous) => {
      const options = fixture(previous);
      await confirmStartupScope(options, 'current hub/device/profile', () => true);
      expect(options.restore).not.toHaveBeenCalled();
      expect(options.clear).toHaveBeenCalledOnce();
      expect(options.write).toHaveBeenCalledExactlyOnceWith({
        scope: 'current hub/device/profile',
        since: 110,
      });
    },
  );

  it('does not advance provenance if the binding changes or the evidence cannot be retained', async () => {
    const previous = { scope: 'same', since: 20 };
    const options = fixture(previous);
    options.restore.mockResolvedValueOnce(false);
    await confirmStartupScope(options, previous.scope, () => true);
    expect(options.write).not.toHaveBeenCalled();
    options.read.mockImplementationOnce(() => {
      current = false;
      return Promise.resolve(previous);
    });
    let current = true;
    await confirmStartupScope(options, previous.scope, () => current);
    expect(options.restore).toHaveBeenCalledTimes(1);
    expect(options.write).not.toHaveBeenCalled();
  });

  it('keeps the start of the current session when live readiness changes', async () => {
    const options = fixture({ scope: 'same', since: 110 });
    await confirmStartupScope(options, 'same', () => true);
    expect(options.restore).not.toHaveBeenCalled();
    expect(options.write).not.toHaveBeenCalled();
  });
});
