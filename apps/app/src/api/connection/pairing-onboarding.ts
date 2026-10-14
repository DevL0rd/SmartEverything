import type {
  ClientRow,
  HubDiscoveryCandidate,
  HubPairingObservation,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { ValueStore } from '../../design/external-store';
import type { PairingTarget } from '../pairing-input';
import {
  cancelPairing,
  preparePairing,
  prepareQrPairing,
  recoverPairing,
  submitPairing,
} from './connection';
import { PairingDiscovery } from './pairing-discovery';
import { PairingInspection } from './pairing-inspection';
import {
  PairingBusyError,
  type EnrollmentState,
  type PairingEnrollment,
} from './pairing-enrollment';
import {
  PairingIdentityError,
  PairingCleanupError,
  releasePairingResources,
} from './pairing-transport';

const log = new Logger('app.pairing');
interface Selection {
  readonly candidate: HubDiscoveryCandidate;
  readonly generation: number;
}
export type PairingOnboardingState =
  | { readonly status: 'choosing'; readonly problem: string | null }
  | { readonly status: 'inspecting'; readonly candidate: HubDiscoveryCandidate }
  | {
      readonly status: 'observed';
      readonly candidate: HubDiscoveryCandidate;
      readonly observation: HubPairingObservation;
    }
  | { readonly status: 'enrolling'; readonly enrollment: EnrollmentState }
  | { readonly status: 'complete'; readonly client: ClientRow };
export class PairingOnboarding {
  readonly state = new ValueStore<PairingOnboardingState>({ status: 'choosing', problem: null });
  readonly discovery = new PairingDiscovery((retired) => {
    this.discoveryChanged(retired);
  });
  private readonly inspection = new PairingInspection();
  private readonly owner = Symbol();
  private selection: Selection | null = null;
  private version = 0;
  private enrollment: PairingEnrollment | null = null;
  private unsubscribe: (() => void) | null = null;
  private ownsEnrollment = false;
  private claiming = false;
  private retiring: Promise<void> = Promise.resolve();
  start(): void {
    this.discovery.start();
  }
  private discoveryChanged(retired: boolean): void {
    const selected = this.selection;
    if (selected === null) {
      if (retired && this.ownsEnrollment)
        void this.chooseAgain('Your connection changed. Choose your home again.').catch(
          (error: unknown) => {
            this.cleanupFailed(error);
          },
        );
      return;
    }
    if (!retired && this.discovery.isCurrent(selected.candidate, selected.generation)) return;
    const message = 'That home is no longer available. Search again or scan its code.';
    void this.chooseAgain(message).catch((error: unknown) => {
      this.cleanupFailed(error);
    });
  }
  private cleanupFailed(error: unknown): void {
    log.warn('pairing.cleanup_failed', {
      failure: error instanceof Error ? error.name : 'NativeFailure',
      ...(error instanceof PairingCleanupError
        ? { operations: error.failures.map((failure) => failure.operation) }
        : {}),
    });
  }
  private current(version: number): boolean {
    return version === this.version;
  }
  async select(url: string): Promise<void> {
    if (this.claiming) throw new PairingBusyError();
    const retiring = this.chooseAgain();
    const version = this.version;
    await retiring;
    if (!this.current(version)) return;
    const selected = this.discovery.selected(url);
    if (selected === null) throw new PairingIdentityError();
    this.selection = selected;
    this.state.set({ status: 'inspecting', candidate: selected.candidate });
    try {
      const observation = await this.inspection.inspect(
        selected.candidate,
        selected.generation,
        () =>
          this.current(version) &&
          this.discovery.isCurrent(selected.candidate, selected.generation),
      );
      if (this.current(version))
        this.state.set({ status: 'observed', candidate: selected.candidate, observation });
    } catch (error) {
      if (this.current(version))
        await this.chooseAgain('Your home could not be checked. Search again or scan its code.');
      throw error;
    }
  }
  async confirmIdentity(): Promise<void> {
    const state = this.state.get();
    const selected = this.selection;
    if (
      state.status !== 'observed' ||
      selected === null ||
      !this.discovery.isCurrent(selected.candidate, selected.generation)
    )
      throw new PairingIdentityError();
    await this.prepare(
      this.inspection.confirm(state.observation, selected.candidate),
      this.version,
    );
  }
  async useQr(target: PairingTarget): Promise<void> {
    if (this.claiming) throw new PairingBusyError();
    const retiring = this.chooseAgain();
    const version = this.version;
    await retiring;
    if (!this.current(version)) return;
    this.ownsEnrollment = true;
    this.state.set({ status: 'enrolling', enrollment: { status: 'verifying' } });
    try {
      const enrollment = await prepareQrPairing(
        target,
        (): Promise<void> => this.discovery.stop(false),
        this.owner,
        (): boolean => this.current(version),
      );
      if (this.current(version)) this.follow(enrollment);
    } catch (error) {
      if (this.current(version))
        await this.chooseAgain('Your home could not be checked. Search again or scan its code.');
      throw error;
    }
  }
  private async prepare(
    destination: Parameters<typeof preparePairing>[0],
    version: number,
  ): Promise<void> {
    this.ownsEnrollment = true;
    this.state.set({ status: 'enrolling', enrollment: { status: 'verifying' } });
    try {
      const enrollment = await preparePairing(
        destination,
        (): Promise<void> => this.discovery.stop(false),
        this.owner,
      );
      if (!this.current(version)) return;
      this.follow(enrollment);
    } catch (error) {
      if (this.current(version))
        await this.chooseAgain(
          'The identities do not match. Scan its code, or choose another home.',
        );
      throw error;
    }
  }
  private follow(enrollment: PairingEnrollment): void {
    this.enrollment = enrollment;
    const publish = (): void => {
      this.state.set({ status: 'enrolling', enrollment: enrollment.state.get() });
    };
    this.unsubscribe = enrollment.state.subscribe(publish);
    publish();
  }
  submit(code: string, name: string): Promise<ClientRow> {
    return this.finish((enrollment): Promise<ClientRow> => submitPairing(enrollment, code, name));
  }
  recover(): Promise<ClientRow> {
    return this.finish((enrollment): Promise<ClientRow> => recoverPairing(enrollment));
  }
  private async finish(
    action: (enrollment: PairingEnrollment) => Promise<ClientRow>,
  ): Promise<ClientRow> {
    if (this.claiming || this.enrollment === null) throw new PairingBusyError();
    this.claiming = true;
    try {
      const client = await action(this.enrollment);
      this.selection = null;
      this.ownsEnrollment = false;
      this.state.set({ status: 'complete', client });
      return client;
    } finally {
      this.claiming = false;
    }
  }
  chooseAgain(problem: string | null = null): Promise<void> {
    this.version += 1;
    this.selection = null;
    this.enrollment = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.state.set({
      status: 'choosing',
      problem: this.claiming
        ? 'Pairing may have finished. Check Paired devices on your desktop before showing a new code.'
        : problem,
    });
    const owned = this.ownsEnrollment;
    this.ownsEnrollment = false;
    const retire = (): Promise<void> =>
      releasePairingResources([
        { operation: 'inspection', release: (): Promise<void> => this.inspection.cancel() },
        {
          operation: 'enrollment',
          release: (): Promise<void> => (owned ? cancelPairing(this.owner) : Promise.resolve()),
        },
      ]);
    this.retiring = this.retiring.then(retire, retire);
    return this.retiring;
  }
  async stop(): Promise<void> {
    await releasePairingResources([
      { operation: 'retirement', release: (): Promise<void> => this.chooseAgain() },
      { operation: 'discovery', release: (): Promise<void> => this.discovery.stop(false) },
    ]);
  }
}
