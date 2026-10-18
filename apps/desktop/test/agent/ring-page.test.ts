import { describe, expect, it } from 'vitest';
import { RING_STOP_TITLE, ringPageUrl } from '../../src/agent/ring-page.js';

function page(): string {
  const url = ringPageUrl();
  return decodeURIComponent(url.slice(url.indexOf(',') + 1));
}

describe('the ring page', () => {
  it('is a self-contained page with a Stop button that reports itself through the title', () => {
    const html = page();
    expect(ringPageUrl().startsWith('data:text/html;charset=utf-8,')).toBe(true);
    expect(html).toContain('<button id="stop"');
    expect(html).toContain(`document.title = '${RING_STOP_TITLE}'`);
  });

  it('makes its sound with oscillators and never with timers', () => {
    const html = page();
    expect(html).toContain('createOscillator');
    expect(html).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/u);
  });

  it('reaches no network and loads nothing', () => {
    const html = page();
    expect(html).not.toMatch(/https?:|<script src|<link /u);
  });
});
