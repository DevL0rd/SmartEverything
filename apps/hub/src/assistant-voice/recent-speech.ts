import {
  assistantLabel,
  isPrivate,
  privacySwitchOf,
  type DeviceRow,
  type TranscriptLine,
  type TranscriptSource,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { personOfDevice } from '../listening/listening-rows';
import { DeviceListeningSwitches } from '../listening/listening-switches';
import type { Store } from '../store/store';
import { newest } from './live-window';

const MS_PER_MINUTE = 60_000;
const WAKE_TAIL_MS = 15_000;
const BLOCK_CHARACTERS = 4000;

export interface RecentSpeechOptions {
  readonly store: Pick<
    Store,
    | 'assistantChat'
    | 'cameras'
    | 'computerNodes'
    | 'devices'
    | 'settingsKv'
    | 'state'
    | 'transcripts'
  >;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface RecentSpeechRequest {
  readonly callId: string;
  readonly deviceId: string;
  readonly role: 'owner' | 'member';
  readonly profileId: string;
}

interface RecentSpeechBlock {
  readonly text: string;
  readonly lines: number;
}

interface BlockInput {
  readonly lines: readonly TranscriptLine[];
  readonly deviceName: string;
  readonly minutes: number;
  readonly now: Date;
  readonly names: readonly string[];
}

function agoOf(ms: number): string {
  const minutes = Math.floor(ms / MS_PER_MINUTE);
  return minutes < 1 ? 'just now' : `${String(minutes)} min ago`;
}

function isWakeUtterance(line: TranscriptLine, input: BlockInput): boolean {
  const ended = Date.parse(line.ended_at ?? line.at);
  if (input.now.getTime() - ended > WAKE_TAIL_MS) {
    return false;
  }
  const text = line.text.toLowerCase();
  return input.names.some((name) => text.includes(name.toLowerCase()));
}

function lineText(line: TranscriptLine, input: BlockInput): string {
  const said = line.speaker === input.deviceName ? '' : `${line.speaker}: `;
  return `[${agoOf(input.now.getTime() - Date.parse(line.at))}] ${said}${line.text}`;
}

function recentSpeechBlock(input: BlockInput): RecentSpeechBlock | null {
  const heard = input.lines
    .filter((line) => !isWakeUtterance(line, input))
    .toReversed()
    .map((line) => lineText(line, input));
  const kept = newest(heard, BLOCK_CHARACTERS);
  if (kept.length === 0) {
    return null;
  }
  const header = `Recent speech heard on ${input.deviceName} (last ${String(input.minutes)} minutes), speech-to-text from before this call, oldest first. It is context, not something said to you; read_transcripts has more.`;
  return { text: `${header}\n${kept.join('\n')}`, lines: kept.length };
}

interface Heard {
  readonly source: TranscriptSource;
  readonly deviceName: string;
}

function transcribedAs(
  store: RecentSpeechOptions['store'],
  device: DeviceRow,
): TranscriptSource | null {
  if (device.kind === 'camera') {
    return store.cameras.find(device.id)?.transcribe === true ? 'camera' : null;
  }
  const written = new DeviceListeningSwitches(store).read(device.id).transcribe;
  return written && (device.kind === 'phone' || device.kind === 'computer') ? device.kind : null;
}

function heardOf(store: RecentSpeechOptions['store'], request: RecentSpeechRequest): Heard | null {
  const device = store.devices.find(request.deviceId);
  const source = device === undefined ? null : transcribedAs(store, device);
  if (device === undefined || source === null) {
    return null;
  }
  const own = source !== 'camera' && personOfDevice(store, device) === request.profileId;
  if (request.role !== 'owner' && !own) {
    return null;
  }
  const privacy = privacySwitchOf(device);
  if (privacy !== null && isPrivate(privacy, store.state.value(device.id, privacy.key))) {
    return null;
  }
  return { source, deviceName: device.display_name ?? device.name };
}

export function recentSpeechOf(
  options: RecentSpeechOptions,
  request: RecentSpeechRequest,
): string | null {
  const { store, now, log } = options;
  const settings = store.assistantChat.settings();
  const minutes = settings.voice.speech_context_minutes;
  const heard = minutes === 0 ? null : heardOf(store, request);
  if (heard === null) {
    return null;
  }
  const at = now();
  const since = new Date(at.getTime() - minutes * MS_PER_MINUTE).toISOString();
  const block = recentSpeechBlock({
    lines: store.transcripts.heardOn(heard.source, request.deviceId, since),
    deviceName: heard.deviceName,
    minutes,
    now: at,
    names: [assistantLabel(settings), ...settings.aliases],
  });
  log.info('voice.recent_speech', {
    callId: request.callId,
    deviceId: request.deviceId,
    source: heard.source,
    minutes,
    lines: block?.lines ?? 0,
    characters: block?.text.length ?? 0,
  });
  return block?.text ?? null;
}
