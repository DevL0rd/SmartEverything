import { describe, expect, it, vi, type Mock } from 'vitest';
import type { BrowserTarget } from '@smarteverything/domain';
import { browserHandle, nativeSourceKey } from './browser-native';

const PUBLIC: BrowserTarget = { kind: 'public', id: 'tab-1', url: 'https://example.com/' };
const HTML: BrowserTarget = {
  kind: 'project',
  id: 'tab-2',
  url: 'http://127.0.0.1:50000/workspace/site/index.html',
  projectionId: 'projection-1',
  page: { chatId: '00000000-0000-4000-8000-000000000001', path: '/workspace/site/index.html' },
};

type Native = NonNullable<Parameters<typeof browserHandle>[0]['current']>;

function commands(): { readonly [K in keyof Native]: Mock<Native[K]> } {
  return {
    navigate: vi.fn((_url: string) => Promise.resolve()),
    back: vi.fn(() => Promise.resolve()),
    forward: vi.fn(() => Promise.resolve()),
    reload: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
  };
}

describe('the native browser handle', () => {
  it('calls the native view functions for every command', () => {
    const native = commands();
    const handle = browserHandle({ current: native }, PUBLIC);
    handle.navigate('https://example.org/next');
    handle.back();
    handle.forward();
    handle.reload();
    handle.stop();
    expect(native.navigate).toHaveBeenCalledWith('https://example.org/next');
    expect(native.back).toHaveBeenCalledOnce();
    expect(native.forward).toHaveBeenCalledOnce();
    expect(native.reload).toHaveBeenCalledOnce();
    expect(native.stop).toHaveBeenCalledOnce();
  });

  it('does not navigate to an address the target does not allow', () => {
    const native = commands();
    browserHandle({ current: native }, PUBLIC).navigate('javascript:alert(1)');
    expect(native.navigate).not.toHaveBeenCalled();
  });

  it('keeps a project page on its own isolated origin', () => {
    const native = commands();
    const handle = browserHandle({ current: native }, HTML);
    handle.navigate('http://127.0.0.1:50000/workspace/site/other.html');
    handle.navigate('https://smarteverything.devl0rd.com/api/ai');
    handle.reload();
    expect(native.navigate).toHaveBeenCalledOnce();
    expect(native.navigate).toHaveBeenCalledWith('http://127.0.0.1:50000/workspace/site/other.html');
    expect(native.reload).toHaveBeenCalledOnce();
  });

  it('does nothing before the native view exists and survives a rejected command', async () => {
    browserHandle({ current: null }, PUBLIC).reload();
    const native = commands();
    native.reload.mockRejectedValueOnce(new Error('HTML view ownership was withdrawn'));
    expect(() => {
      browserHandle({ current: native }, PUBLIC).reload();
    }).not.toThrow();
    await Promise.resolve();
    expect(native.reload).toHaveBeenCalledOnce();
  });
});

describe('the native browser source key', () => {
  it('stays stable for the same target and changes with the bound source', () => {
    expect(nativeSourceKey({ ...HTML })).toBe(nativeSourceKey(HTML));
    expect(nativeSourceKey({ ...HTML, projectionId: 'projection-2' })).not.toBe(
      nativeSourceKey(HTML),
    );
    expect(nativeSourceKey({ ...HTML, id: 'tab-3' })).not.toBe(nativeSourceKey(HTML));
    expect(nativeSourceKey({ ...PUBLIC, url: 'https://example.org/' })).not.toBe(
      nativeSourceKey(PUBLIC),
    );
    expect(nativeSourceKey(HTML)).not.toBe(nativeSourceKey(PUBLIC));
  });
});
