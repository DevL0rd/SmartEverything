import { beforeEach, describe, expect, it } from 'vitest';
import { router } from '../test-support/expo-router';
import { closeFlow } from './close-flow';

beforeEach(() => {
  router.back.mockClear();
  router.replace.mockClear();
  router.canGoBack.mockReset();
});

describe('closing a flow', () => {
  it('goes back when there is a screen behind the flow', () => {
    router.canGoBack.mockReturnValue(true);
    closeFlow('/settings');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('opens the fallback when the flow was opened from a link with no history', () => {
    router.canGoBack.mockReturnValue(false);
    closeFlow('/settings');
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/settings');
  });
});
