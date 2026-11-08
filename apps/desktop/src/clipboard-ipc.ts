import { BrowserWindow, clipboard } from 'electron';
import { z } from 'zod';
import { background, Logger } from '@smarteverything/logging';
import {
  DESKTOP_CLIPBOARD_CHANGED,
  type DesktopInvokeChannel,
  type DesktopInvokeChannels,
} from '@smarteverything/domain';

const log = new Logger('desktop.clipboard');

export const CLIPBOARD_POLL_MS = 1500;

export type ClipboardHandle = <C extends DesktopInvokeChannel>(
  channel: C,
  handler: (
    argument: unknown,
  ) => DesktopInvokeChannels[C]['response'] | Promise<DesktopInvokeChannels[C]['response']>,
) => void;

export function registerClipboardIpc(
  handle: ClipboardHandle,
  pollMs: number = CLIPBOARD_POLL_MS,
): () => void {
  let seen: string | null = null;
  let stopped = false;

  handle('desktop:clipboard-read', async () => {
    const text = await clipboard.readText();
    return text === '' ? null : text;
  });

  handle('desktop:clipboard-write', async (argument) => {
    const text = z.string().parse(argument);
    await clipboard.writeText(text);
    seen = text;
    return undefined;
  });

  const poll = async (): Promise<void> => {
    const target = BrowserWindow.getFocusedWindow();
    if (target === null || target.webContents.isDestroyed()) return;
    const text = await clipboard.readText();
    if (stopped || target.webContents.isDestroyed()) return;
    if (seen === null) {
      seen = text;
      return;
    }
    if (text === '' || text === seen) return;
    seen = text;
    log.debug('clipboard.changed', { length: text.length });
    target.webContents.send(DESKTOP_CLIPBOARD_CHANGED, text);
  };

  const timer = setInterval(() => {
    background(poll(), 'clipboard.read_failed');
  }, pollMs);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
