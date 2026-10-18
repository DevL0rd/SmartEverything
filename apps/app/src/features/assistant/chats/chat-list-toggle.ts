import { useEffect } from 'react';
import { useKeyboard, type KeyPress } from '../../../app-shell/shortcuts';
import { ValueStore, useValue } from '../../../design/external-store';
import { localPref, setLocalPref } from '../../../store/local-prefs';

interface SlideOver {
  readonly capable: boolean;
  readonly open: boolean;
}

const slideOver = new ValueStore<SlideOver>({ capable: false, open: false });

export function toggleChatList(): void {
  const { capable, open } = slideOver.get();
  if (capable) {
    slideOver.set({ capable, open: !open });
    return;
  }
  setLocalPref('chatListOpen', !localPref('chatListOpen'));
}

export function closeChatListSlideOver(): void {
  slideOver.update((current) => ({ ...current, open: false }));
}

export function useChatListSlideOver(capable: boolean): boolean {
  useEffect(() => {
    slideOver.update((current) => ({ capable, open: capable && current.open }));
  }, [capable]);
  return useValue(slideOver).open && capable;
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
