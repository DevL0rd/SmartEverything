import { describe, expect, it } from 'vitest';
import { colord } from 'colord';
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

describe('colord contract', () => {
  it('is declared at the installed version by the app and the domain package', () => {
    expect(declaredVersion(APP_MANIFEST, 'colord')).toBe(installedVersion('colord'));
    expect(declaredVersion('packages/domain/package.json', 'colord')).toBe(
      installedVersion('colord'),
    );
  });
  it('converts between hex, rgb and integer hsv', () => {
    const colour = colord('#ff8000');
    expect(colour.toRgb()).toEqual({ r: 255, g: 128, b: 0, a: 1 });
    expect(colour.toHsv()).toEqual({ h: 30, s: 100, v: 100, a: 1 });
    expect(colord({ h: 120, s: 100, v: 100 }).toHex()).toBe('#00ff00');
  });
  it('clamps out-of-range channels when producing hex', () => {
    expect(colord({ r: 300, g: -5, b: 0 }).toHex()).toBe('#ff0000');
  });
});
