import { beforeEach, describe, expect, it, vi } from 'vitest';

const setEnabled = vi.hoisted(() => vi.fn<(id: string, enabled: boolean) => Promise<void>>());
const runScene = vi.hoisted(() => vi.fn<(id: string) => Promise<number>>());
const notify = vi.hoisted(() => vi.fn());

vi.mock('../../../api/automations', () => ({ setAutomationEnabled: setEnabled }));
vi.mock('../../../api/scenes', () => ({
  deleteScene: vi.fn(),
  runScene,
  saveScene: vi.fn(),
}));
vi.mock('../../../components/toast-store', () => ({ notify }));

import { attempt, runSceneNow, toggleAutomation } from './actions';

const SCENE = { id: '00000000-0000-4000-8000-000000000501', name: 'Movie' };

beforeEach(() => {
  setEnabled.mockReset();
  runScene.mockReset();
  notify.mockReset();
});

describe('automation actions', () => {
  it('switches an automation through the hub', async () => {
    setEnabled.mockResolvedValue(undefined);
    toggleAutomation(SCENE.id, false);
    await vi.waitFor(() => {
      expect(setEnabled).toHaveBeenCalledWith(SCENE.id, false);
    });
  });

  it('runs a scene and says how many commands were sent', async () => {
    runScene.mockResolvedValue(3);
    runSceneNow(SCENE);
    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Movie is on', tone: 'positive' }),
      );
    });
    expect(runScene).toHaveBeenCalledWith(SCENE.id);
  });

  it('tells the person when an action fails and reports false', async () => {
    const failed = await attempt('It did not work', () => Promise.reject(new Error('no')));
    expect(failed).toBe(false);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'It did not work', tone: 'critical' }),
    );
  });
});
