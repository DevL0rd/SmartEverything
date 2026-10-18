import type { DesktopTalkCommand, DesktopTalkShortcuts } from '@smarteverything/domain';

export interface TalkShortcut {
  readonly id: 'talk' | 'next' | 'assistant' | 'assistant_mute';
  readonly description: string;
  readonly preferredTrigger: string;
  readonly accelerator: string;
}

export const TALK_SHORTCUTS: readonly TalkShortcut[] = [
  {
    id: 'talk',
    description: 'Talk on the walkie-talkie',
    preferredTrigger: 'CTRL+ALT+space',
    accelerator: 'Control+Alt+Space',
  },
  {
    id: 'next',
    description: 'Next walkie-talkie channel',
    preferredTrigger: 'CTRL+ALT+N',
    accelerator: 'Control+Alt+N',
  },
  {
    id: 'assistant',
    description: 'Talk to the AI',
    preferredTrigger: 'CTRL+ALT+A',
    accelerator: 'Control+Alt+A',
  },
  {
    id: 'assistant_mute',
    description: 'Mute the AI call',
    preferredTrigger: 'CTRL+ALT+M',
    accelerator: 'Control+Alt+M',
  },
];

function acceleratorLabel(shortcut: TalkShortcut): string {
  return shortcut.accelerator.replaceAll('+', ' ').replace('Control', 'Ctrl');
}

export function talkShortcutStatus(registered: readonly TalkShortcut[]): DesktopTalkShortcuts {
  const labelOf = (id: TalkShortcut['id']): string | null => {
    const shortcut = registered.find((candidate) => candidate.id === id);
    return shortcut === undefined ? null : acceleratorLabel(shortcut);
  };
  const missing = TALK_SHORTCUTS.filter((shortcut) => !registered.includes(shortcut));
  return {
    backend: 'electron',
    hold: false,
    talk: labelOf('talk'),
    next: labelOf('next'),
    assistant: labelOf('assistant'),
    assistantMute: labelOf('assistant_mute'),
    problem:
      missing.length === 0
        ? null
        : `Another app already uses ${missing.map(acceleratorLabel).join(' and ')}`,
  };
}

export type TalkCommandSink = (command: DesktopTalkCommand) => void;

export interface TalkKeys {
  readonly status: () => DesktopTalkShortcuts;
  readonly configure: () => Promise<DesktopTalkShortcuts>;
  readonly stop: () => void;
}
