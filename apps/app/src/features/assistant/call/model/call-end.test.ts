import { describe, expect, it } from 'vitest';
import { VOICE_KEY_MISSING, type CallEnding } from '@smarteverything/domain';
import { IDLE_CALL, type CallView } from '../call-state';
import { endStateOf } from './call-end';

const START = 1_700_000_000_000;
const CHAT = '00000000-0000-4000-8000-000000000001';

function endedCall(ending: CallEnding | null, extra: Partial<CallView> = {}): CallView {
  return {
    ...IDLE_CALL,
    phase: 'ended',
    ending,
    chatId: CHAT,
    startedAt: START,
    endedAt: START + 4 * 60_000,
    ...extra,
  };
}

function labels(call: CallView): readonly string[] {
  const end = endStateOf(call, 'Coordinator');
  return [end.primary, ...end.secondary].map((action) => action.label);
}

describe('call ended', () => {
  it('says how long it lasted and that the transcript is in the chat, with Back to chat first', () => {
    const end = endStateOf(endedCall('hung_up'), 'Coordinator');
    expect(end.kind).toBe('ended');
    expect(end.title).toBe('Call ended');
    expect(end.footnote).toBe('4 min · Transcript saved in the chat');
    expect(end.primary).toEqual({ id: 'leave', label: 'Back to chat' });
    expect(end.secondary.map((action) => action.id)).toEqual(['again']);
  });

  it('offers Close instead of Back to chat when the call has no chat', () => {
    const end = endStateOf(endedCall('finished', { chatId: null }), 'Coordinator');
    expect(end.primary).toEqual({ id: 'leave', label: 'Close' });
    expect(end.footnote).toBe('4 min');
  });

  it('mentions that screen sharing stopped and names the assistant when nothing else is known', () => {
    const shared = endStateOf(endedCall('hung_up', { sharedAtEnd: true }), 'Coordinator');
    expect(shared.footnote).toBe('4 min · Screen sharing stopped · Transcript saved in the chat');
    const bare = endStateOf(
      endedCall('hung_up', { chatId: null, startedAt: null, endedAt: null }),
      'Coordinator',
    );
    expect(bare.footnote).toBe('Coordinator');
  });

  it('titles quiet and replaced endings', () => {
    expect(endStateOf(endedCall('idle'), 'Coordinator').title).toBe('Ended after a quiet minute');
    const replaced = endStateOf(endedCall('replaced'), 'Coordinator');
    expect(replaced.title).toBe('Moved to another call');
    expect(replaced.footnote).toBe('4 min');
  });
});

describe('call failed', () => {
  it('says what went wrong and offers Call again then Close', () => {
    const end = endStateOf(endedCall('failed', { problem: 'The line dropped' }), 'Coordinator');
    expect(end.kind).toBe('failed');
    expect(end.title).toBe('Call didn’t work');
    expect(end.footnote).toBe('The line dropped');
    expect(labels(endedCall('failed', { problem: 'x' }))).toEqual(['Call again', 'Close']);
  });

  it('points to Settings when the Gemini key is missing', () => {
    const call = endedCall('failed', { problem: VOICE_KEY_MISSING });
    const end = endStateOf(call, 'Coordinator');
    expect(end.kind).toBe('key');
    expect(end.footnote).toBe(VOICE_KEY_MISSING);
    expect(end.primary.id).toBe('settings');
    expect(labels(call)).toEqual(['Open settings', 'Close', 'Call again']);
  });

  it('asks for the microphone before anything else when it is blocked', () => {
    const call = endedCall('failed', { problem: 'Microphone not available', fix: 'microphone' });
    const end = endStateOf(call, 'Coordinator');
    expect(end.kind).toBe('microphone');
    expect(end.title).toBe('Microphone blocked');
    expect(end.footnote).toBe('Allow the microphone for SmartEverything to talk with Coordinator.');
    expect(labels(call)).toEqual(['Allow microphone', 'Close', 'Call again']);
  });
});

describe('call unreachable', () => {
  it('names the lost connection and offers Try again then Close', () => {
    const call = endedCall('disconnected', { problem: 'Home hub unreachable' });
    const end = endStateOf(call, 'Coordinator');
    expect(end.kind).toBe('unreachable');
    expect(end.title).toBe('Connection lost');
    expect(end.footnote).toBe('Home hub unreachable');
    expect(labels(call)).toEqual(['Try again', 'Close']);
  });

  it('still says something when the reason is unknown', () => {
    expect(endStateOf(endedCall('disconnected'), 'Coordinator').footnote).toBe(
      'Your home connection dropped.',
    );
    expect(endStateOf(endedCall('failed'), 'Coordinator').footnote).toBe(
      'The call stopped unexpectedly. Try again.',
    );
  });
});
