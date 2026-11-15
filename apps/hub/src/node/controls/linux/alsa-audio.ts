import type {
  AudioChange,
  AudioDevice,
  AudioState,
  ComputerFeature,
} from '@smarteverything/domain';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMissing } from '../../../fs-util';
import { NodeFailureError } from '../../node-failure';
import type { AudioControl, StopWatching } from '../session-controls';
import type { Schedule } from './display-revert';

export const ALSA_ROOT = '/proc/asound';

const CARD_LINE = /^\s*(\d+) \[[^\]]*\]:\s*\S+\s+-\s+(.+?)\s*$/u;
const PCM_DIRECTORY = /^pcm(\d+)([pc])$/u;
const NAME_LINE = /^name:\s*(.+?)\s*$/mu;
const POLL_MS = 5000;
const NEEDS_SERVER = 'Changing sound needs PipeWire or PulseAudio on this computer.';

type Direction = 'output' | 'input';

interface Stream {
  readonly card: string;
  readonly device: string;
  readonly cardName: string;
  readonly pcmName: string;
  readonly direction: Direction;
}

async function textOf(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (cause) {
    if (isMissing(cause)) {
      return null;
    }
    throw cause;
  }
}

async function namesOf(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch (cause) {
    if (isMissing(cause)) {
      return [];
    }
    throw cause;
  }
}

export function parseCards(text: string): ReadonlyMap<string, string> {
  const cards = new Map<string, string>();
  for (const line of text.split('\n')) {
    const match = CARD_LINE.exec(line);
    const [, card, name] = match ?? [];
    if (card !== undefined && name !== undefined) {
      cards.set(card, name);
    }
  }
  return cards;
}

function kindOf(stream: Stream): AudioDevice['kind'] {
  if (stream.direction === 'input') {
    return 'microphone';
  }
  const label = `${stream.cardName} ${stream.pcmName}`;
  if (/hdmi|displayport/iu.test(label)) {
    return 'hdmi';
  }
  return /usb/iu.test(label) ? 'usb' : 'other';
}

function deviceOf(stream: Stream, isDefault: boolean): AudioDevice {
  const name = stream.pcmName === '' ? stream.cardName : `${stream.cardName} ${stream.pcmName}`;
  return {
    id: `alsa:hw:${stream.card},${stream.device}:${stream.direction}`,
    name,
    kind: kindOf(stream),
    isDefault,
    available: true,
    volume: 100,
    muted: false,
    maxVolume: 100,
    batteryPercent: null,
    usedBy: [],
  };
}

async function cardStreams(root: string, card: string, cardName: string): Promise<Stream[]> {
  const entries = (await namesOf(join(root, `card${card}`)))
    .map((entry) => ({ entry, match: PCM_DIRECTORY.exec(entry) }))
    .toSorted((left, right) => left.entry.localeCompare(right.entry, 'en', { numeric: true }));
  const streams: Stream[] = [];
  for (const { entry, match } of entries) {
    const [, device, side] = match ?? [];
    if (device === undefined || side === undefined) {
      continue;
    }
    const info = await textOf(join(root, `card${card}`, entry, 'info'));
    streams.push({
      card,
      device,
      cardName,
      pcmName: NAME_LINE.exec(info ?? '')?.[1] ?? '',
      direction: side === 'p' ? 'output' : 'input',
    });
  }
  return streams;
}

async function streamsOf(root: string): Promise<readonly Stream[]> {
  const cards = parseCards((await textOf(join(root, 'cards'))) ?? '');
  const streams: Stream[] = [];
  for (const [card, cardName] of cards) {
    streams.push(...(await cardStreams(root, card, cardName)));
  }
  return streams;
}

export class AlsaAudio implements AudioControl {
  private readonly listeners = new Set<(state: AudioState) => void>();
  private cancelPoll: (() => void) | null = null;
  private last = '';

  constructor(
    private readonly schedule: Schedule,
    private readonly root: string = ALSA_ROOT,
    private readonly failed: (cause: unknown) => void = () => undefined,
  ) {}

  async features(): Promise<readonly ComputerFeature[]> {
    return (await streamsOf(this.root)).length > 0 ? ['audio'] : [];
  }

  async read(): Promise<AudioState> {
    const streams = await streamsOf(this.root);
    const devices = (direction: Direction): AudioDevice[] =>
      streams
        .filter((stream) => stream.direction === direction)
        .map((stream, index) => deviceOf(stream, index === 0));
    return { outputs: devices('output'), inputs: devices('input'), apps: [] };
  }

  change(_change: AudioChange): Promise<AudioState> {
    return Promise.reject(new NodeFailureError('not_supported', NEEDS_SERVER));
  }

  watch(onChange: (state: AudioState) => void): StopWatching {
    this.listeners.add(onChange);
    this.poll();
    return (): void => {
      this.listeners.delete(onChange);
      if (this.listeners.size === 0) {
        this.cancelPoll?.();
        this.cancelPoll = null;
        this.last = '';
      }
    };
  }

  private poll(): void {
    this.cancelPoll?.();
    this.cancelPoll = this.schedule(() => {
      this.cancelPoll = null;
      this.refresh().catch(this.failed);
    }, POLL_MS);
  }

  private async refresh(): Promise<void> {
    if (this.listeners.size === 0) {
      return;
    }
    const state = await this.read();
    const serial = JSON.stringify(state);
    if (serial !== this.last) {
      this.last = serial;
      this.listeners.forEach((listener) => {
        listener(state);
      });
    }
    this.poll();
  }
}
