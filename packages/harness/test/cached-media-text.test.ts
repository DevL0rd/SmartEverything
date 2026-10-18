import { describe, expect, it } from 'vitest';
import { cachedMediaText } from '../src/process/attachments';

const FILE = { id: 'a1', name: 'shot.png', mime: 'image/png', data: new Uint8Array(10) };

describe('cachedMediaText', () => {
  it('carries the details, the stored note and the read hint', () => {
    const text = cachedMediaText({ ...FILE, transcript: 'a cat' });
    expect(text).toContain('image "shot.png", image/png, 10 bytes · id a1');
    expect(text).toContain('Description: a cat');
    expect(text).toContain('read_chats view attachment with id a1');
  });

  it('marks a note that is not ready and still carries details and the hint', () => {
    const text = cachedMediaText({ ...FILE, transcript: null });
    expect(text).toContain('Description pending.');
    expect(text).toContain('id a1');
    expect(text).toContain('read_chats view attachment with id a1');
  });
});
