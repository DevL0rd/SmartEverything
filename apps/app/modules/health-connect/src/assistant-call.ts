import { withNativeEnrollment } from './hub-network';
import { NativeModule, requireOptionalNativeModule } from 'expo';
import { ECHO_TEST_OUTCOMES } from '@smarteverything/domain';
import { z } from 'zod';
import { AppUpdateNeededError } from './health-connect';

const MESSAGE = z.strictObject({ json: z.string() });
const CLOSED = z.strictObject({ code: z.number(), reason: z.string() });
const LINK = z.strictObject({ state: z.enum(['reconnecting', 'live']) });
const DEVICES_CHANGED = z.strictObject({ json: z.string() });

export const CALL_CONTROLS = [
  'screen_ended',
  'screen_failed',
  'route_failed',
  'speech_started',
  'speech_ended',
] as const;

export type CallControl = (typeof CALL_CONTROLS)[number];

const CONTROL = z.strictObject({ action: z.enum(CALL_CONTROLS) });

export const AUDIO_DEVICE = z.strictObject({
  id: z.string().min(1),
  direction: z.enum(['input', 'output']),
  kind: z.enum([
    'builtin',
    'speaker',
    'earpiece',
    'wired',
    'usb',
    'bluetooth',
    'hearing_aid',
    'other',
  ]),
  name: z.string(),
});

export type AudioDevice = z.infer<typeof AUDIO_DEVICE>;

const AUDIO_DEVICES = z.array(AUDIO_DEVICE);

export const ECHO_REPORT = z.strictObject({
  outcome: z.enum(ECHO_TEST_OUTCOMES),
  detail: z.string().optional(),
  noiseFloorDb: z.number().optional(),
  playedDb: z.number().optional(),
  gateOpenedWhilePlaying: z.boolean().optional(),
  gateOpenedWhileQuiet: z.boolean().optional(),
  frames: z.number().optional(),
  mode: z.number().optional(),
});

export type EchoReport = z.infer<typeof ECHO_REPORT>;

export interface NativeAudioSettings {
  readonly echoTailMs: number;
  readonly sustainMs: number;
  readonly bargeInLevel: number;
  readonly ignoreAssistantAudible: boolean;
  readonly aggressiveWhileAudible: boolean;
  readonly interruptible: boolean;
  readonly speechThreshold: number;
  readonly minSpeechMs: number;
  readonly pauseMs: number;
  readonly noiseSuppression: boolean;
  readonly autoGain: boolean;
  readonly input: string;
  readonly output: string;
  readonly volume: number;
}

export interface NativeFrameSampling {
  readonly sourceCode: number;
  readonly longEdge: number;
  readonly quality: number;
  readonly minIntervalMs: number;
  readonly maxBytes: number;
  readonly live: boolean;
}

interface AssistantCallEvents {
  readonly onAssistantMessage: (payload: unknown) => void;
  readonly onAssistantClosed: (payload: unknown) => void;
  readonly onAssistantLink: (payload: unknown) => void;
  readonly onAssistantControl: (payload: unknown) => void;
  readonly onAssistantDevices: (payload: unknown) => void;
  readonly [event: string]: (payload: unknown) => void;
}

