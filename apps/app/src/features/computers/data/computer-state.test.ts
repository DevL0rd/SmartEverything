import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ENDPOINTS as E, type AudioState, type TilingState } from '@smarteverything/domain';

const answers = vi.hoisted(() => new Map<unknown, unknown>());

vi.mock('../../../api/transport', () => ({
  api: (): { call: (endpoint: unknown) => Promise<unknown> } => ({
    call: (endpoint): Promise<unknown> =>
      answers.has(endpoint)
        ? Promise.resolve(answers.get(endpoint))
        : Promise.reject(new Error('Sound control failed')),
  }),
}));

import { computerLive } from '../../../store/computer-live';
import { seedState } from './computer-state';

const DEVICE = '0b9f3c2e-3c38-4a4f-9d55-6a1f6d4b2a10';

function sound(volume: number): AudioState {
  return {
    outputs: [
      {
        id: 'out',
        name: 'Speakers',
        kind: 'speakers',
        isDefault: true,
        available: true,
        volume,
        muted: false,
        maxVolume: 150,
        batteryPercent: null,
        usedBy: [],
      },
    ],
    inputs: [],
    apps: [],
  };
}

afterEach(() => {
  answers.clear();
  computerLive.store(DEVICE).set({ at: null, parts: {} });
});

describe('seedState', () => {
  it('puts the read state into the live store when no live part has arrived yet', async () => {
    answers.set(E.readComputerAudio, sound(40));
    await seedState(DEVICE, 'audio');
    expect(computerLive.store(DEVICE).get().parts.audio).toEqual(sound(40));
  });

  it('keeps a live part that arrived before the read answered', async () => {
    answers.set(E.readComputerAudio, sound(40));
    computerLive.receive({
      type: 'computer_live',
      deviceId: DEVICE,
      at: new Date().toISOString(),
      parts: { audio: sound(70) },
    });
    await seedState(DEVICE, 'audio');
    expect(computerLive.store(DEVICE).get().parts.audio).toEqual(sound(70));
  });

  it('rejects with the read failure so the page can show it', async () => {
    await expect(seedState(DEVICE, 'displays')).rejects.toThrow('Sound control failed');
    expect(computerLive.store(DEVICE).get().parts.displays).toBeUndefined();
  });

  it('reads the tiling layout of a computer into the live store', async () => {
    const layout: TilingState = { overviewOpen: true, outputs: [], workspaces: [], windows: [] };
    answers.set(E.readComputerTiling, layout);
    await seedState(DEVICE, 'tiling');
    expect(computerLive.store(DEVICE).get().parts.tiling).toEqual(layout);
  });
});
