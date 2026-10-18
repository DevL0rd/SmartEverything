import { globalShortcut } from 'electron';
import type { DesktopTalkCommand } from '@smarteverything/domain';
import {
  TALK_SHORTCUTS,
  talkShortcutStatus,
  type TalkCommandSink,
  type TalkShortcut,
  type TalkKeys,
} from './talk-keys.js';

function electronCommand(id: TalkShortcut['id']): DesktopTalkCommand {
  if (id === 'talk') {
    return { kind: 'toggle' };
  }
  if (id === 'next') {
    return { kind: 'next' };
  }
  return id === 'assistant_mute'
    ? { kind: 'assistant_mute' }
    : { kind: 'assistant', phase: 'toggle' };
}

export function electronTalkKeys(sink: TalkCommandSink): TalkKeys {
  const registered = TALK_SHORTCUTS.filter((shortcut) =>
    globalShortcut.register(shortcut.accelerator, () => {
      sink(electronCommand(shortcut.id));
    }),
  );
  const status = talkShortcutStatus(registered);
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
