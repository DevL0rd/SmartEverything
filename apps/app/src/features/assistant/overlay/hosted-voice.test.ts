import { describe, expect, it, vi } from 'vitest';
import type { VoiceActivityNotice } from '@smarteverything/domain';

const call = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock('../../../api/transport', () => ({ api: (): { call: typeof call } => ({ call }) }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn().mockResolvedValue(undefined) },
}));

const {
  endHostedCall,
  hostedActive,
  muteHostedCall,
  hostedVoice,
  onHostedLevels,
  receiveVoiceActivity,
  receiveVoiceCaption,
  receiveVoiceLevels,
  setOwnComputer,
} = await import('./hosted-voice');

function notice(patch: Partial<VoiceActivityNotice> = {}): VoiceActivityNotice {
  return {
    type: 'voice_activity',
    device: { kind: 'computer', id: 'mine' },
    call_id: 'call-1',
    phase: 'listening',
    muted: false,
    superseded_by: null,
    at: 100,
    ...patch,
  };
}

describe('hosted voice activity', () => {
  it('follows only the calls on this computer', () => {
    hostedVoice.set(null);
    setOwnComputer('mine');
    receiveVoiceActivity(notice({ device: { kind: 'computer', id: 'other' } }));
    receiveVoiceActivity(notice({ device: { kind: 'phone', id: 'mine' } }));
    expect(hostedVoice.get()).toBeNull();
    receiveVoiceActivity(notice());
    expect(hostedVoice.get()).toEqual({
      callId: 'call-1',
      phase: 'listening',
      muted: false,
      heard: '',
      said: '',
      tool: null,
      startedAt: 100,
      endedAt: null,
    });
  });

  it('keeps when the call began while its phase changes and records the end', () => {
    hostedVoice.set(null);
    setOwnComputer('mine');
    receiveVoiceActivity(notice({ at: 100 }));
    receiveVoiceActivity(notice({ phase: 'speaking', at: 200 }));
    expect(hostedVoice.get()).toMatchObject({ phase: 'speaking', startedAt: 100 });
    receiveVoiceActivity(notice({ phase: 'ended', at: 300 }));
    expect(hostedVoice.get()).toMatchObject({ phase: 'ended', startedAt: 100, endedAt: 300 });
    expect(hostedActive(hostedVoice.get())).toBe(false);
  });

  it('starts over for a new call and does not repeat an unchanged phase', () => {
    hostedVoice.set(null);
    setOwnComputer('mine');
    const changes = vi.fn();
    const stop = hostedVoice.subscribe(changes);
    receiveVoiceActivity(notice());
    receiveVoiceActivity(notice({ at: 150 }));
    expect(changes).toHaveBeenCalledTimes(1);
    receiveVoiceActivity(notice({ call_id: 'call-2', at: 400 }));
    expect(hostedVoice.get()).toMatchObject({ callId: 'call-2', startedAt: 400 });
    stop();
  });

  it('ignores everything until this computer is known', () => {
    hostedVoice.set(null);
    setOwnComputer(null);
    receiveVoiceActivity(notice());
    expect(hostedVoice.get()).toBeNull();
  });
});

describe('hosted voice levels', () => {
  it('turns the hub bytes into levels for the call this computer hosts', () => {
    hostedVoice.set(null);
    setOwnComputer('mine');
    receiveVoiceActivity(notice());
    const heard: { in: number; out: number }[] = [];
    const stop = onHostedLevels((levels) => {
      heard.push(levels);
    });
    receiveVoiceLevels({ type: 'voice_levels', call_id: 'call-1', in: 255, out: 0 });
    receiveVoiceLevels({ type: 'voice_levels', call_id: 'other', in: 255, out: 255 });
    expect(heard).toEqual([{ in: 1, out: 0 }]);
    stop();
    receiveVoiceLevels({ type: 'voice_levels', call_id: 'call-1', in: 10, out: 10 });
    expect(heard).toHaveLength(1);
  });
});

describe('hosted voice captions', () => {
  it('keeps what was heard, said and run across phase and mute changes of the same call', () => {
    hostedVoice.set(null);
    setOwnComputer('mine');
    receiveVoiceActivity(notice());
    receiveVoiceCaption({ type: 'voice_caption', call_id: 'call-1', who: 'person', text: 'Hi' });
    receiveVoiceCaption({
      type: 'voice_caption',
      call_id: 'call-1',
      who: 'assistant',
      text: 'Hey',
    });
    receiveVoiceCaption({ type: 'voice_caption', call_id: 'call-1', who: 'tool', text: 'Lamp on' });
    receiveVoiceCaption({ type: 'voice_caption', call_id: 'other', who: 'person', text: 'No' });
    receiveVoiceActivity(notice({ phase: 'speaking', muted: true, at: 200 }));
    expect(hostedVoice.get()).toMatchObject({
      phase: 'speaking',
      muted: true,
      heard: 'Hi',
      said: 'Hey',
      tool: 'Lamp on',
    });
    receiveVoiceActivity(notice({ call_id: 'call-2', at: 300 }));
    expect(hostedVoice.get()).toMatchObject({ heard: '', said: '', tool: null });
  });
});

describe('hosted call controls', () => {
  it('asks the hub to mute and to end the call by its id', () => {
    muteHostedCall('call-1', true);
    endHostedCall('call-1');
    expect(call).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: '/api/reach/outreach/:outreachId/mute' }),
      { params: { outreachId: 'call-1' }, body: { muted: true } },
    );
    expect(call).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: '/api/reach/outreach/:outreachId/end' }),
      { params: { outreachId: 'call-1' } },
    );
  });
});
