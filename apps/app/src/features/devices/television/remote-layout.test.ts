import { describe, expect, it } from 'vitest';
import { compactPartsOf, remoteLayoutOf, stackWideControls, tallRingSize } from './remote-layout';

describe('television remote layout', () => {
  it('picks the face from the wide card class', () => {
    expect(remoteLayoutOf('m')).toBe('compact');
    expect(remoteLayoutOf('w')).toBe('wide');
    expect(remoteLayoutOf('l')).toBe('tall');
    expect(remoteLayoutOf('xl')).toBe('tall');
  });

  it('stacks wide controls while a full row would crowd out the name and inputs', () => {
    expect(stackWideControls(560)).toBe(true);
    expect(stackWideControls(720)).toBe(true);
    expect(stackWideControls(900)).toBe(false);
  });

  it('uses a compact ring to leave title and wrapped controls room on narrow tall cards', () => {
    expect(tallRingSize(256)).toBe('card');
    expect(tallRingSize(344)).toBe('card');
    expect(tallRingSize(346)).toBe('quick');
  });

  it('keeps playback space available when a compact card cannot send navigation keys', () => {
    expect(compactPartsOf(302, false)).toMatchObject({ ring: false, playPair: true });
  });

  it('drops the play key, then the mute key, then the ring as the width shrinks', () => {
    expect(compactPartsOf(326, true)).toMatchObject({ ring: true, mute: true, play: false });
    expect(compactPartsOf(300, true)).toMatchObject({ ring: true, mute: true, play: false });
    expect(compactPartsOf(280, true)).toMatchObject({ ring: false, play: true });
    expect(compactPartsOf(160, true)).toMatchObject({ ring: false, mute: false, play: false });
  });

  it('fits separate play and pause keys only when there is room for both', () => {
    expect(compactPartsOf(250, false)).toMatchObject({ play: true, playPair: false });
    expect(compactPartsOf(290, false)).toMatchObject({ play: true, playPair: true });
    expect(compactPartsOf(302, false)).toMatchObject({ play: true, playPair: true });
  });
});
