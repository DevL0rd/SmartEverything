import { describe, expect, it } from 'vitest';
import { joinLogLines } from './log-seam';

describe('joinLogLines', () => {
  it('does not repeat lines the tail already holds when the stream started earlier', () => {
    expect(joinLogLines(['a', 'b', 'c'], ['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not repeat lines when the stream only began inside the tail', () => {
    expect(joinLogLines(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps the live lines when the stream began after the tail was read', () => {
    expect(joinLogLines(['a', 'b'], ['c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('shows the tail alone when nothing has streamed', () => {
    expect(joinLogLines(['a', 'b'], [])).toEqual(['a', 'b']);
  });

  it('shows the live lines alone when the tail is empty', () => {
    expect(joinLogLines([], ['a'])).toEqual(['a']);
  });

  it('holds when the tail window is shorter than what streamed since', () => {
    expect(joinLogLines(['c', 'd'], ['a', 'b', 'c', 'd', 'e'])).toEqual(['c', 'd', 'e']);
  });
});
