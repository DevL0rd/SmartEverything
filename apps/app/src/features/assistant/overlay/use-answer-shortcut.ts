import { useEffect } from 'react';
import { useDesktopTalk } from '../../talk';
import { answerShortcut } from './overlay-announce';

export function useAnswerShortcut(): void {
  const desktop = useDesktopTalk();
  const accelerator = desktop.status === 'ready' ? desktop.shortcuts.assistant : null;
  useEffect(() => {
    answerShortcut.set(accelerator);
  }, [accelerator]);
}
