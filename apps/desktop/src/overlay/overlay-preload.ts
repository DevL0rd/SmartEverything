import electron from 'electron';
import { z } from 'zod';
import {
  OVERLAY_CHANNELS,
  OVERLAY_LEVELS,
  OVERLAY_PAGE_STATE,
  OVERLAY_ROLE,
  OVERLAY_ROLE_ARGUMENT,
  type OverlayBridge,
} from './overlay-messages.js';

function listen<T>(channel: string, schema: z.ZodType<T>, receive: (value: T) => void): () => void {
  const forward = (_event: unknown, value: unknown): void => {
    const result = schema.safeParse(value);
    if (result.success) {
      receive(result.data);
      return;
    }
    throw new Error(`overlay message on ${channel} refused: ${z.prettifyError(result.error)}`);
  };
  electron.ipcRenderer.on(channel, forward);
  return () => {
    electron.ipcRenderer.removeListener(channel, forward);
  };
}

function roleOfProcess(): OverlayBridge['role'] {
  const argument = process.argv.find((candidate) => candidate.startsWith(OVERLAY_ROLE_ARGUMENT));
  return OVERLAY_ROLE.parse(argument?.slice(OVERLAY_ROLE_ARGUMENT.length));
}

const bridge: OverlayBridge = {
  role: roleOfProcess(),
  onState: (listener) => listen(OVERLAY_CHANNELS.state, OVERLAY_PAGE_STATE, listener),
  onLevels: (listener) => listen(OVERLAY_CHANNELS.levels, OVERLAY_LEVELS, listener),
  act: (action) => {
    electron.ipcRenderer.send(OVERLAY_CHANNELS.act, action);
  },
  size: (size) => {
    electron.ipcRenderer.send(OVERLAY_CHANNELS.size, size);
  },
  tray: (open) => {
    electron.ipcRenderer.send(OVERLAY_CHANNELS.tray, open);
  },
  hold: (active) => {
    electron.ipcRenderer.send(OVERLAY_CHANNELS.hold, active);
  },
  exited: () => {
    electron.ipcRenderer.send(OVERLAY_CHANNELS.exited);
  },
  ready: () => {
    electron.ipcRenderer.send(OVERLAY_CHANNELS.ready);
  },
};

electron.contextBridge.exposeInMainWorld('overlay', bridge);