declare class AssistantCallNative extends NativeModule<AssistantCallEvents> {
  openAssistantCall(serverUrl: string, token: string, enrollment: string): Promise<void>;
  beginAssistantCall(
    callId: string,
    source: string,
    device: string,
    chatId: string | null,
  ): Promise<void>;
  answerAssistantCall(
    callId: string,
    source: string,
    device: string,
    chatId: string | null,
    answering: string,
  ): Promise<void>;
  muteAssistantCall(callId: string, muted: boolean): Promise<void>;
  endAssistantCall(callId: string | null): Promise<void>;
  applyAssistantCallAudio(settings: NativeAudioSettings): Promise<void>;
  sendAssistantCallMessage(json: string): Promise<boolean>;
  sendAssistantCallFrame(
    uri: string,
    sampling: NativeFrameSampling,
    still: boolean,
  ): Promise<boolean>;
  setAssistantCallCamera(on: boolean): Promise<void>;
  startAssistantScreenShare(sampling: NativeFrameSampling): Promise<boolean>;
  setAssistantScreenLive(live: boolean): Promise<void>;
  captureAssistantScreenStill(): Promise<boolean>;
  stopAssistantScreenShare(): Promise<void>;
  runAssistantEchoTest(): Promise<string>;
  assistantAudioDevices(): string;
  assistantCallLevel(): number;
  assistantCallOutputLevel(): number;
  attachAssistantCall(): string | null;
  ringIncomingCall(payload: string): Promise<void>;
  dismissIncomingCall(outreachId: string): Promise<void>;
}

type AssistantCallName =
  | 'openAssistantCall'
  | 'beginAssistantCall'
  | 'answerAssistantCall'
  | 'muteAssistantCall'
  | 'endAssistantCall'
  | 'applyAssistantCallAudio'
  | 'sendAssistantCallMessage'
  | 'sendAssistantCallFrame'
  | 'setAssistantCallCamera'
  | 'startAssistantScreenShare'
  | 'setAssistantScreenLive'
  | 'captureAssistantScreenStill'
  | 'stopAssistantScreenShare'
  | 'runAssistantEchoTest'
  | 'assistantAudioDevices'
  | 'assistantCallLevel'
  | 'assistantCallOutputLevel'
  | 'attachAssistantCall'
  | 'ringIncomingCall'
  | 'dismissIncomingCall'
  | 'addListener';

const native = requireOptionalNativeModule<AssistantCallNative>('AssistantCall');

function callFor(operation: AssistantCallName): AssistantCallNative {
  if (native === null || typeof Reflect.get(native, operation) !== 'function') {
    throw new AppUpdateNeededError(`assistant calls (${operation})`);
  }
  return native;
}

export function assistantCallLinked(): boolean {
  return native !== null;
}

export function assistantCallCan(operation: AssistantCallName): boolean {
  return native !== null && typeof Reflect.get(native, operation) === 'function';
}

export async function openAssistantCall(serverUrl: string, token: string): Promise<void> {
  const source = callFor('openAssistantCall');
  await withNativeEnrollment(serverUrl, token, (enrollment) =>
    source.openAssistantCall(serverUrl, token, enrollment),
  );
}

export async function beginAssistantCall(
  callId: string,
  source: string,
  device: string,
  chatId: string | null,
): Promise<void> {
  await callFor('beginAssistantCall').beginAssistantCall(callId, source, device, chatId);
}

export interface AnsweredCall {
  readonly callId: string;
  readonly source: string;
  readonly device: string;
  readonly chatId: string | null;
  readonly answering: string;
}

export async function answerAssistantCall(call: AnsweredCall): Promise<void> {
  await callFor('answerAssistantCall').answerAssistantCall(
    call.callId,
    call.source,
    call.device,
    call.chatId,
    call.answering,
  );
}

export async function muteAssistantCall(callId: string, muted: boolean): Promise<void> {
  await callFor('muteAssistantCall').muteAssistantCall(callId, muted);
}

export async function endAssistantCall(callId: string | null): Promise<void> {
  await callFor('endAssistantCall').endAssistantCall(callId);
}

export interface IncomingCallRing {
  readonly caller: string;
  readonly outreachId: string;
  readonly chatId: string;
  readonly reason: string;
  readonly expiresAt: string;
}

export async function ringIncomingCall(call: IncomingCallRing): Promise<void> {
  await callFor('ringIncomingCall').ringIncomingCall(JSON.stringify(call));
}

export async function dismissIncomingCall(outreachId: string): Promise<void> {
  await callFor('dismissIncomingCall').dismissIncomingCall(outreachId);
}

export function assistantCallLevel(): number {
  return callFor('assistantCallLevel').assistantCallLevel();
}

