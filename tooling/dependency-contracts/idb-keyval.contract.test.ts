import { describe, expect, it } from 'vitest';
import * as idb from 'idb-keyval';
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

describe('idb-keyval contract', () => {
  it('is declared at the installed version by the app', () => {
    expect(declaredVersion(APP_MANIFEST, 'idb-keyval')).toBe(installedVersion('idb-keyval'));
  });
  it('exposes the batch key-value functions the snapshot storage uses', () => {
    expect(typeof idb.getMany).toBe('function');
    expect(typeof idb.delMany).toBe('function');
    expect(typeof idb.set).toBe('function');
  });
});
