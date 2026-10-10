import type { DesktopTalkCommand, DesktopTalkShortcuts } from '@smarteverything/domain';

export interface TalkShortcut {
  readonly id: 'talk' | 'next';
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
];

export type TalkCommandSink = (command: DesktopTalkCommand) => void;

export interface TalkKeys {
  readonly status: () => DesktopTalkShortcuts;
  readonly configure: () => Promise<DesktopTalkShortcuts>;
  readonly stop: () => void;
}
