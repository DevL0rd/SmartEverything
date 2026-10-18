import type { DesktopPlatform } from '@smarteverything/domain';
import { dialog } from 'electron';

const MANAGER_DESCRIPTION: Readonly<Record<DesktopPlatform, string>> = {
  linux:
    'a systemd user service, smarteverything.service, that keeps running before anyone signs in',
  darwin: 'a launchd agent for your account, app.smarteverything.server',
  win32: 'a hidden entry that starts it when you sign in, without administrator rights',
};

export interface FirstRun {
  readonly platform: DesktopPlatform;
  readonly dataDirectory: string;
}

export async function confirmServiceInstall(setup: FirstRun): Promise<boolean> {
  const answer = await dialog.showMessageBox({
    type: 'info',
    title: 'Set up SmartEverything',
    message: 'SmartEverything runs its server in the background',
    detail:
      'The server keeps your devices, automations, cameras and phone connected even when this window is closed. ' +
      `It is installed as ${MANAGER_DESCRIPTION[setup.platform]}, runs as you, and keeps its data in ${setup.dataDirectory}. ` +
      'You can stop, restart or remove it in Settings.',
    buttons: ['Install and start the server', 'Quit'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  return answer.response === 0;
}

export function showServiceFailure(error: unknown, logLines: readonly string[]): void {
  const reason = error instanceof Error ? error.message : String(error);
  const log = logLines.length === 0 ? '' : `\n\nLast log lines:\n${logLines.slice(-12).join('\n')}`;
  dialog.showErrorBox('The SmartEverything server did not start', `${reason}${log}`);
}
