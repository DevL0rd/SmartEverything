import { useKeyboard, type KeyPress } from '../../../app-shell/shortcuts';
import { localPref, setLocalPref } from '../../../store/local-prefs';

export function toggleChatList(): void {
  setLocalPref('chatListOpen', !localPref('chatListOpen'));
}

export function useDraftKeys(): void {
  useKeyboard((press: KeyPress) => {
    if (press.command && !press.shift && press.key === '\\') {
      toggleChatList();
      return true;
    }
    return false;
  }, true);
}
