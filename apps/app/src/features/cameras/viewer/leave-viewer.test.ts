import { beforeEach, describe, expect, it } from 'vitest';
import { router } from '../../../test-support/expo-router';
import { leaveViewer } from './leave-viewer';

beforeEach(() => {
  router.back.mockClear();
  router.replace.mockClear();
  router.canGoBack.mockReset();
});

describe('leaving the camera viewer', () => {
  it('goes back when there is a screen behind it', () => {
    router.canGoBack.mockReturnValue(true);
    leaveViewer();
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('opens the cameras when it was opened from a notification, search or a link', () => {
    router.canGoBack.mockReturnValue(false);
    leaveViewer();
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/cameras');
  });
});
