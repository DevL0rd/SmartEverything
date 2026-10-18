import { describe, expect, it } from 'vitest';
import { callLevelSource } from './use-call-level';

describe('call level source', () => {
  it('reads the voice while speaking and the microphone while listening unmuted', () => {
    expect(callLevelSource('speaking', false)).toBe('output');
    expect(callLevelSource('speaking', true)).toBe('output');
    expect(callLevelSource('listening', false)).toBe('input');
  });

  it('reads nothing when muted while listening or outside a live phase', () => {
    expect(callLevelSource('listening', true)).toBeNull();
    expect(callLevelSource('idle', false)).toBeNull();
    expect(callLevelSource('ended', false)).toBeNull();
  });
});
