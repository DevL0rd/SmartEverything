import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_SIGHT_FRAME,
  SIGHT_FRAME_HEADER_BYTES,
  TALK_AUDIO_FRAME,
  TALK_CLIENT_MESSAGE,
  TALK_PROTOCOL,
  TALK_SERVER_MESSAGE,
  TalkFrameError,
  audioFrameOf,
  frameKindOf,
  packetOfFrame,
  sightFrameOf,
  sightOfFrame,
  talkProtocols,
} from '../src/talk-protocol';
import { SIGHT_FRAME_LIMITS, SIGHT_SOURCES } from '../src/call-sight';
import { TALK_FRAME_BYTES_MAX } from '../src/talk';

const ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = `set_${'a'.repeat(64)}`;

describe('talk audio frames', () => {
  it('wraps an opus packet behind the audio marker and unwraps it unchanged', () => {
    const packet = Uint8Array.from([5, 6, 7]);
    const frame = audioFrameOf(packet);
    expect([...frame]).toEqual([TALK_AUDIO_FRAME, 5, 6, 7]);
    expect([...packetOfFrame(frame)]).toEqual([5, 6, 7]);
  });

  it('accepts the largest packet and refuses an empty or oversized one', () => {
    expect(audioFrameOf(new Uint8Array(TALK_FRAME_BYTES_MAX)).byteLength).toBe(
      TALK_FRAME_BYTES_MAX + 1,
    );
    expect(() => audioFrameOf(new Uint8Array(0))).toThrow(TalkFrameError);
    expect(() => audioFrameOf(new Uint8Array(TALK_FRAME_BYTES_MAX + 1))).toThrow(
      /1 to 1276 bytes/u,
    );
  });

  it('refuses to unwrap a frame with another marker or a bad size', () => {
    expect(() => packetOfFrame(Uint8Array.from([9, 1]))).toThrow(/starts with 1/u);
    expect(() => packetOfFrame(Uint8Array.from([TALK_AUDIO_FRAME]))).toThrow(/not allowed/u);
    expect(() => packetOfFrame(new Uint8Array(TALK_FRAME_BYTES_MAX + 2).fill(1, 0, 1))).toThrow(
      /not allowed/u,
    );
  });

  it('names its errors so a caller can tell them from other failures', () => {
    try {
      audioFrameOf(new Uint8Array(0));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TalkFrameError);
      expect(error).toMatchObject({ name: 'TalkFrameError' });
    }
  });
});

describe('call frame kinds', () => {
  it('tells audio from a picture by the first byte', () => {
    expect(frameKindOf(Uint8Array.from([TALK_AUDIO_FRAME, 0]))).toBe('audio');
    expect(frameKindOf(Uint8Array.from([ASSISTANT_SIGHT_FRAME, 0]))).toBe('sight');
  });

  it('refuses any other first byte, and an empty frame', () => {
    expect(() => frameKindOf(Uint8Array.from([7]))).toThrow(TalkFrameError);
    expect(() => frameKindOf(new Uint8Array(0))).toThrow(TalkFrameError);
  });
});

