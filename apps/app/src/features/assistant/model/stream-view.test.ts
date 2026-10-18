import { describe, expect, it } from 'vitest';
import { StreamParser, type StreamView, finalView, streamView } from './stream-view';

const joined = (view: StreamView): string =>
  [...view.settled, view.tail].filter((part) => part !== '').join('\n\n');

const TABLE = '| a | b |\n|---|---|\n| 1 | 2 |';

describe('stream view', () => {
  it('hides a trailing table while streaming and shows it once settled', () => {
    const text = `intro\n\n${TABLE}`;
    expect(streamView(text).pending).toBe('table');
    const done = finalView(text);
    expect(done.pending).toBeNull();
    expect(`${done.settled.join('\n\n')}\n\n${done.tail}`).toBe(text);
  });

  it('splits a finished reply at the same paragraph as the stream did', () => {
    const text = 'one\n\ntwo\n\nthree';
    const live = streamView(text);
    const done = finalView(text);
    expect(done.settled).toEqual(live.settled);
    expect(done.tail).toBe(live.tail);
  });

  it('keeps a single paragraph as the tail', () => {
    expect(finalView('just one')).toEqual({ settled: [], tail: 'just one', pending: null });
  });

  it('keeps blank lines inside a completed code block in one markdown fragment', () => {
    const code = '```js\nconst first = 1;\n\nconst second = 2;\n```';
    expect(finalView(`intro\n\n${code}`)).toEqual({
      settled: ['intro'],
      tail: code,
      pending: null,
    });
    expect(streamView(code)).toEqual({ settled: [], tail: code, pending: null });
  });

  it('feeds the same views incrementally as the stateless splitter, reusing settled blocks', () => {
    const text = 'one\n\n```js\na\n\nb\n```\n\n- x\n- y\n\nlast words here';
    const parser = new StreamParser();
    const identities = new Set<readonly string[]>();
    for (let end = 1; end <= text.length; end += 1) {
      const slice = text.slice(0, end);
      const view = parser.view(slice);
      const expected = streamView(slice);
      expect(joined(view)).toBe(joined(expected));
      expect(view.pending).toBe(expected.pending);
      identities.add(view.settled);
    }
    expect(identities.size).toBeLessThanOrEqual(12);
  });

  it('restarts when the text is replaced', () => {
    const parser = new StreamParser();
    parser.view('a\n\nb\n\nc');
    expect(parser.view('x\n\ny')).toEqual({ settled: ['x'], tail: 'y', pending: null });
  });
});
