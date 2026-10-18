import { ipcMain, type IpcMainEvent, type MessagePortMain } from 'electron';
import { OVERLAY_ACTION } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { isAppOrigin } from '../origin.js';
import type { OverlayController } from './overlay-controller.js';
import { CALM_INTERVAL_MS } from './overlay-motion.js';
import {
  OVERLAY_CHANNELS,
  OVERLAY_LEVELS,
  OVERLAY_LEVELS_PORT_CHANNEL,
  OVERLAY_SIZE,
} from './overlay-messages.js';

const log = new Logger('desktop.overlay');

export type OverlayIpcTarget = Pick<
  OverlayController,
  'sizeFrom' | 'trayFrom' | 'holdFrom' | 'actFrom' | 'exitedFrom' | 'readyFrom' | 'levels'
>;

type Listener = (event: IpcMainEvent, value: unknown) => void;

function parsed<T>(schema: z.ZodType<T>, channel: string, value: unknown): T | null {
  const result = schema.safeParse(value);
  if (!result.success) {
    log.warn('overlay.message_refused', { channel, reason: z.prettifyError(result.error) });
    return null;
  }
  return result.data;
}

function pageListeners(controller: OverlayIpcTarget): Readonly<Record<string, Listener>> {
  return {
    [OVERLAY_CHANNELS.size]: (event, value): void => {
      const size = parsed(OVERLAY_SIZE, OVERLAY_CHANNELS.size, value);
      if (size !== null) controller.sizeFrom(event.sender.id, size);
    },
    [OVERLAY_CHANNELS.tray]: (event, value): void => {
      const open = parsed(z.boolean(), OVERLAY_CHANNELS.tray, value);
      if (open !== null) controller.trayFrom(event.sender.id, open);
    },
    [OVERLAY_CHANNELS.hold]: (event, value): void => {
      const active = parsed(z.boolean(), OVERLAY_CHANNELS.hold, value);
      if (active !== null) controller.holdFrom(event.sender.id, active);
    },
    [OVERLAY_CHANNELS.act]: (event, value): void => {
      const action = parsed(OVERLAY_ACTION, OVERLAY_CHANNELS.act, value);
      if (action !== null) controller.actFrom(event.sender.id, action);
    },
    [OVERLAY_CHANNELS.exited]: (event): void => {
      controller.exitedFrom(event.sender.id);
    },
    [OVERLAY_CHANNELS.ready]: (event): void => {
      controller.readyFrom(event.sender.id);
    },
  };
}

class LevelRelay {
  #port: MessagePortMain | null = null;
  #lastAt = 0;

  constructor(private readonly controller: OverlayIpcTarget) {}

  adopt(port: MessagePortMain): void {
    this.release();
    this.#port = port;
    port.on('message', (message) => {
      const levels = OVERLAY_LEVELS.safeParse(message.data);
      if (levels.success) {
        this.#lastAt = levels.data.at;
        this.controller.levels(levels.data);
      }
    });
    port.once('close', () => {
      if (this.#port === port) {
        this.release();
      }
    });
    port.start();
  }

  release(): void {
    const port = this.#port;
    this.#port = null;
    if (port !== null) {
      port.close();
      this.controller.levels({ in: 0, out: 0, at: this.#lastAt + CALM_INTERVAL_MS });
    }
  }
}

export function registerOverlayIpc(controller: OverlayIpcTarget, startUrl: string): () => void {
  const listeners = pageListeners(controller);
  Object.entries(listeners).forEach(([channel, listener]) => {
    ipcMain.on(channel, listener);
  });
  const relay = new LevelRelay(controller);
  const onPort = (event: IpcMainEvent): void => {
    if (!isAppOrigin(event.senderFrame?.url, startUrl)) {
      log.warn('overlay.levels_refused', { origin: event.senderFrame?.url ?? 'a destroyed frame' });
      return;
    }
    const [port] = event.ports;
    if (port !== undefined) {
      relay.adopt(port);
    }
  };
  ipcMain.on(OVERLAY_LEVELS_PORT_CHANNEL, onPort);
  return () => {
    Object.entries(listeners).forEach(([channel, listener]) => {
      ipcMain.removeListener(channel, listener);
    });
    ipcMain.removeListener(OVERLAY_LEVELS_PORT_CHANNEL, onPort);
    relay.release();
  };
}
