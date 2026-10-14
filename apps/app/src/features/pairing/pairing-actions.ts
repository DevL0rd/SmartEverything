import { Logger } from '@smarteverything/logging';
import type { PairingInvitationParse } from '@smarteverything/domain';
import { PairingOnboarding } from '../../api/connection/pairing-onboarding';
import { pairingFromTyped, type PairingTarget } from '../../api/pairing-input';
import { clearPairingInvitation } from '../../api/pairing-invitation-import';
import type { StoredKind } from '../../api/transport';
import { ValueStore } from '../../design/external-store';
import { appPlatform } from '../../design/platform';
import { welcome } from './welcome';

const log = new Logger('app.pairing');
export type PairingMode = 'welcome' | 'nearby' | 'scan' | 'invitation' | 'code';
export function defaultDeviceName(kind: StoredKind): string {
  if (kind === 'phone') return 'Android phone';
  return appPlatform() === 'desktop' ? 'Desktop' : 'Browser';
}
export class PairingPresentation {
  readonly controller = new PairingOnboarding();
  readonly mode: ValueStore<PairingMode>;
  readonly code = new ValueStore('');
  readonly name: ValueStore<string>;
  readonly invitation = new ValueStore<PairingInvitationParse | null>(null);
  readonly problem = new ValueStore<string | null>(null);
  readonly busy = new ValueStore(false);
  readonly home = new ValueStore<string | null>(null);
  private previous: PairingMode = 'welcome';
  private version = 0;
  private stopping: Promise<void> = Promise.resolve();
  constructor(
    readonly kind: StoredKind,
    readonly fixedUrl: string | null,
  ) {
    this.name = new ValueStore(defaultDeviceName(kind));
    this.mode = new ValueStore<PairingMode>(fixedUrl === null ? 'welcome' : 'code');
  }
  start(): void {
    const version = this.version;
    void this.stopping.then(
      () => {
        if (version === this.version) this.controller.start();
      },
      (error: unknown) => {
        if (version === this.version) this.cleanupFailed(error);
      },
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
    this.problem.set('Your home could not be connected. Choose it again or scan its code.');
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
    this.clear();
    this.home.set(null);
    this.problem.set(null);
    this.busy.set(true);
    welcome.set(null);
    this.mode.set(mode);
    try {
      this.stopping = this.controller.stop();
      await this.stopping;
      if (version === this.version) this.controller.start();
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
    void this.change(this.previous);
  }
  select(url: string): void {
    if (this.busy.get()) return;
    this.previous = 'nearby';
    this.clear();
    this.problem.set(null);
    this.run(() => this.controller.select(url));
  }
  confirm(): void {
    if (this.busy.get()) return;
    this.problem.set(null);
    this.run(() => this.controller.confirmIdentity());
  }
  private run(action: () => Promise<void>): void {
    const version = this.version;
    this.busy.set(true);
    void action().then(
      () => {
        if (version === this.version) this.busy.set(false);
      },
      (error: unknown) => {
        if (version !== this.version) return;
        this.busy.set(false);
        this.failed(error);
      },
    );
  }
  async target(target: PairingTarget, scan: boolean): Promise<void> {
    if (this.busy.get()) return;
    this.previous = scan ? 'welcome' : 'invitation';
    const version = this.version;
    this.clear();
    this.problem.set(null);
    this.busy.set(true);
    try {
      await this.controller.useQr(target);
      if (version !== this.version || this.controller.state.get().status !== 'enrolling') return;
      if (scan) await this.claim(target.code, version);
      else {
        this.code.set(target.code);
        this.mode.set('code');
      }
    } catch (error) {
      if (version === this.version) this.failed(error);
    } finally {
      if (version === this.version) this.busy.set(false);
    }
  }
  submit(): void {
    if (this.busy.get()) return;
    const state = this.controller.state.get();
    const url =
      state.status === 'enrolling' && state.enrollment.status === 'ready'
        ? state.enrollment.destination.endpoint.url
        : this.fixedUrl;
    if (url === null) return;
    const input = pairingFromTyped(url, this.code.get(), false);
    this.code.set('');
    this.invitation.set(null);
    clearPairingInvitation();
    if (!input.ok) {
      this.problem.set(input.problem);
      return;
    }
    this.busy.set(true);
    this.problem.set(null);
    void this.submitTarget(input.target, state.status === 'choosing');
  }
  private async submitTarget(target: PairingTarget, prepare: boolean): Promise<void> {
    const version = this.version;
    try {
      if (prepare) await this.controller.useQr(target);
      if (version === this.version) await this.claim(target.code, version);
    } catch (error) {
      if (version === this.version) this.failed(error);
    } finally {
      if (version === this.version) this.busy.set(false);
    }
  }
  private async claim(code: string, version: number): Promise<void> {
    const name = this.name.get().trim();
    welcome.set({ role: null });
    try {
      const client = await this.controller.submit(
        code,
        name === '' ? defaultDeviceName(this.kind) : name,
      );
      welcome.set({ role: client.role });
    } catch (error) {
      if (version === this.version) welcome.set(null);
      throw error;
    }
  }
  recover(): void {
    if (this.busy.get()) return;
    const version = this.version;
    this.clear();
    this.busy.set(true);
    this.problem.set(null);
    welcome.set({ role: null });
    void this.controller.recover().then(
      (client) => {
        welcome.set({ role: client.role });
        this.busy.set(false);
      },
      (error: unknown) => {
        if (version !== this.version) return;
        welcome.set(null);
        this.busy.set(false);
        this.failed(error);
      },
    );
  }
  stop(): Promise<void> {
    this.version += 1;
    this.clear();
    this.busy.set(false);
    this.stopping = this.controller.stop();
    return this.stopping;
  }
}
