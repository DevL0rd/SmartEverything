import { describe, expect, it } from 'vitest';
import { finalView, streamView } from './stream-view';

const TABLE = '| a | b |\n|---|---|\n| 1 | 2 |';

describe('stream view', () => {
  it('hides a trailing table while streaming and shows it once settled', () => {
    const text = `intro\n\n${TABLE}`;
    expect(streamView(text).pending).toBe('table');
    const done = finalView(text);
    expect(done.pending).toBeNull();
    expect(`${done.settled}\n\n${done.tail}`).toBe(text);
  });

  it('splits a finished reply at the same paragraph as the stream did', () => {
    const text = 'one\n\ntwo\n\nthree';
    const live = streamView(text);
    const done = finalView(text);
    expect(done.settled).toBe(live.settled);
    expect(done.tail).toBe(live.tail);
  });

  it('keeps a single paragraph as the tail', () => {
    expect(finalView('just one')).toEqual({ settled: '', tail: 'just one', pending: null });
  });

  it('keeps blank lines inside a completed code block in one markdown fragment', () => {
    const code = '```js\nconst first = 1;\n\nconst second = 2;\n```';
    expect(finalView(`intro\n\n${code}`)).toEqual({
      settled: 'intro',
      tail: code,
      pending: null,
    });
    expect(streamView(code)).toEqual({ settled: '', tail: code, pending: null });
  });
});