describe('picture frames', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff]);

  it('round-trips every source with and without the still flag', () => {
    for (const source of SIGHT_SOURCES) {
      for (const still of [true, false]) {
        const parsed = sightOfFrame(sightFrameOf({ source, still, jpeg }));
        expect(parsed.source).toBe(source);
        expect(parsed.still).toBe(still);
        expect([...parsed.jpeg]).toEqual([...jpeg]);
      }
    }
  });

  it('lays the frame out as marker, source, flags, picture', () => {
    const frame = sightFrameOf({ source: 'phone_camera', still: true, jpeg });
    expect([...frame.subarray(0, SIGHT_FRAME_HEADER_BYTES)]).toEqual([
      ASSISTANT_SIGHT_FRAME,
      SIGHT_SOURCES.indexOf('phone_camera'),
      1,
    ]);
  });

  it('refuses an empty picture and one over the byte limit', () => {
    expect(() =>
      sightFrameOf({ source: 'phone_camera', still: false, jpeg: new Uint8Array(0) }),
    ).toThrow(/1 to 400000 bytes/u);
    expect(() =>
      sightFrameOf({
        source: 'phone_camera',
        still: false,
        jpeg: new Uint8Array(SIGHT_FRAME_LIMITS.maxBytes + 1),
      }),
    ).toThrow(TalkFrameError);
    expect(
      sightFrameOf({
        source: 'phone_camera',
        still: false,
        jpeg: new Uint8Array(SIGHT_FRAME_LIMITS.maxBytes),
      }).byteLength,
    ).toBe(SIGHT_FRAME_LIMITS.maxBytes + SIGHT_FRAME_HEADER_BYTES);
  });

  it('refuses to read a frame with another marker, an unknown source or a bad size', () => {
    expect(() => sightOfFrame(Uint8Array.from([TALK_AUDIO_FRAME, 0, 0, 1]))).toThrow(
      /starts with 2/u,
    );
    expect(() => sightOfFrame(Uint8Array.from([ASSISTANT_SIGHT_FRAME, 99, 0, 1]))).toThrow(
      /unknown/u,
    );
    expect(() => sightOfFrame(Uint8Array.from([ASSISTANT_SIGHT_FRAME, 0, 0]))).toThrow(
      /not allowed/u,
    );
    expect(() =>
      sightOfFrame(
        new Uint8Array(SIGHT_FRAME_HEADER_BYTES + SIGHT_FRAME_LIMITS.maxBytes + 1).fill(
          ASSISTANT_SIGHT_FRAME,
          0,
          1,
        ),
      ),
    ).toThrow(/not allowed/u);
  });

  it('refuses a frame that is shorter than its own header', () => {
    expect(() => sightOfFrame(Uint8Array.from([ASSISTANT_SIGHT_FRAME]))).toThrow(/not allowed/u);
  });

  it('reads a frame with no flag set as not a still', () => {
    const parsed = sightOfFrame(Uint8Array.from([ASSISTANT_SIGHT_FRAME, 0, 0, 1]));
    expect(parsed.still).toBe(false);
  });

  it('reads a picture out of a view that does not start at the beginning of its buffer', () => {
    const whole = Uint8Array.from([0, 0, ASSISTANT_SIGHT_FRAME, 2, 1, 9, 8]);
    const parsed = sightOfFrame(whole.subarray(2));
    expect(parsed).toMatchObject({ source: SIGHT_SOURCES[2], still: true });
    expect([...parsed.jpeg]).toEqual([9, 8]);
  });
});

describe('talk handshake and messages', () => {
  it('offers the protocol and the bearer token as websocket sub-protocols', () => {
    expect(talkProtocols(TOKEN)).toEqual([TALK_PROTOCOL, `bearer.${TOKEN}`]);
  });

  it('refuses a malformed token', () => {
    expect(() => talkProtocols('short')).toThrow();
  });

  it('accepts each client message and refuses an unknown one', () => {
    expect(TALK_CLIENT_MESSAGE.safeParse({ type: 'press', channelId: ID }).success).toBe(true);
    expect(
      TALK_CLIENT_MESSAGE.safeParse({ type: 'listen', channelId: ID, cameraId: ID }).success,
    ).toBe(true);
    expect(TALK_CLIENT_MESSAGE.safeParse({ type: 'release' }).success).toBe(true);
    expect(TALK_CLIENT_MESSAGE.safeParse({ type: 'shout' }).success).toBe(false);
  });

  it('accepts each server message and refuses a denial it does not know', () => {
    const speaker = { kind: 'client', id: ID, label: 'Ann', detail: null };
    for (const message of [
      { type: 'ready', clientId: ID, channels: [ID] },
      { type: 'channels', channels: [] },
      { type: 'granted', channelId: ID, messageId: ID, limitSeconds: 30 },
      { type: 'denied', channelId: ID, reason: 'busy' },
      { type: 'ended', messageId: ID, reason: 'released', detail: null },
      { type: 'rx_start', channelId: ID, messageId: ID, speaker },
      { type: 'rx_end', messageId: ID },
      { type: 'live_start', channelId: ID, conversationId: 'c', label: 'Kitchen' },
      { type: 'live_end', channelId: ID, conversationId: 'c' },
    ]) {
      expect(TALK_SERVER_MESSAGE.safeParse(message).success).toBe(true);
    }
    expect(
      TALK_SERVER_MESSAGE.safeParse({ type: 'denied', channelId: ID, reason: 'rude' }).success,
    ).toBe(false);
  });
});
