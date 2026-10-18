import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGE = path.join(import.meta.dirname, '../src/overlay/page');
const css = (name: string): string => readFileSync(path.join(PAGE, name), 'utf8');

function restRules(source: string): { selector: string; body: string }[] {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => ({ selector: (match[1] ?? '').trim(), body: (match[2] ?? '').trim() }))
    .filter((rule) => rule.selector.includes('data-rest'));
}

function infiniteSelectors(): string[] {
  return ['overlay-orb.css', 'overlay-pill.css', 'overlay-glow.css'].flatMap((name) =>
    [...css(name).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((match) => (match[2] ?? '').includes('infinite'))
      .map((match) => (match[1] ?? '').trim()),
  );
}

describe('the rest rule that pauses the page when the call is quiet', () => {
  const rules = restRules(css('overlay-motion.css'));

  it('only pauses animations and never anything else', () => {
    expect(rules.length).toBeGreaterThan(0);
    rules.forEach((rule) => {
      expect(rule.body.replace(/\s+/g, ' ')).toBe('animation-play-state: paused !important;');
    });
  });

  it('never reaches the one-shot animations that carry the pill in, out and between states', () => {
    const selectors = rules.map((rule) => rule.selector).join(' ');
    expect(selectors).not.toMatch(/(^|[\s,])\*/);
    for (const oneShot of [
      '.pill',
      '.in',
      '.out',
      '.swap',
      '.txt',
      '.txt-in',
      '.bloom',
      '.glow-bloom',
    ]) {
      expect(selectors.includes(oneShot)).toBe(false);
    }
  });

  it('covers every looping animation so the page really stands still', () => {
    const looping = infiniteSelectors().join(' ');
    const paused = rules.map((rule) => rule.selector).join(' ');
    for (const loop of ['orb-pulse', 'orb-swirl', 'orb-halo', 'blob', 'glow-mode', 'edge', 'st']) {
      const named = new RegExp(`\\.${loop}(?![\\w-])`);
      expect(looping).toMatch(named);
      expect(paused).toMatch(named);
    }
  });
});
