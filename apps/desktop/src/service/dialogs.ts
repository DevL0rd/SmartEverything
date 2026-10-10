import type { DesktopFfmpeg, DesktopPlatform } from '@smarteverything/domain';
import { dialog } from 'electron';

const MANAGER_DESCRIPTION: Readonly<Record<DesktopPlatform, string>> = {
  linux: 'a systemd user service, smarteverything.service',
  darwin: 'a launchd agent for your account, app.smarteverything.server',
  win32: 'a hidden entry that starts it when you sign in, without administrator rights',
};

export interface FirstRun {
  readonly platform: DesktopPlatform;
  readonly dataDirectory: string;
  readonly ffmpeg: DesktopFfmpeg;
}

export async function confirmServiceInstall(setup: FirstRun): Promise<boolean> {
  const ffmpeg = setup.ffmpeg.found
    ? ''
    : `\n\nffmpeg is not installed. Cameras need it for snapshots and clips. ${setup.ffmpeg.instructions}`;
  const answer = await dialog.showMessageBox({
    type: 'info',
    title: 'Set up SmartEverything',
    message: 'SmartEverything runs its server in the background',
    detail:
      'The server keeps your devices, automations, cameras and phone connected even when this window is closed. ' +
      `It is installed as ${MANAGER_DESCRIPTION[setup.platform]}, runs as you, and keeps its data in ${setup.dataDirectory}. ` +
      'You can stop, restart or remove it in Settings.' +
      ffmpeg,
    buttons: ['Install and start the server', 'Quit'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  return answer.response === 0;
}

export async function offerLinger(user: string): Promise<boolean> {
  const answer = await dialog.showMessageBox({
    type: 'question',
    title: 'Keep the server running when you sign out',
    message: 'Keep the server running when nobody is signed in?',
    detail:
      'systemd stops your user services when you sign out, and starts them again only when you sign in. ' +
      'Lingering keeps the SmartEverything server running all the time, including after a restart before anyone signs in. ' +
      `This runs "loginctl enable-linger ${user}" for your account only. You can turn it on later in Settings.`,
    buttons: ['Keep it running', 'Not now'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  return answer.response === 0;
}

export function showFfmpegMissing(ffmpeg: DesktopFfmpeg): void {
  void dialog.showMessageBox({
    type: 'warning',
    title: 'ffmpeg is missing',
    message: 'Camera snapshots and clips need ffmpeg',
    detail: ffmpeg.instructions,
    buttons: ['OK'],
    noLink: true,
  });
}

export function showServiceFailure(error: unknown, logLines: readonly string[]): void {
  const reason = error instanceof Error ? error.message : String(error);
  const log = logLines.length === 0 ? '' : `\n\nLast log lines:\n${logLines.slice(-12).join('\n')}`;
  dialog.showErrorBox('The SmartEverything server did not start', `${reason}${log}`);
}
