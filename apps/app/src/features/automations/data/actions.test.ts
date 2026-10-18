import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutomationRow } from '@smarteverything/domain';
import type { DeferredAction } from '../../../components/deferred-action';

const save = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
const defer = vi.hoisted(() => vi.fn<(action: DeferredAction) => void>());

vi.mock('../../../api/automations', () => ({
  saveAutomation: save,
  deleteAutomation: remove,
  runAutomation: vi.fn(),
  setAutomationEnabled: vi.fn(),
}));
vi.mock('../../../api/scenes', () => ({
  deleteScene: vi.fn(),
  runScene: vi.fn(),
  saveScene: vi.fn(),
}));
vi.mock('../../../components/toast-store', () => ({ notify: vi.fn() }));
vi.mock('../../../components/deferred-action', () => ({ deferAction: defer }));

import { automationKey, duplicateAutomation, removeAutomation } from './actions';

const SAVED = '00000000-0000-4000-8000-000000000303';

function row(revision: number): AutomationRow {
  return {
    id: SAVED,
    name: 'Fade',
    enabled: true,
    revision,
    definition: {},
    origin: null,
    author: null,
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: '2026-10-17T00:00:00.000Z',
    updated_at: '2026-10-17T00:00:00.000Z',
  };
}

describe('saving automations to the hub', () => {
  beforeEach(() => {
    save.mockReset();
    remove.mockReset();
    defer.mockReset();
  });

  it('duplicates the stored definition under a free name', async () => {
    save.mockResolvedValue(row(1));
    const definition = {
      when: [{ on: 'time' as const, at: '07:00' }],
      steps: [{ do: 'notify' as const, message: 'Morning' }],
    };
    duplicateAutomation({ name: 'Morning', enabled: true, definition }, ['Morning']);
    await vi.waitFor(() => {
      expect(save).toHaveBeenCalledWith({
        automationId: null,
        name: 'Morning copy',
        enabled: true,
        definition,
      });
    });
  });

  it('deletes only after the undo window so Undo keeps the same automation and its references', async () => {
    removeAutomation(SAVED);
    expect(remove).not.toHaveBeenCalled();
    expect(defer).toHaveBeenCalledTimes(1);
    const request = defer.mock.calls[0]?.[0];
    expect(request?.key).toBe(automationKey(SAVED));
    await request?.commit();
    expect(remove).toHaveBeenCalledWith(SAVED);
    expect(save).not.toHaveBeenCalled();
  });
});
