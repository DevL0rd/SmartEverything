import { describe, expect, it } from 'vitest';
import { selection } from 'd3-selection';
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

describe('d3-transition contract', () => {
  it('is declared by the app at the installed version', () => {
    expect(declaredVersion(APP_MANIFEST, 'd3-transition')).toBe(installedVersion('d3-transition'));
  });

  it('adds interrupt and transition to every selection as a side effect of being imported', async () => {
    expect(Reflect.get(selection.prototype, 'interrupt')).toBeUndefined();
    await import('d3-transition');
    expect(Reflect.get(selection.prototype, 'interrupt')).toBeTypeOf('function');
    expect(Reflect.get(selection.prototype, 'transition')).toBeTypeOf('function');
  });
});
