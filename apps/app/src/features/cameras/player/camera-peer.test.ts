import { appendTo } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPeer, type StreamOf } from './camera-peer';
import type { CameraPeer, MediaHandle, PeerOptions } from './peer-types';

type Listener = (event: unknown) => void;

class FakeTarget {
  readonly listeners = new Map<string, Listener[]>();

  addEventListener(type: string, listener: Listener): void {
    appendTo(this.listeners, type, listener);
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

class FakeTrack extends FakeTarget {
  enabled = true;
  readonly stopped = vi.fn();

  constructor(readonly kind: 'audio' | 'video') {
    super();
  }

  stop(): void {
    this.stopped();
  }
}

class FakeSender {
  readonly replaceTrack = vi.fn(() => Promise.resolve());
}

class FakeConnection extends FakeTarget {
  static last: FakeConnection | null = null;
  iceGatheringState = 'new';
  connectionState = 'new';
  localDescription: { sdp: string } | null = null;
  readonly sender = new FakeSender();
  readonly transceivers: { kind: string; direction: string }[] = [];
  readonly setRemoteDescription = vi.fn(() => Promise.resolve());
  readonly close = vi.fn();

  constructor(readonly config: unknown) {
    super();
    FakeConnection.last = this;
  }

  addTransceiver(kind: string, init: { direction: string }): { sender: FakeSender } {
    this.transceivers.push({ kind, direction: init.direction });
    return { sender: this.sender };
  }

  createOffer(): Promise<{ type: 'offer'; sdp: string }> {
    return Promise.resolve({ type: 'offer', sdp: 'offer-sdp' });
  }

  setLocalDescription(description: { sdp: string }): Promise<void> {
    this.localDescription = description;
    return Promise.resolve();
  }

  gather(): void {
    this.iceGatheringState = 'complete';
    this.emit('icegatheringstatechange');
  }
}

const OPTIONS: PeerOptions = { twoWayAudio: true, video: true, iceServers: [] };
const STREAM = { id: 'stream-1' };
const microphone = new FakeTrack('audio');

function connection(): FakeConnection {
  if (FakeConnection.last === null) {
    throw new Error('no connection was created');
  }
  return FakeConnection.last;
}

function open(streamOf: StreamOf = () => STREAM): CameraPeer {
  return createPeer(OPTIONS, streamOf);
}

beforeEach(() => {
  FakeConnection.last = null;
  vi.stubGlobal('RTCPeerConnection', FakeConnection);
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: () => Promise.resolve({ getAudioTracks: () => [microphone] }) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('camera peer', () => {
  it('asks for receive-only video and a two-way audio line', () => {
    open();
    expect(connection().transceivers).toStrictEqual([
      { kind: 'video', direction: 'recvonly' },
      { kind: 'audio', direction: 'sendrecv' },
    ]);
  });

  it('hands out the offer once the network candidates are gathered', async () => {
    const peer = open();
    const offer = peer.offer();
    connection().gather();
    await expect(offer).resolves.toBe('offer-sdp');
  });

  it('reports media and video flow from the tracks the camera sends', () => {
    const peer = open();
    const media: MediaHandle[] = [];
    const flow: boolean[] = [];
    peer.onMedia((handle) => media.push(handle));
    peer.onVideoFlow((flowing) => flow.push(flowing));
    const video = new FakeTrack('video');
    connection().emit('track', { track: video, streams: [STREAM] });
    video.emit('mute');
    video.emit('unmute');
    expect(media).toStrictEqual([{ id: 'stream-1', source: STREAM }]);
    expect(flow).toStrictEqual([false, true]);
  });

  it('tells nobody about media when the platform finds no stream for a track', () => {
    const peer = open(() => null);
    const media: MediaHandle[] = [];
    peer.onMedia((handle) => media.push(handle));
    connection().emit('track', { track: new FakeTrack('video'), streams: [] });
    expect(media).toStrictEqual([]);
  });

  it('keeps audio disabled on arrival until someone listens', () => {
    const peer = open();
    const first = new FakeTrack('audio');
    connection().emit('track', { track: first, streams: [STREAM] });
    expect(first.enabled).toBe(false);
    peer.setListening(true);
    expect(first.enabled).toBe(true);
    const second = new FakeTrack('audio');
    connection().emit('track', { track: second, streams: [STREAM] });
    expect(second.enabled).toBe(true);
  });

  it('mutes audio that arrives after listening was switched off', () => {
    const peer = open();
    const early = new FakeTrack('audio');
    connection().emit('track', { track: early, streams: [STREAM] });
    peer.setListening(false);
    const late = new FakeTrack('audio');
    connection().emit('track', { track: late, streams: [STREAM] });
    expect([early.enabled, late.enabled]).toStrictEqual([false, false]);
    peer.setListening(true);
    expect([early.enabled, late.enabled]).toStrictEqual([true, true]);
  });

  it('maps connection states and sends talk audio through the audio sender', async () => {
    const peer = open();
    const states: string[] = [];
    peer.onState((state) => states.push(state));
    connection().connectionState = 'connected';
    connection().emit('connectionstatechange');
    connection().connectionState = 'unheard-of';
    connection().emit('connectionstatechange');
    await peer.setTalking(true);
    expect(states).toStrictEqual(['connected', 'connecting']);
    expect(connection().sender.replaceTrack).toHaveBeenCalledWith(microphone);
  });

  it('refuses an answer that arrives after the peer was closed', async () => {
    const peer = open();
    await peer.answer('answer-sdp');
    expect(connection().setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'answer-sdp',
    });
    peer.close();
    await expect(peer.answer('late')).rejects.toThrow('closed before the camera answered');
    expect(connection().close).toHaveBeenCalledTimes(1);
  });
});
