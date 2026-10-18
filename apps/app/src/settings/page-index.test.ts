import { describe, expect, it } from 'vitest';
import { indexByPage } from './page-index';

function setting(id: string, page: string): { readonly id: string; readonly page: string } {
  return { id, page };
}

describe('the settings index by page', () => {
  it('groups settings under their page and keeps their order', () => {
    const index = indexByPage([
      setting('a', 'home'),
      setting('b', 'devices'),
      setting('c', 'home'),
    ]);
    expect(index.get('home')?.map((entry) => entry.id)).toEqual(['a', 'c']);
    expect(index.get('devices')?.map((entry) => entry.id)).toEqual(['b']);
    expect(index.get('missing')).toBeUndefined();
  });
});
