import { background, type Logger } from '@smarteverything/logging';
import { NodeFailureError } from '../../node-failure';
import type { PortalBus } from './portal-request';
import { openPortalSession, type PortalSession } from './portal-session';
import type { RestoreTokenStore } from './portal-token';

const WAITING =
  'Remote control needs a one-time approval on this computer. A dialog is open on its screen: ask the person there to allow it, then try again.';

export interface PortalGrantOptions {
  readonly bus: () => PortalBus;
  readonly tokens: RestoreTokenStore;
  readonly log: Logger;
}

interface Opened {
  readonly bus: PortalBus;
  readonly session: PortalSession;
  readonly stop: () => void;
}

export class PortalGrant {
  private opened: Opened | null = null;
  private starting: Promise<PortalSession> | null = null;

  constructor(private readonly options: PortalGrantOptions) {}

  async obtain(): Promise<PortalSession> {
    const bus = this.options.bus();
    if (this.opened !== null && this.opened.bus === bus) return this.opened.session;
    this.forget();
    const token = await this.options.tokens.read();
    const fresh = this.starting === null;
    this.starting ??= this.begin(bus, token);
    if (token !== null) return this.starting;
    if (fresh) background(this.starting, 'node.input_grant_failed');
    throw new NodeFailureError('not_permitted', WAITING);
  }

  forget(): void {
    this.opened?.stop();
    this.opened = null;
  }

  private begin(bus: PortalBus, token: string | null): Promise<PortalSession> {
    const starting = this.open(bus, token).finally(() => {
      this.starting = null;
    });
    return starting;
  }

  private async open(bus: PortalBus, token: string | null): Promise<PortalSession> {
    const { session, restoreToken } = await openPortalSession(bus, token);
    if (restoreToken !== null && restoreToken !== token) {
      await this.options.tokens.write(restoreToken);
    }
    const stop = await session.watchClosed(() => {
      this.options.log.info('input.session_closed', {});
      this.forget();
    });
    this.opened = { bus, session, stop };
    this.options.log.info('input.granted', { screens: session.streams.length });
    return session;
  }
}
