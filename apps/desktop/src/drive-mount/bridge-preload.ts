import { ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  DESKTOP_DRIVE_CHANGED,
  DESKTOP_DRIVE_COMMAND,
  DESKTOP_DRIVE_STATE,
  type DesktopDrive,
} from '@smarteverything/domain';

const MAYBE_STATE = DESKTOP_DRIVE_STATE.nullable();

export const drive: DesktopDrive = {
  async state(): ReturnType<DesktopDrive['state']> {
    return MAYBE_STATE.parse(await ipcRenderer.invoke('desktop:drive-state'));
  },
  async run(command): ReturnType<DesktopDrive['run']> {
    const parsed = DESKTOP_DRIVE_COMMAND.parse(command);
    return DESKTOP_DRIVE_STATE.parse(await ipcRenderer.invoke('desktop:drive-run', parsed));
  },
  onChange(listener): () => void {
    const relay = (_event: IpcRendererEvent, value: unknown): void => {
      listener(MAYBE_STATE.parse(value));
    };
    ipcRenderer.on(DESKTOP_DRIVE_CHANGED, relay);
    return (): void => {
      ipcRenderer.removeListener(DESKTOP_DRIVE_CHANGED, relay);
    };
  },
};
