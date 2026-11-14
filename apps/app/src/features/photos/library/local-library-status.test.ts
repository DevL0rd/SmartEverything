import { describe, expect, it, vi } from 'vitest';
import { isValidElement } from 'react';
import type { BannerProps } from '../../../components/banner';
import { LocalLibraryStatus, localLibraryStatusOf } from './local-library-status';
import type { LocalLibraryState } from '../local/types';

const READY: LocalLibraryState = { state: 'ready', access: 'all', items: [], error: null };

describe('local library browse status', () => {
  it('offers browsing permission without requiring backup, even alongside hub items', () => {
    expect(localLibraryStatusOf({ ...READY, state: 'denied', access: 'none' })).toMatchObject({
      title: 'Show photos and videos on this device',
      action: 'access',
      body: 'Allow access to browse your local library. This does not turn on backup.',
    });
    expect(localLibraryStatusOf({ ...READY, access: 'limited' })).toMatchObject({
      action: 'access',
      title: 'Showing selected photos and videos',
    });
  });

  it('shows loading before claiming the local library is empty', () => {
    expect(localLibraryStatusOf({ ...READY, state: 'loading' })?.title).toContain('Loading');
    expect(localLibraryStatusOf(READY)).toBeNull();
    expect(localLibraryStatusOf({ ...READY, state: 'unavailable' })).toBeNull();
  });

  it('keeps folder failures visible even when the rest of the local library loaded', () => {
    const error = 'Pictures: Access denied';
    expect(localLibraryStatusOf({ ...READY, error })).toMatchObject({
      action: 'retry',
      body: error,
    });
    expect(localLibraryStatusOf({ ...READY, state: 'error', error })).toMatchObject({
      action: 'retry',
      body: error,
    });
  });
});

it('wires the browse grant and retry actions independently of backup', () => {
  const requestAccess = vi.fn(() => Promise.resolve());
  const retry = vi.fn();
  const denied = LocalLibraryStatus({
    library: { ...READY, state: 'denied', access: 'none', requestAccess, retry },
  });
  if (!isValidElement<BannerProps>(denied))
    throw new Error('Expected the local browse permission banner');
  denied.props.action?.onPress?.();
  expect(requestAccess).toHaveBeenCalledTimes(1);
  const failed = LocalLibraryStatus({
    library: { ...READY, error: 'Videos: Access denied', requestAccess, retry },
  });
  if (!isValidElement<BannerProps>(failed))
    throw new Error('Expected the local browse retry banner');
  failed.props.action?.onPress?.();
  expect(retry).toHaveBeenCalledTimes(1);
});
