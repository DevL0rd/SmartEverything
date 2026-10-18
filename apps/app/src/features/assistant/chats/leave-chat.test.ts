import { beforeEach, describe, expect, it } from 'vitest';
import { router } from '../../../test-support/expo-router';
import { leaveChat, leaveToChatList } from './leave-chat';

beforeEach(() => {
  router.back.mockClear();
  router.replace.mockClear();
  router.canGoBack.mockReset();
});

describe('leaving a chat', () => {
  it('goes back when there is a screen to go back to', () => {
    router.canGoBack.mockReturnValue(true);
    leaveChat();
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('opens the chat list when the chat was a deep link with nothing behind it', () => {
    router.canGoBack.mockReturnValue(false);
    leaveChat();
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/assistant');
  });

  it('opens the chat list from the split view without going back out of the assistant', () => {
    router.canGoBack.mockReturnValue(true);
    leaveToChatList();
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/assistant');
  });
});
