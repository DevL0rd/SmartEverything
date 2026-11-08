import { Logger } from '@smarteverything/logging';
import { app } from 'electron';
import { reportFailure } from './failure.js';
import { startLinuxSchemeRegistration } from './linux-scheme.js';
import { DEEP_LINK_SCHEME } from './origin.js';

const log = new Logger('desktop.main');

export function registerDeepLinkScheme(): void {
  if (!app.isPackaged) {
    return;
  }
  if (process.platform === 'linux') {
    startLinuxSchemeRegistration();
    return;
  }
  const registered = app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
  log.debug('deep_link.scheme_registered', { scheme: DEEP_LINK_SCHEME, registered });
  if (!registered) {
    reportFailure('Sign-in links will not open SmartEverything', {
      expected: `${DEEP_LINK_SCHEME}:// registered to this app`,
      received: 'the operating system refused the registration',
    });
  }
}
