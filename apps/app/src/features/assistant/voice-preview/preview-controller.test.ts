import { describe, expect, it } from 'vitest';
import type { VoiceSample } from '@smarteverything/domain';
import {
  VoicePreviewController,
  type PreviewPlaybackEvents,
  type PreviewPorts,
} from './preview-controller';

const SAMPLE: VoiceSample = { audio: 'UklGRg==' };

interface Pending {
  readonly voice: string;
  readonly signal: AbortSignal;
  readonly resolve: (sample: VoiceSample) => void;
  readonly reject: (error: Error) => void;
}
interface Harness {
  readonly ports: PreviewPorts;
  readonly loads: Pending[];
  readonly played: PreviewPlaybackEvents[];
  readonly released: number[];
}

function harness(): Harness {
  const loads: Pending[] = [];
  const played: PreviewPlaybackEvents[] = [];
  const released: number[] = [];
  const ports: PreviewPorts = {
    load: (voice, signal) =>
      new Promise((resolve, reject) => {
        loads.push({ voice, signal, resolve, reject });
      }),
    play: (_sample, events) => {
      played.push(events);
      return (): void => {
        released.push(played.length);
      };
    },
  };
  return { ports, loads, played, released };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('voice preview controller', () => {
  it('loads a sample, plays it and returns to idle when it finishes', async () => {
    const { ports, loads, played, released } = harness();
    const controller = new VoicePreviewController();
    controller.toggle('Zephyr', ports);
    expect(controller.state.get()).toStrictEqual({ kind: 'loading', voice: 'Zephyr' });
    loads[0]?.resolve(SAMPLE);
    await settle();
    played[0]?.playing();
    expect(controller.state.get()).toStrictEqual({ kind: 'playing', voice: 'Zephyr' });
    played[0]?.finished();
    expect(controller.state.get()).toStrictEqual({ kind: 'idle' });
    expect(released).toHaveLength(1);
  });

  it('aborts the request when the same voice is tapped again', () => {
    const { ports, loads } = harness();
    const controller = new VoicePreviewController();
    controller.toggle('Zephyr', ports);
    controller.toggle('Zephyr', ports);
    expect(loads).toHaveLength(1);
    expect(loads[0]?.signal.aborted).toBe(true);
    expect(controller.state.get()).toStrictEqual({ kind: 'idle' });
  });

  it('drops the earlier voice when another is chosen, ignoring its late sample', async () => {
    const { ports, loads, played } = harness();
    const controller = new VoicePreviewController();
    controller.toggle('Zephyr', ports);
    controller.toggle('Puck', ports);
    expect(loads[0]?.signal.aborted).toBe(true);
    loads[0]?.resolve(SAMPLE);
    await settle();
    expect(played).toHaveLength(0);
    expect(controller.state.get()).toStrictEqual({ kind: 'loading', voice: 'Puck' });
  });

  it('shows the hub message beside the voice that failed to load', async () => {
    const { ports, loads } = harness();
    const controller = new VoicePreviewController();
    controller.toggle('Zephyr', ports);
    loads[0]?.reject(new Error('Add a Gemini key.'));
    await settle();
    expect(controller.state.get()).toStrictEqual({
      kind: 'error',
      voice: 'Zephyr',
      message: 'Add a Gemini key.',
    });
  });

  it('stops playback and ignores a failure reported after the stop', async () => {
    const { ports, loads, played, released } = harness();
    const controller = new VoicePreviewController();
    controller.toggle('Zephyr', ports);
    loads[0]?.resolve(SAMPLE);
    await settle();
    controller.stop();
    played[0]?.failed('late');
    expect(released).toHaveLength(1);
    expect(controller.state.get()).toStrictEqual({ kind: 'idle' });
  });

  it('reports a player that cannot start', async () => {
    const controller = new VoicePreviewController();
    const ports: PreviewPorts = {
      load: () => Promise.resolve(SAMPLE),
      play: () => {
        throw new Error('No audio output.');
      },
    };
    controller.toggle('Zephyr', ports);
    await settle();
    expect(controller.state.get()).toStrictEqual({
      kind: 'error',
      voice: 'Zephyr',
      message: 'No audio output.',
    });
  });
});
