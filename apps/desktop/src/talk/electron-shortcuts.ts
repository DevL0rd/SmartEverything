import type { DesktopTalkShortcuts } from '@smarteverything/domain';
import { globalShortcut } from 'electron';
import { TALK_SHORTCUTS, type TalkCommandSink, type TalkKeys } from './talk-keys.js';

function label(accelerator: string): string {
  return accelerator.replaceAll('+', ' ').replace('Control', 'Ctrl');
}

export function electronTalkKeys(sink: TalkCommandSink): TalkKeys {
  const registered = TALK_SHORTCUTS.filter((shortcut) =>
    globalShortcut.register(shortcut.accelerator, () => {
      sink(shortcut.id === 'talk' ? { kind: 'toggle' } : { kind: 'next' });
    }),
  );
  const missing = TALK_SHORTCUTS.filter((shortcut) => !registered.includes(shortcut));
  const status: DesktopTalkShortcuts = {
    backend: 'electron',
    hold: false,
    talk: registered.some((shortcut) => shortcut.id === 'talk') ? label('Control+Alt+Space') : null,
    next: registered.some((shortcut) => shortcut.id === 'next') ? label('Control+Alt+N') : null,
    problem:
      missing.length === 0
        ? null
        : `Another app already uses ${missing.map((shortcut) => label(shortcut.accelerator)).join(' and ')}`,
  };
  return {
    status: () => status,
    configure: () => Promise.resolve(status),
    stop: (): void => {
      registered.forEach((shortcut) => {
        globalShortcut.unregister(shortcut.accelerator);
      });
    },
  };
}
