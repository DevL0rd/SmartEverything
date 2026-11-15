import { describe, expect, it } from 'vitest';
import { scratchFor } from './paths.ts';

describe('scratchFor', () => {
  it('keeps the default rig folder when no instance is named', () => {
    expect(scratchFor(undefined)).toBe('/var/tmp/claude-agents/drive-fs');
    expect(scratchFor('')).toBe('/var/tmp/claude-agents/drive-fs');
  });

  it('puts a named instance in a folder the default rig stray scan cannot match', () => {
    const folder = scratchFor('mount-bench');
    expect(folder).toBe('/var/tmp/claude-agents/rig-mount-bench');
    expect(folder.includes(scratchFor(undefined))).toBe(false);
  });

  it('refuses names that could escape the folder', () => {
    expect(() => scratchFor('../x')).toThrow();
    expect(() => scratchFor('A b')).toThrow();
  });
});
