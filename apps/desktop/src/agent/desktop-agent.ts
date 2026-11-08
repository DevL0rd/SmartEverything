import { Logger } from '@smarteverything/logging';
import { sessionAgentDirectory } from '@smarteverything/hub/node/session-agent/location';
import { app, shell, systemPreferences } from 'electron';
import type { DisplayCapture } from '../display-capture.js';
import { readAgentEnvironment } from '../environment.js';
import { electronAgentActions } from './agent-actions.js';
import { startSessionAgent, type RunningAgent } from './agent-host.js';
import { RingWindow } from './ring-window.js';

const log = new Logger('desktop.main');

export async function startDesktopAgent(
  capture: DisplayCapture,
): Promise<RunningAgent | undefined> {
  const directory = sessionAgentDirectory(process.platform, {
    ...readAgentEnvironment(),
    home: app.getPath('home'),
  });
  if (directory === null) {
    log.warn('agent.no_location', { platform: process.platform });
    return undefined;
  }
  try {
    return await startSessionAgent({
      directory,
      platform: process.platform,
      actions: electronAgentActions({
        shell,
        ring: new RingWindow(),
        screen: capture,
        access: {
          screenRecording: () =>
            process.platform === 'darwin'
              ? systemPreferences.getMediaAccessStatus('screen') === 'granted'
              : null,
        },
        now: () => new Date(),
      }),
    });
  } catch (cause) {
    log.error('agent.start_failed', cause);
    return undefined;
  }
}
