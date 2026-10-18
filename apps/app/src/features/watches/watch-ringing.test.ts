import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setRinging, useRinging } from './watch-ringing';

function Probe({ id }: { readonly id: string }): ReactNode {
  return String(useRinging(id));
}

function shows(id: string): string {
  return renderToStaticMarkup(createElement(Probe, { id }));
}

describe('which watches are ringing', () => {
  afterEach(() => {
    setRinging('a', false);
    setRinging('b', false);
  });

  it('rings only the watch that was asked', () => {
    setRinging('a', true);
    expect(shows('a')).toBe('true');
    expect(shows('b')).toBe('false');
  });

  it('stops when told to stop', () => {
    setRinging('a', true);
    setRinging('a', false);
    expect(shows('a')).toBe('false');
  });
});
