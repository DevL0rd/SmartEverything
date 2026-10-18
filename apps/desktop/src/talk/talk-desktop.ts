import type {
  DesktopTalkCommand,
  DesktopTalkShortcuts,
  DesktopTalkTray,
} from '@smarteverything/domain';
import { isDeepStrictEqual } from 'node:util';
import { Logger } from '@smarteverything/logging';
import type { BrowserWindow } from 'electron';
import type { DesktopTray } from '../tray.js';
import { revealWindow } from '../window.js';
import { electronTalkKeys } from './electron-shortcuts.js';
import { portalTalkKeys } from './portal-shortcuts.js';
import type { TalkKeys } from './talk-keys.js';

const log = new Logger('desktop.talk');

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
  #shown: DesktopTalkTray | null = null;
  #takes: ((command: DesktopTalkCommand) => boolean) | null = null;

  attach(window: BrowserWindow, tray: DesktopTray): void {
    this.#window = window;
    this.#tray = tray;
    const sink = (command: DesktopTalkCommand): void => {
      this.send(command);
    };
    log.info('talk.attached', { keys: process.platform === 'linux' ? 'portal' : 'electron' });
    this.#keys = process.platform === 'linux' ? portalTalkKeys(sink) : electronTalkKeys(sink);
  }

  takeFirst(takes: (command: DesktopTalkCommand) => boolean): void {
    this.#takes = takes;
  }

  send(command: DesktopTalkCommand): void {
    if (this.#takes?.(command) === true) {
      log.debug('talk.command_taken', { kind: command.kind });
      return;
    }
    const window = this.#window;
    if (window === null || window.isDestroyed()) {
      log.debug('talk.command_dropped', { kind: command.kind, reason: 'no_window' });
      return;
    }
    log.debug('talk.command_sent', { kind: command.kind });
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
    const previous = this.#shown;
    if (previous !== null && isDeepStrictEqual(previous, state)) {
      return;
    }
    this.#shown = state;
    log.debug('talk.tray_changed', { activity: state.activity, channels: state.channels.length });
    this.#tray?.talk(state);
  }

  stop(): void {
    log.info('talk.stopped', { hadKeys: this.#keys !== null });
    this.#keys?.stop();
  }

  private keys(): TalkKeys {
    if (this.#keys === null) {
      throw new TalkDesktopNotReadyError();
    }
    return this.#keys;
  }
}
