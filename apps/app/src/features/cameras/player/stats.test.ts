import { describe, expect, it } from 'vitest';
import {
  bitrateText,
  resolutionText,
  sampleOf,
  statsBetween,
  statsText,
  type StreamSample,
} from './stats';

const video = {
  type: 'inbound-rtp',
  kind: 'video',
  timestamp: 10_000,
  bytesReceived: 500_000,
  frameWidth: 1920,
  frameHeight: 1080,
  framesPerSecond: 20,
  packetsLost: 3,
  packetsReceived: 297,
};

const sample: StreamSample = {
  at: 10_000,
  bytes: 500_000,
  width: 1920,
  height: 1080,
  fps: 20,
  lost: 3,
  received: 297,
  framesDecoded: null,
};

describe('reading a WebRTC stats report', () => {
  it('finds the incoming video in a browser report map', () => {
    const report = new Map<string, unknown>([
      ['audio', { ...video, kind: 'audio' }],
      ['pair', { type: 'candidate-pair', timestamp: 1 }],
      ['video', video],
    ]);
    expect(sampleOf(report)).toStrictEqual(sample);
  });

  it('reads the older mediaType field and a plain object report', () => {
    const { kind: _kind, ...older } = video;
    expect(sampleOf({ v: { ...older, mediaType: 'video' } })).toStrictEqual(sample);
  });

  it('leaves out what the report does not say', () => {
    expect(
      sampleOf({ x: { type: 'inbound-rtp', kind: 'video', timestamp: 5, bytesReceived: 9 } }),
    ).toStrictEqual({
      at: 5,
      bytes: 9,
      width: null,
      height: null,
      fps: null,
      framesDecoded: null,
      lost: 0,
      received: 0,
    });
  });

  it('gives nothing when there is no incoming video', () => {
    expect(sampleOf(new Map())).toBeNull();
    expect(sampleOf('report')).toBeNull();
    expect(sampleOf({ a: { type: 'inbound-rtp', timestamp: 1, bytesReceived: 1 } })).toBeNull();
  });
});

describe('stats between two samples', () => {
  it('turns the bytes received over the elapsed milliseconds into kilobits a second', () => {
    const later = { ...sample, at: 12_000, bytes: 1_000_000 };
    expect(statsBetween(sample, later)).toStrictEqual({
      kbps: 2000,
      width: 1920,
      height: 1080,
      fps: 20,
      lossPercent: 1,
    });
  });

  it('has no rate for the first sample, a clock that did not move or a reset counter', () => {
    expect(statsBetween(null, sample).kbps).toBeNull();
    expect(statsBetween(sample, sample).kbps).toBeNull();
    expect(statsBetween(sample, { ...sample, at: 11_000, bytes: 10 }).kbps).toBeNull();
  });

  it('has no loss figure before any packet arrived', () => {
    expect(statsBetween(null, { ...sample, lost: 0, received: 0 }).lossPercent).toBeNull();
  });
});

describe('writing stats', () => {
  it('writes megabits above a thousand kilobits and rounds kilobits below', () => {
    expect(bitrateText(6100)).toBe('6.1 Mb/s');
    expect(bitrateText(1000)).toBe('1.0 Mb/s');
    expect(bitrateText(849.6)).toBe('850 kb/s');
  });

  it('writes the frame size only when both sides are known', () => {
    expect(resolutionText({ width: 2304, height: 1296 })).toBe('2304×1296');
    expect(resolutionText({ width: 2304, height: null })).toBeNull();
    expect(resolutionText({ width: null, height: 1296 })).toBeNull();
  });

  it('joins what is known and says nothing when nothing is', () => {
    const stats = statsBetween(sample, { ...sample, at: 11_000, bytes: 600_000 });
    expect(statsText(stats)).toBe('1920×1080 · 800 kb/s');
    expect(statsText({ ...stats, kbps: null })).toBe('1920×1080');
    expect(statsText({ ...stats, width: null })).toBe('800 kb/s');
    expect(statsText({ ...stats, width: null, kbps: null })).toBeNull();
    expect(statsText(null)).toBeNull();
  });
});
