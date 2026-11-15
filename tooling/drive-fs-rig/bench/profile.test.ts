import { describe, expect, it } from 'vitest';
import { categorize, summarizeProfile } from './profile.ts';

describe('categorize', () => {
  it('separates idle, garbage collection, sqlite, sockets, hashing, file system and application time', () => {
    expect(categorize('(idle)', '')).toBe('idle');
    expect(categorize('(garbage collector)', '')).toBe('garbage collection');
    expect(categorize('run', '')).toBe('sqlite');
    expect(categorize('receiverOnMessage', '/x/node_modules/ws/lib/receiver.js')).toBe(
      'socket and websocket',
    );
    expect(categorize('digest', '')).toBe('hashing and crypto');
    expect(categorize('fsyncSync', 'node:fs')).toBe('file system');
    expect(categorize('commitContent', 'file:///x/service.mjs')).toBe('application');
  });
});

describe('summarizeProfile', () => {
  it('adds sample time per category and ranks functions by self time', () => {
    const text = JSON.stringify({
      nodes: [
        { id: 1, callFrame: { functionName: '(idle)', url: '', lineNumber: 0 } },
        {
          id: 2,
          callFrame: { functionName: 'commitContent', url: 'file:///x/service.mjs', lineNumber: 9 },
        },
      ],
      samples: [1, 2, 2],
      timeDeltas: [0, 4000, 6000],
    });
    const summary = summarizeProfile(text, 5);
    expect(summary.totalMs).toBeCloseTo(10);
    expect(summary.byCategory.application).toBeCloseTo(6);
    expect(summary.byCategory.idle).toBeCloseTo(4);
    expect(summary.top[0]?.name).toContain('commitContent');
  });
});
