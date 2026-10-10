import type {
  DesktopTalkCommand,
  DesktopTalkShortcuts,
  DesktopTalkTray,
} from '@smarteverything/domain';
import type { BrowserWindow } from 'electron';
import type { DesktopTray } from '../tray.js';
import { revealWindow } from '../window.js';
import { electronTalkKeys } from './electron-shortcuts.js';
import { portalTalkKeys } from './portal-shortcuts.js';
import type { TalkKeys } from './talk-keys.js';

const COMMAND_CHANNEL = 'desktop:talk-command';

class TalkDesktopNotReadyError extends Error {
  override readonly name = 'TalkDesktopNotReadyError';

  constructor() {
    super('The walkie-talkie shortcuts start with the main window.');
  }
}

export class TalkDesktop {
  #window: BrowserWindow | null = null;
  #tray: DesktopTray | null = null;
  #keys: TalkKeys | null = null;

  attach(window: BrowserWindow, tray: DesktopTray): void {
    this.#window = window;
    this.#tray = tray;
    const sink = (command: DesktopTalkCommand): void => {
      this.send(command);
    };
    this.#keys = process.platform === 'linux' ? portalTalkKeys(sink) : electronTalkKeys(sink);
  }

  send(command: DesktopTalkCommand): void {
    const window = this.#window;
    if (window === null || window.isDestroyed()) {
      return;
    }
    if (command.kind === 'open') {
      revealWindow(window);
    }
    window.webContents.send(COMMAND_CHANNEL, command);
  }

  shortcuts(): DesktopTalkShortcuts {
    return this.keys().status();
  }

  configure(): Promise<DesktopTalkShortcuts> {
    return this.keys().configure();
  }

  tray(state: DesktopTalkTray): void {
    this.#tray?.talk(state);
  }

  stop(): void {
    this.#keys?.stop();
  }

  private keys(): TalkKeys {
    if (this.#keys === null) {
      throw new TalkDesktopNotReadyError();
    }
    return this.#keys;
  }
}
