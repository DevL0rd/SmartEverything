import { beforeEach, describe, expect, it, vi } from 'vitest';

const setEnabled = vi.hoisted(() => vi.fn<(id: string, enabled: boolean) => Promise<void>>());
const notify = vi.hoisted(() => vi.fn());

vi.mock('../../../api/automations', () => ({ setAutomationEnabled: setEnabled }));
vi.mock('../../../components/toast-store', () => ({ notify }));

import { EntityStore } from '../../../store/entity-store';
import { attempt, toggleAutomation } from './actions';

const AUTOMATION = '00000000-0000-4000-8000-000000000501';

beforeEach(() => {
  setEnabled.mockReset();
  notify.mockReset();
});

describe('automation actions', () => {
  it('switches an automation through the hub', async () => {
    setEnabled.mockResolvedValue(undefined);
    toggleAutomation(new EntityStore(), AUTOMATION, false);
    await vi.waitFor(() => {
      expect(setEnabled).toHaveBeenCalledWith(AUTOMATION, false);
    });
  });

  it('tells the person when an action fails and reports false', async () => {
    const failed = await attempt('It did not work', () => Promise.reject(new Error('no')));
    expect(failed).toBe(false);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'It did not work', tone: 'critical' }),
    );
  });
});
