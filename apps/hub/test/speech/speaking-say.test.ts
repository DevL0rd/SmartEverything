import { describe, expect, it } from 'vitest';
import type { SpeakingCall, SpeakingMedia } from '../../src/reach/room-media';
import type { Saying, SpeechRequest, SpeechSink } from '../../src/speech/one-shot-speech';
import { sayWhileSpeaking } from '../../src/speech/speaking-say';

interface Rig {
  readonly seen: string[];
  readonly media: SpeakingMedia;
  readonly request: SpeechRequest;
}

function rig(): Rig {
  const seen: string[] = [];
  const media: SpeakingMedia = {
    speaking: (call: SpeakingCall, speaking: boolean): void => {
      seen.push(`${call.id}:${String(call.deviceId)}:${String(call.clientId)}:${String(speaking)}`);
    },
  };
  const sink: SpeechSink = {
    audio: () => undefined,
    said: () => undefined,
    ended: () => undefined,
  };
  const request: SpeechRequest = {
    id: 'say-1',
    profileId: 'p',
    clientId: 'asker',
    text: 'Dinner',
    at: { deviceId: 'camera', clientId: null },
    sink,
  };
  return { seen, media, request };
}

const quiet: Saying = { end: () => Promise.resolve() };

describe('one-shot speech and the room media', () => {
  it('pauses on the first audio, in the target room, and resumes when the speech is ended', async () => {
    const { seen, media, request } = rig();
    const given: SpeechRequest[] = [];
    const result = await sayWhileSpeaking(
      media,
      (spoken) => {
        given.push(spoken);
        return Promise.resolve(quiet);
      },
      request,
    );
    expect(seen).toStrictEqual([]);
    given[0]?.sink.audio(new Uint8Array(1));
    given[0]?.sink.audio(new Uint8Array(1));
    expect(seen).toStrictEqual(['say-1:camera:null:true']);
    await result.end('finished');
    expect(seen).toStrictEqual(['say-1:camera:null:true', 'say-1:camera:null:false']);
  });

  it('resumes when the speech fails', async () => {
    const { seen, media, request } = rig();
    const given: SpeechRequest[] = [];
    await sayWhileSpeaking(
      media,
      (spoken) => {
        given.push(spoken);
        return Promise.resolve(quiet);
      },
      request,
    );
    given[0]?.sink.audio(new Uint8Array(1));
    given[0]?.sink.ended('failed', 'provider down');
    expect(seen.at(-1)).toBe('say-1:camera:null:false');
  });

  it('resumes when ending the speech throws, and ignores audio that arrives afterwards', async () => {
    const { seen, media, request } = rig();
    const given: SpeechRequest[] = [];
    const result = await sayWhileSpeaking(
      media,
      (spoken) => {
        given.push(spoken);
        return Promise.resolve({ end: () => Promise.reject(new Error('cannot end')) });
      },
      request,
    );
    given[0]?.sink.audio(new Uint8Array(1));
    await expect(result.end('failed')).rejects.toThrow('cannot end');
    given[0]?.sink.audio(new Uint8Array(1));
    expect(seen).toStrictEqual(['say-1:camera:null:true', 'say-1:camera:null:false']);
  });

  it('never pauses when the speech never produced audio', async () => {
    const { seen, media, request } = rig();
    const result = await sayWhileSpeaking(media, () => Promise.resolve(quiet), request);
    await result.end('finished');
    expect(seen).toStrictEqual([]);
  });

  it('speaks normally when no media service exists', async () => {
    const { request } = rig();
    const result = await sayWhileSpeaking(undefined, () => Promise.resolve(quiet), request);
    await expect(result.end('finished')).resolves.toBeUndefined();
  });
});