export function assistantCallOutputLevel(): number {
  return callFor('assistantCallOutputLevel').assistantCallOutputLevel();
}

const RUNNING_CALL = z.strictObject({
  callId: z.uuid(),
  startedAt: z.number(),
  muted: z.boolean(),
  replay: z.array(z.string()),
});

export type RunningCall = z.infer<typeof RUNNING_CALL>;

export function attachAssistantCall(): RunningCall | null {
  const json = callFor('attachAssistantCall').attachAssistantCall();
  return json === null ? null : RUNNING_CALL.parse(JSON.parse(json));
}

export async function applyAssistantCallAudio(settings: NativeAudioSettings): Promise<void> {
  await callFor('applyAssistantCallAudio').applyAssistantCallAudio(settings);
}

export async function sendAssistantCallMessage(json: string): Promise<boolean> {
  return callFor('sendAssistantCallMessage').sendAssistantCallMessage(json);
}

export async function sendAssistantCallFrame(
  uri: string,
  sampling: NativeFrameSampling,
  still: boolean,
): Promise<boolean> {
  return callFor('sendAssistantCallFrame').sendAssistantCallFrame(uri, sampling, still);
}

export async function setAssistantCallCamera(on: boolean): Promise<void> {
  await callFor('setAssistantCallCamera').setAssistantCallCamera(on);
}

export async function startAssistantScreenShare(sampling: NativeFrameSampling): Promise<boolean> {
  return callFor('startAssistantScreenShare').startAssistantScreenShare(sampling);
}

export async function setAssistantScreenLive(live: boolean): Promise<void> {
  await callFor('setAssistantScreenLive').setAssistantScreenLive(live);
}

export async function captureAssistantScreenStill(): Promise<boolean> {
  return callFor('captureAssistantScreenStill').captureAssistantScreenStill();
}

export async function stopAssistantScreenShare(): Promise<void> {
  await callFor('stopAssistantScreenShare').stopAssistantScreenShare();
}

export async function runAssistantEchoTest(): Promise<EchoReport> {
  const json = await callFor('runAssistantEchoTest').runAssistantEchoTest();
  return ECHO_REPORT.parse(JSON.parse(json));
}

export function assistantAudioDevices(): readonly AudioDevice[] {
  return AUDIO_DEVICES.parse(JSON.parse(callFor('assistantAudioDevices').assistantAudioDevices()));
}

export interface AssistantCallListeners {
  readonly message: (json: string) => void;
  readonly closed: (code: number, reason: string) => void;
  readonly link: (state: 'reconnecting' | 'live') => void;
  readonly control: (action: CallControl) => void;
}

export function addAssistantCallListeners(listeners: AssistantCallListeners): {
  readonly remove: () => void;
} {
  const module = callFor('addListener');
  const message = module.addListener('onAssistantMessage', (payload) => {
    listeners.message(MESSAGE.parse(payload).json);
  });
  const closed = module.addListener('onAssistantClosed', (payload) => {
    const parsed = CLOSED.parse(payload);
    listeners.closed(parsed.code, parsed.reason);
  });
  const link = module.addListener('onAssistantLink', (payload) => {
    listeners.link(LINK.parse(payload).state);
  });
  const control = module.addListener('onAssistantControl', (payload) => {
    listeners.control(CONTROL.parse(payload).action);
  });
  return {
    remove: (): void => {
      message.remove();
      closed.remove();
      link.remove();
      control.remove();
    },
  };
}

export function addAssistantDeviceListener(listener: (devices: readonly AudioDevice[]) => void): {
  readonly remove: () => void;
} {
  const subscription = callFor('addListener').addListener('onAssistantDevices', (payload) => {
    listener(AUDIO_DEVICES.parse(JSON.parse(DEVICES_CHANGED.parse(payload).json)));
  });
  return {
    remove: (): void => {
      subscription.remove();
    },
  };
}
