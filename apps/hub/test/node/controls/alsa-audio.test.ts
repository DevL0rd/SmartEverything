import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AudioState } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlsaAudio, parseCards } from '../../../src/node/controls/linux/alsa-audio';
import { LinuxAudio } from '../../../src/node/controls/linux/linux-audio';
import type { AudioControl } from '../../../src/node/controls/session-controls';
import { manualSchedule } from './support';

const CARDS = ` 0 [PCH            ]: HDA-Intel - HDA Intel PCH
                      HDA Intel PCH at 0x6001130000 irq 139
 1 [Device         ]: USB-Audio - USB Audio Device
                      C-Media USB Audio Device at usb-0000:00:14.0-2`;

function info(name: string, stream: string): string {
  return `card: 0\ndevice: 3\nstream: ${stream}\nid: ${name}\nname: ${name}\n`;
}

let root = '';

async function pcm(card: number, entry: string, name: string, stream: string): Promise<void> {
  const directory = join(root, `card${String(card)}`, entry);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'info'), info(name, stream));
}

beforeEach(async () => {
  await mkdir(join(process.cwd(), '../../tmp/hub-device-page'), { recursive: true });
  root = await mkdtemp(join(process.cwd(), '../../tmp/hub-device-page/alsa-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function alsa(): { audio: AlsaAudio; clock: ReturnType<typeof manualSchedule> } {
  const clock = manualSchedule();
  return { audio: new AlsaAudio(clock.schedule, root), clock };
}

describe('alsa audio', () => {
  it('parses the card list', () => {
    expect([...parseCards(CARDS)]).toEqual([
      ['0', 'HDA Intel PCH'],
      ['1', 'USB Audio Device'],
    ]);
  });

  it('offers no audio when the kernel lists no cards', async () => {
    await expect(alsa().audio.features()).resolves.toEqual([]);
    await writeFile(join(root, 'cards'), '--- no soundcards ---\n');
    await expect(alsa().audio.features()).resolves.toEqual([]);
  });

  it('lists every playback and capture device of every card', async () => {
    await writeFile(join(root, 'cards'), CARDS);
    await pcm(0, 'pcm3p', 'HDMI 0', 'PLAYBACK');
    await pcm(0, 'pcm7p', 'HDMI 1', 'PLAYBACK');
    await pcm(1, 'pcm0p', 'USB Audio', 'PLAYBACK');
    await pcm(1, 'pcm0c', 'USB Audio', 'CAPTURE');
    const { audio } = alsa();
    await expect(audio.features()).resolves.toEqual(['audio']);
    const state = await audio.read();
    expect(state.outputs.map((device) => [device.name, device.kind, device.isDefault])).toEqual([
      ['HDA Intel PCH HDMI 0', 'hdmi', true],
      ['HDA Intel PCH HDMI 1', 'hdmi', false],
      ['USB Audio Device USB Audio', 'usb', false],
    ]);
    expect(state.inputs.map((device) => [device.name, device.kind])).toEqual([
      ['USB Audio Device USB Audio', 'microphone'],
    ]);
    expect(state.apps).toEqual([]);
  });

  it('refuses changes and says what is needed', async () => {
    await expect(
      alsa().audio.change({ action: 'mute', muted: true, kind: 'output' }),
    ).rejects.toMatchObject({
      code: 'not_supported',
      message: 'Changing sound needs PipeWire or PulseAudio on this computer.',
    });
  });

  it('reports a device that appears while watched', async () => {
    await writeFile(join(root, 'cards'), CARDS.split('\n').slice(0, 2).join('\n'));
    await pcm(0, 'pcm3p', 'HDMI 0', 'PLAYBACK');
    const { audio, clock } = alsa();
    const seen: AudioState[] = [];
    const stop = audio.watch((state) => seen.push(state));
    await pcm(1, 'pcm0p', 'USB Audio', 'PLAYBACK');
    await writeFile(join(root, 'cards'), CARDS);
    clock.advance();
    await vi.waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    stop();
    expect(seen.at(-1)?.outputs.map((device) => device.name)).toContain(
      'USB Audio Device USB Audio',
    );
  });
});

describe('linux audio', () => {
  function fake(features: readonly ('audio' | 'audio_apps')[], tag: string): AudioControl {
    return {
      features: () => Promise.resolve(features),
      read: () => Promise.resolve({ outputs: [], inputs: [], apps: [] }),
      change: () => Promise.reject(new Error(tag)),
      watch: () => () => undefined,
    };
  }

  it('prefers the sound server and falls back to the hardware list', async () => {
    const served = new LinuxAudio(
      fake(['audio'], 'server'),
      fake(['audio'], 'hardware'),
      () => undefined,
    );
    await expect(served.change({ action: 'mute', muted: true, kind: 'output' })).rejects.toThrow(
      'server',
    );
    const bare = new LinuxAudio(fake([], 'server'), fake(['audio'], 'hardware'), () => undefined);
    await expect(bare.features()).resolves.toEqual(['audio']);
    await expect(bare.change({ action: 'mute', muted: true, kind: 'output' })).rejects.toThrow(
      'hardware',
    );
  });
});
