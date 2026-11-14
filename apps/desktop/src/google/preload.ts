import { ipcRenderer } from 'electron';
import {
  DESKTOP_GOOGLE_ANSWER,
  DESKTOP_GOOGLE_OPENED,
  type DesktopGoogleLink,
} from '@smarteverything/domain';

export const googleLink: DesktopGoogleLink = {
  async open(): ReturnType<DesktopGoogleLink['open']> {
    return DESKTOP_GOOGLE_OPENED.parse(await ipcRenderer.invoke('desktop:google-link-open'));
  },
  async authorize(input): ReturnType<DesktopGoogleLink['authorize']> {
    return DESKTOP_GOOGLE_ANSWER.parse(
      await ipcRenderer.invoke('desktop:google-link-authorize', input),
    );
  },
  async cancel(): Promise<void> {
    await ipcRenderer.invoke('desktop:google-link-cancel');
  },
};
