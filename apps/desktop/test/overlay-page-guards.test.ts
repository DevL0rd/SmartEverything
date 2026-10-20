import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGE = path.join(import.meta.dirname, '../src/overlay/page');
const read = (name: string): string => readFileSync(path.join(PAGE, name), 'utf8');

describe('overlay pill page', () => {
  it('shows the root before it measures, because a hidden root measures every control as zero wide', () => {
    const source = read('overlay-pill-page.ts');
    const show = source.indexOf("this.root.toggleAttribute('hidden', false)");
    const measure = source.indexOf('this.#dom.render(');
    expect(show).toBeGreaterThan(-1);
    expect(measure).toBeGreaterThan(show);
  });

  it('lets the bar be dragged by its text and keeps every control clickable', () => {
    const css = read('overlay-pill.css');
    expect(css).toMatch(/\.pill \.txt \{[^}]*-webkit-app-region: drag/);
    expect(css).not.toMatch(/\.b \{[^}]*-webkit-app-region: drag/);
  });
});

describe('overlay thinking controls', () => {
  it('never truncates the chip label and hides it only in the icon-only chip', () => {
    const pill = read('overlay-pill.css');
    expect(pill).not.toMatch(/\.think(-tx)? \{[^}]*(max-width|text-overflow)/);
    expect(pill).toMatch(/\.think\.icon \.think-tx \{[^}]*display: none;/);
  });

  it('outlines the checked thinking level so the choice does not rest on a faint fill', () => {
    expect(read('overlay-tray.css')).toMatch(
      /\.tk-opt\[aria-checked='true'\] \{[^}]*box-shadow: inset 0 0 0 1px var\(--color-primary\)/,
    );
  });

  it('spins beside Saving only when motion is allowed', () => {
    const tray = read('overlay-tray.css');
    expect(tray).toMatch(/\.tk-save::before \{[^}]*animation: tk-spin/);
    expect(tray).toMatch(/\.ov\.rm \.tk-save::before \{[^}]*animation: none;/);
  });
});

describe('overlay windows fit their content', () => {
  it('leaves no transparent margin around the pill, the tray or the card that could take clicks', () => {
    const pill = read('overlay-pill.css');
    const tray = read('overlay-tray.css');
    expect(pill).toMatch(/\.pill \{[^}]*bottom: 0;/);
    expect(pill).toMatch(/\.ov\.compact \.pill \{[^}]*top: 0;/);
    expect(tray).toMatch(/\.ov\[data-role='tray'\] \{[^}]*width: 420px;/);
    expect(tray).not.toMatch(/\.ov\[data-role='tray'\] \{[^}]*padding/);
  });

  it('draws the depth inside the box because the window ends where the box ends', () => {
    const tokens = read('overlay-tokens.css');
    for (const match of tokens.matchAll(/--overlay-shadow:\s*([^;]+);/g)) {
      expect(match[1]).toMatch(/^inset /);
    }
    expect(read('overlay-pill.css')).toMatch(/\.pill \{[^}]*box-shadow: var\(--overlay-shadow\)/);
    expect(read('overlay-tray.css')).toMatch(/box-shadow: var\(--overlay-shadow\)/);
  });
});

describe('overlay motion never runs a frame loop of its own', () => {
  it('moves the bars, the orb and the glow through compositor transitions set once per level event', () => {
    for (const file of [
      'overlay-glow.ts',
      'overlay-pill-dom.ts',
      'overlay-controls-dom.ts',
      'overlay-orb-dom.ts',
      'overlay-environment.ts',
    ]) {
      expect(read(file), file).not.toMatch(/requestAnimationFrame|setInterval/);
    }
    const motion = readFileSync(path.join(PAGE, '../overlay-motion.ts'), 'utf8');
    expect(motion).not.toMatch(/requestAnimationFrame|setInterval|frame\(/);
    expect(read('overlay-pill.css')).toMatch(
      /\.rib i \{[^}]*transition: transform 180ms var\(--spring-level\)/,
    );
    expect(read('overlay-glow.css')).toMatch(/\.glow-lv \{[^}]*transition:/);
  });

  it('defines the spring curves the entrance and the level transitions use', () => {
    const css = read('overlay-pill.css');
    expect(css).toMatch(/--spring-pill: linear\(/);
    expect(css).toMatch(/--spring-level: linear\(/);
  });
});
