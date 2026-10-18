import { TALK_AUDIO_FRAME, type ListeningHubMessage } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { VoiceActivityNotice, VoiceCaptionNotice } from '@smarteverything/domain';
import { opusCodec } from '../../src/assistant-voice/audio';
import type { HostedCall, HostedCallRequest } from '../../src/assistant-voice/outreach';
import { ComputerCallAudio, type EarSend } from '../../src/computers/computer-call-audio';
import { VoiceActivity, type VoiceCallTap } from '../../src/listening/voice-activity';
import { computerConversation } from '../../src/reach/computer-conversation';
import type { HostVoice } from '../../src/reach/hosted-call';
import { ReachRefusedError } from '../../src/reach/reach-errors';
import { FakeClock } from '../support/fake-clock';
import { idleHostedCall } from '../support/hosted-call';
import { testLogger } from '../support/logs';

const START = '2026-10-18T10:00:00.000Z';
const SILENT_TAP: VoiceCallTap = {
  phase: (): void => undefined,
  muted: (): void => undefined,
  caption: (): void => undefined,
  heard: (): void => undefined,
  spoke: (): void => undefined,
  end: (): void => undefined,
};
const KITCHEN = '5b1e2f57-0d5e-4a43-9a3f-0b1d3c3c1f01';

interface Rig {
  readonly audio: ComputerCallAudio;
  readonly sent: ListeningHubMessage[];
  readonly requests: HostedCallRequest[];
  readonly heard: Int16Array[];
  readonly ended: string[];
  readonly clock: FakeClock;
  readonly host: HostVoice;
}

function rig(connected = true): Rig {
  const sent: ListeningHubMessage[] = [];
  const requests: HostedCallRequest[] = [];
  const heard: Int16Array[] = [];
  const ended: string[] = [];
  const audio = new ComputerCallAudio({
    sendOf: (id): EarSend | null =>
      connected && id === KITCHEN
        ? (message): void => {
            sent.push(message);
          }
        : null,
    changed: (): void => undefined,
  });
  const host: HostVoice = (request) => {
    requests.push(request);
    const call: HostedCall = {
      ...idleHostedCall(),
      hear: (pcm): void => {
        heard.push(pcm);
      },
      end: (reason): Promise<void> => {
        ended.push(reason);
        return Promise.resolve();
      },
    };
    return Promise.resolve(call);
  };
  return { audio, sent, requests, heard, ended, clock: new FakeClock(START), host };
}

function conversation(
  test: Rig,
  heard?: () => Int16Array,
  tap: VoiceCallTap = SILENT_TAP,
): ReturnType<typeof computerConversation> {
  return computerConversation(
    {
      host: test.host,
      clock: test.clock,
      log: testLogger('computer'),
      computer: { audio: test.audio, activity: { begin: () => tap } },
    },
    {
      computerId: KITCHEN,
      computerName: 'Kitchen PC',
      caller: { profileId: 'owner', role: 'owner', label: 'Kitchen PC' },
      opening: { chatId: 'chat', text: 'hello', outreachId: 'outreach' },
      muteMic: false,
      tap,
      ...(heard === undefined ? {} : { heard }),
    },
  );
}

describe('computer conversation', () => {
  it('hosts the call on the computer, listening through its microphone', async () => {
    const test = rig();
    await conversation(test);
    expect(test.requests[0]).toMatchObject({
      callId: 'outreach',
      deviceId: KITCHEN,
      listening: { echoFree: false },
    });
    expect(test.sent).toEqual([{ kind: 'call', active: true }]);
    const pcm = Int16Array.from({ length: 320 }, () => 500);
    test.audio.heard(KITCHEN, pcm);
    expect(test.heard).toEqual([pcm]);
  });

  it('plays what the AI says through the computer speaker', async () => {
    const test = rig();
    await conversation(test);
    const codec = opusCodec();
    const packet = codec.encode(
      Int16Array.from({ length: 960 }, (_, i) => (i % 2 === 0 ? 2000 : -2000)),
    );
    const frame = Uint8Array.of(TALK_AUDIO_FRAME, ...packet);
    test.requests[0]?.endpoint.audio(frame);
    test.clock.advanceTo('2026-10-18T10:00:00.100Z');
    expect(test.sent.some((message) => message.kind === 'speak')).toBe(true);
    codec.free();
  });

  it('hands the words said with the wake word to the call', async () => {
    const test = rig();
    const words = Int16Array.from({ length: 1600 }, () => 800);
    await conversation(test, () => words);
    expect(test.requests[0]?.heard?.()).toEqual(words);
  });

  it('leaves the call mode when the AI ends the conversation', async () => {
    const test = rig();
    await conversation(test);
    test.requests[0]?.endpoint.send({
      type: 'ended',
      callId: 'outreach',
      reason: 'hung_up',
      detail: null,
    });
    test.clock.advanceTo('2026-10-18T10:00:10.000Z');
    expect(test.sent.at(-1)).toEqual({ kind: 'call', active: false });
  });

  it('forwards the call phase, the words and a mute to whoever watches the call', async () => {
    const test = rig();
    const announced: VoiceActivityNotice[] = [];
    const watched: (VoiceCaptionNotice | { readonly type: string })[] = [];
    const activity = new VoiceActivity({
      announce: (notice): void => {
        announced.push(notice);
      },
      decode: (): Int16Array => new Int16Array(0),
      now: (): number => 1,
    });
    const tap = activity.begin({
      callId: 'outreach',
      device: { kind: 'computer', id: KITCHEN },
      profileId: null,
    });
    activity.watch(
      {
        key: 'overlay',
        owner: true,
        profileId: 'owner',
        send: (notice): void => {
          watched.push(notice);
        },
      },
      'outreach',
    );
    const call = await conversation(test, undefined, tap);
    const send = test.requests[0]?.endpoint.send;
    send?.({ type: 'call_state', callId: 'outreach', state: 'listening' });
    send?.({ type: 'caption', callId: 'outreach', who: 'person', text: 'Hello there' });
    send?.({ type: 'caption', callId: 'outreach', who: 'assistant', text: 'Hi' });
    call.mute(true);
    expect(announced.map((notice) => [notice.phase, notice.muted])).toEqual([
      ['listening', false],
      ['listening', true],
    ]);
    expect(watched).toEqual([
      { type: 'voice_caption', call_id: 'outreach', who: 'person', text: 'Hello there' },
      { type: 'voice_caption', call_id: 'outreach', who: 'assistant', text: 'Hi' },
    ]);
  });

  it('refuses when the computer is not connected', async () => {
    const test = rig(false);
    await expect(conversation(test)).rejects.toBeInstanceOf(ReachRefusedError);
    expect(test.requests).toHaveLength(0);
  });

  it('ends the call as failed when the computer drops mid-conversation', async () => {
    const test = rig();
    await conversation(test);
    test.audio.lost(KITCHEN, 'the computer went offline');
    expect(test.ended).toEqual(['failed']);
  });
});
