import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withRole, type PresentedCapability } from '@smarteverything/domain';
import type { Control } from '../../../store/control';
import { deviceModelOf } from '../model/device-model';
import { diffuserDevice } from './fixture';

const calls = vi.hoisted((): string[] => []);
const outcome = vi.hoisted(() => ({ intervalSent: true }));

vi.mock('../../../store/control', () => ({
  useControl: (_device: string, capability: string): Pick<Control, 'set'> => ({
    set: (value): Promise<boolean> => {
      calls.push(`${capability}=${JSON.stringify(value)}`);
      return Promise.resolve(capability === 'raw:2.4' ? outcome.intervalSent : true);
    },
  }),
}));

const { useStrengthWriter } = await import('./strength-writer');

function presented(role: 'spray_interval' | 'spray_duration'): PresentedCapability {
  const found = withRole(deviceModelOf(diffuserDevice()).presentation, role);
  if (found === undefined) throw new Error(`Expected a ${role} control`);
  return found;
}

beforeEach(() => {
  calls.length = 0;
  outcome.intervalSent = true;
});

describe('choosing a diffuser strength', () => {
  it('sets the interval, then the duration', async () => {
    const write = useStrengthWriter(
      diffuserDevice(),
      presented('spray_interval'),
      presented('spray_duration'),
    );
    write('strong');
    await vi.waitFor(() => {
      expect(calls).toEqual(['raw:2.4=10', 'raw:2.3=6']);
    });
  });

  it('leaves the duration alone when the interval was not sent', async () => {
    outcome.intervalSent = false;
    const write = useStrengthWriter(
      diffuserDevice(),
      presented('spray_interval'),
      presented('spray_duration'),
    );
    write('light');
    await vi.waitFor(() => {
      expect(calls).toEqual(['raw:2.4=20']);
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toEqual(['raw:2.4=20']);
  });
});
