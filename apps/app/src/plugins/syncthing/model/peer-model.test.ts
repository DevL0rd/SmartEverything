import { describe, expect, it } from 'vitest';
import { peerGlyph, peerStateWord, peerStatus, peerTone } from './peer-model';
import { peerOf } from './snapshot-fixture';

const NOW = Date.parse('2026-10-17T10:00:00+07:00');

describe('peerStatus', () => {
  it('says connected and up to date', () => {
    expect(peerStatus(peerOf(), NOW, false)).toBe('Connected · up to date');
  });

  it('says how much is left while syncing', () => {
    expect(peerStatus(peerOf({ needBytes: 1_500_000_000 }), NOW, false)).toBe(
      'Syncing · 1.5 GB left',
    );
  });

  it('says paused before anything else', () => {
    expect(peerStatus(peerOf({ paused: true, connected: false }), NOW, false)).toBe('Paused');
  });

  it('says when an away device was last seen, or that it never connected', () => {
    const away = peerOf({ connected: false, lastSeen: '2026-10-17T09:00:00+07:00' });
    expect(peerStatus(away, NOW, false)).toMatch(/^Away · last seen /);
    expect(peerStatus(peerOf({ connected: false }), NOW, false)).toBe('Never connected');
  });

  it('shows only the last known standing when the page is stale', () => {
    expect(peerStatus(peerOf(), NOW, true)).toBe('Last known: connected');
    expect(peerStatus(peerOf({ connected: false }), NOW, true)).toBe('Last known: away');
    expect(peerStatus(peerOf({ paused: true }), NOW, true)).toBe('Last known: paused');
  });
});

describe('peerTone and peerStateWord', () => {
  it('maps connected, paused and away', () => {
    expect(peerTone(peerOf())).toBe('positive');
    expect(peerTone(peerOf({ paused: true }))).toBe('warning');
    expect(peerTone(peerOf({ connected: false }))).toBe('neutral');
    expect(peerStateWord(peerOf())).toBe('Connected');
    expect(peerStateWord(peerOf({ paused: true }))).toBe('Paused');
    expect(peerStateWord(peerOf({ connected: false }))).toBe('Away');
  });
});

describe('peerGlyph', () => {
  it('picks a glyph from the name', () => {
    expect(peerGlyph("Sam's phone")).toBe('smartphone');
    expect(peerGlyph('Pixel 9')).toBe('smartphone');
    expect(peerGlyph('Home NAS')).toBe('server');
    expect(peerGlyph("Dana's laptop")).toBe('monitor');
  });
});
