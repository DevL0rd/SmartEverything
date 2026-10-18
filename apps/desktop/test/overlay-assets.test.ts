import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OVERLAY_CONTENT_SECURITY_POLICY } from '../src/csp.js';

const PAGE = path.join(import.meta.dirname, '../src/overlay/page');
const GLOBAL_CSS = path.join(import.meta.dirname, '../../app/global.css');

function tokensIn(block: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      tokens.set(name, value.trim());
    }
  }
  return tokens;
}

function appTokens(theme: 'dark' | 'light'): Map<string, string> {
  const css = readFileSync(GLOBAL_CSS, 'utf8');
  const start = css.indexOf(`@variant ${theme} {`);
  const rest = css.slice(start);
  return tokensIn(rest.slice(0, rest.indexOf('\n    }')));
}

function overlayTokens(theme: 'dark' | 'light'): Map<string, string> {
  const css = readFileSync(path.join(PAGE, 'overlay-tokens.css'), 'utf8');
  const start = css.indexOf(`.ov[data-theme='${theme}']`);
  const rest = css.slice(start);
  return tokensIn(rest.slice(0, rest.indexOf('}')));
}

const SHARED = [
  '--color-surface-2',
  '--color-surface-3',
  '--color-surface-raised',
  '--color-on-surface',
  '--color-on-surface-variant',
  '--color-on-surface-faint',
  '--color-outline',
  '--color-primary',
  '--color-on-primary',
  '--color-primary-container',
  '--color-on-primary-container',
  '--color-orb-shine',
  '--color-critical',
  '--color-viz-1',
  '--color-viz-4',
] as const;

describe('overlay design tokens', () => {
  for (const theme of ['dark', 'light'] as const) {
    it(`copies the ${theme} tokens of the app`, () => {
      const app = appTokens(theme);
      const overlay = overlayTokens(theme);
      for (const name of SHARED) {
        expect(app.get(name), `${name} in the app`).toBeDefined();
        expect(overlay.get(name), name).toBe(app.get(name));
      }
    });

    it(`draws the ${theme} pill from the raised surface at 94 percent`, () => {
      const overlay = overlayTokens(theme);
      expect(overlay.get('--overlay-surface')).toBe(
        `${String(overlay.get('--color-surface-raised'))}f0`,
      );
    });
  }
});

describe('overlay page policy', () => {
  it('carries the content security policy the main process names', () => {
    const html = readFileSync(path.join(PAGE, 'overlay.html'), 'utf8');
    const match = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html);
    expect(match?.[1]).toBe(OVERLAY_CONTENT_SECURITY_POLICY);
  });

  it('allows no network, no inline script and no remote resource', () => {
    expect(OVERLAY_CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(OVERLAY_CONTENT_SECURITY_POLICY).toContain("connect-src 'none'");
    expect(OVERLAY_CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(OVERLAY_CONTENT_SECURITY_POLICY).not.toContain('unsafe-inline');
  });

  it('uses no blend modes and no per-frame shadow or radius changes in its styles', () => {
    for (const file of [
      'overlay-pill.css',
      'overlay-glow.css',
      'overlay-orb.css',
      'overlay-tray.css',
    ]) {
      expect(readFileSync(path.join(PAGE, file), 'utf8')).not.toContain('mix-blend-mode');
    }
  });
});
