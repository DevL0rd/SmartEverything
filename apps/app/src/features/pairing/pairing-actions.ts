import { Logger, background } from '@smarteverything/logging';
import type { PairingInvitationParse } from '@smarteverything/domain';
import { pairingHost } from '../../api/connection/connection';
import { pairingMessage } from '../../api/connection/pairing-errors';
import { PairingSession } from '../../api/connection/pairing-session';
import { pairingCodeFrom, type PairingTarget } from '../../api/pairing-input';
import { clearPairingInvitation } from '../../api/pairing-invitation-import';
import type { StoredKind } from '../../api/transport';
import { ValueStore } from '../../design/external-store';
import { appPlatform } from '../../design/platform';
import { welcome } from './welcome';

const log = new Logger('app.pairing');
export type PairingMode = 'welcome' | 'nearby' | 'scan' | 'invitation' | 'code';
function defaultDeviceName(kind: StoredKind): string {
  if (kind === 'phone') return 'Android phone';
  return appPlatform() === 'desktop' ? 'Desktop' : 'Browser';
}
export class PairingPresentation {
  readonly controller = new PairingSession(pairingHost);
  readonly mode: ValueStore<PairingMode>;
  readonly code = new ValueStore('');
  readonly name: ValueStore<string>;
  readonly invitation = new ValueStore<PairingInvitationParse | null>(null);
  readonly problem = new ValueStore<string | null>(null);
  readonly busy = new ValueStore(false);
  private previous: PairingMode = 'welcome';
  private version = 0;
  private stopping: Promise<void> = Promise.resolve();
  constructor(
    readonly kind: StoredKind,
    readonly fixedUrl: string | null,
  ) {
    this.name = new ValueStore(defaultDeviceName(kind));
    this.mode = new ValueStore<PairingMode>(fixedUrl === null ? 'welcome' : 'code');
    log.info('pairing.presentation_created', {
      kind,
      fixedUrl: fixedUrl !== null,
      mode: this.mode.get(),
    });
  }
  start(): void {
    const version = this.version;
    log.debug('pairing.start_requested', { version });
    background(
      this.stopping.then(
        () => {
          if (version === this.version) this.controller.start();
        },
        (error: unknown) => {
          if (version === this.version) this.cleanupFailed(error);
        },
      ),
      'pairing_actions.background_failed',
    );
  }
  clear(): void {
    this.code.set('');
    this.invitation.set(null);
    clearPairingInvitation();
  }
  private failed(error: unknown): void {
    log.warn('pairing.presentation_failed', {
      failure: error instanceof Error ? error.name : 'NativeFailure',
    });
    this.problem.set(pairingMessage(error));
  }
  cleanupFailed(error: unknown): void {
    log.warn('pairing.cleanup_failed', {
      failure: error instanceof Error ? error.name : 'NativeFailure',
    });
    this.problem.set('The connection could not be closed. Try again before continuing.');
  }
  async change(mode: PairingMode): Promise<void> {
    this.version += 1;
    const version = this.version;
    log.info('pairing.mode_changing', { from: this.mode.get(), to: mode, version });
    this.clear();
    this.problem.set(null);
    this.busy.set(true);
    welcome.set(null);
    this.mode.set(mode);
    try {
      this.stopping = this.controller.stop();
      await this.stopping;
      if (version === this.version) this.controller.start();
      else log.debug('pairing.mode_change_superseded', { version, current: this.version });
    } catch (error) {
      if (version === this.version) this.cleanupFailed(error);
    } finally {
      if (version === this.version) this.busy.set(false);
    }
  }
  async imported(invitation: PairingInvitationParse): Promise<void> {
    const changing = this.change('invitation');
    const version = this.version;
    await changing;
    if (version === this.version && this.problem.get() === null) this.invitation.set(invitation);
  }
  back(): void {
    background(this.change(this.previous), 'pairing_actions.change_failed');
  }
  select(url: string): void {
    if (this.busy.get()) {
      log.debug('pairing.select_ignored', { reason: 'busy' });
      return;
    }
    log.info('pairing.server_selected');
    this.previous = 'nearby';
    this.clear();
    this.problem.set(null);
    background(
      this.guarded(() => this.controller.select(url)),
      'pairing_actions.guarded_failed',
    );
  }
  async target(target: PairingTarget, scan: boolean): Promise<void> {
    if (this.busy.get()) {
      log.debug('pairing.target_ignored', { reason: 'busy', scan });
      return;
    }
    log.info('pairing.target_received', { scan, codeLength: target.code.length });
    this.previous = scan ? 'welcome' : 'invitation';
    this.clear();
    this.problem.set(null);
    await this.guarded(async (version) => {
      await this.controller.useQr(target);
      if (version !== this.version || this.controller.state.get().status !== 'ready') return;
      if (scan) await this.claim(target.code, version);
      else {
        this.code.set(target.code);
        this.mode.set('code');
      }
    });
  }
  submit(): void {
    if (this.busy.get()) {
      log.debug('pairing.submit_ignored', { reason: 'busy' });
      return;
    }
    const input = pairingCodeFrom(this.code.get());
    const prepare = this.controller.state.get().status === 'choosing' && this.fixedUrl !== null;
    this.clear();
    if (!input.ok) {
      log.info('pairing.code_rejected', { length: this.code.get().length });
      this.problem.set(input.problem);
      return;
    }
    log.info('pairing.submit_started', { prepare, fixedUrl: this.fixedUrl !== null });
    this.problem.set(null);
    const { fixedUrl } = this;
    background(
      this.guarded(async (version) => {
        if (prepare && fixedUrl !== null) await this.controller.useAddress(fixedUrl);
        if (version === this.version && this.controller.state.get().status === 'ready')
          await this.claim(input.code, version);
      }),
      'pairing_actions.guarded_failed',
    );
  }
  recover(): void {
    if (this.busy.get()) {
      log.debug('pairing.recover_ignored', { reason: 'busy' });
      return;
    }
    log.info('pairing.recover_started');
    this.clear();
    this.problem.set(null);
    background(
      this.guarded((version) => this.finishing(version, () => this.controller.recover())),
      'pairing_actions.guarded_failed',
    );
  }
  private async guarded(action: (version: number) => Promise<void>): Promise<void> {
    const version = this.version;
    const startedAt = Date.now();
    this.busy.set(true);
    try {
      await action(version);
      log.debug('pairing.action_finished', () => ({
        version,
        status: this.controller.state.get().status,
        durationMs: Date.now() - startedAt,
      }));
    } catch (error) {
      log.warn('pairing.action_failed', {
        version,
        current: version === this.version,
        error: error instanceof Error ? error.name : typeof error,
        durationMs: Date.now() - startedAt,
      });
      if (version === this.version) this.failed(error);
    } finally {
      if (version === this.version) this.busy.set(false);
    }
  }
  private claim(code: string, version: number): Promise<void> {
    const name = this.name.get().trim();
    return this.finishing(version, () =>
      this.controller.submit(code, name === '' ? defaultDeviceName(this.kind) : name),
    );
  }
  private async finishing(version: number, action: () => Promise<void>): Promise<void> {
    welcome.set({ role: null });
    try {
      await action();
    } finally {
      const state = this.controller.state.get();
      log.info('pairing.claim_finished', {
        status: state.status,
        role: state.status === 'complete' ? state.client.role : null,
      });
      if (state.status === 'complete') welcome.set({ role: state.client.role });
      else if (version === this.version) welcome.set(null);
    }
  }
  stop(): Promise<void> {
    this.version += 1;
    log.debug('pairing.stopping', { version: this.version });
    this.clear();
    this.busy.set(false);
    this.stopping = this.controller.stop();
    return this.stopping;
  }
}
