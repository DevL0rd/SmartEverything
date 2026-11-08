import type { PhotosBackupPref } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { Ledger } from '../model/ledger';
import { blockedBy, type PauseReason } from '../model/conditions';
import { patchBackupStatus } from '../model/status';
import { BackupCycle, scopeOf, type CycleEnd } from './cycle';
import { findFreeable, freeUp, type Freeable, type FreeableResult } from './free-up';
import { loadLedger, loadPaused, savePaused } from './ledger-store';
import type { BackupPorts } from './ports';

const log = new Logger('app.photos');

interface Hold {
  readonly phase: 'unavailable' | 'off' | 'denied' | 'paused';
  readonly pauseReason: PauseReason | null;
}

export class BackupRunner {
  private readonly lifetime = new AbortController();
  private stopped = false;
  private running: Promise<void> | null = null;
  private again = false;
  private paused: boolean | null = null;
  private pauseWrites: Promise<void> = Promise.resolve();
  private ledger: Ledger | null = null;
  private controller: AbortController | null = null;
  private registered: string | null = null;
  private seenSettings: string | null = null;
  private stale = false;

  constructor(private readonly ports: BackupPorts) {}

  request(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running !== null) {
      this.again = true;
      return this.running;
    }
    const loop = this.loop().finally(() => {
      this.running = null;
    });
    this.running = loop;
    return loop;
  }

  whenIdle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  stop(): Promise<void> {
    this.stopped = true;
    this.lifetime.abort();
    this.again = false;
    this.stale = true;
    this.controller?.abort();
    return Promise.all([this.whenIdle(), this.pauseWrites]).then(() => undefined);
  }

  restart(): Promise<void> {
    this.stale = true;
    this.controller?.abort();
    return this.request();
  }

  async conditionsChanged(): Promise<void> {
    const blocked = blockedBy(this.ports.settings.read(), await this.ports.conditions.read());
    return blocked === null ? this.request() : this.restart();
  }

  settingsChanged(): Promise<void> {
    return JSON.stringify(this.ports.settings.read()) === this.seenSettings
      ? this.request()
      : this.restart();
  }

  async findFreeable(): Promise<FreeableResult> {
    if (this.stopped) return { kind: 'unsupported' };
    return findFreeable(this.ports, await this.ledgerOf(), this.lifetime.signal);
  }

  async freeUp(freeable: Freeable): Promise<boolean> {
    if (this.stopped) return false;
    return freeUp(this.ports, await this.ledgerOf(), freeable, this.lifetime.signal);
  }

  pause(): Promise<void> {
    return this.changePaused(true);
  }

  resume(): Promise<void> {
    return this.changePaused(false);
  }

  private changePaused(paused: boolean): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.paused = paused;
    if (paused) {
      this.stale = true;
      this.controller?.abort();
      this.show({ phase: 'paused', pauseReason: 'user' });
    }
    const save = (): Promise<void> => savePaused(this.ports.storage, paused);
    this.pauseWrites = this.pauseWrites.then(save, save);
    return Promise.all([this.pauseWrites, this.request()]).then(() => undefined);
  }

  private async loop(): Promise<void> {
    do {
      try {
        await this.once();
      } catch (cause) {
        if (this.stopped) return;
        if (this.stale) {
          this.again = true;
          continue;
        }
        const problem = cause instanceof Error ? cause.message : String(cause);
        log.warn('backup.cycle_failed', { reason: problem });
        patchBackupStatus({
          phase: this.paused === true ? 'paused' : 'idle',
          pauseReason: this.paused === true ? 'user' : null,
          current: null,
          problem,
        });
      }
    } while (this.takeAgain());
  }

  private takeAgain(): boolean {
    const again = this.again && !this.stopped;
    this.again = false;
    return again;
  }

  private async once(): Promise<void> {
    const settings = this.ports.settings.read();
    this.seenSettings = JSON.stringify(settings);
    this.stale = false;
    if (this.stopped) return;
    const hold = await this.holdOf(settings);
    if (this.interrupted()) return;
    if (hold !== null) {
      this.show(hold);
      if (this.ports.available() && (await this.ports.conditions.read()).connected) {
        await this.register(settings);
      }
      return;
    }
    if (this.interrupted()) return;
    await this.register(settings);
    if (!this.interrupted()) await this.cycle(settings);
  }

  private interrupted(): boolean {
    return this.stopped || this.stale;
  }

  private async holdOf(settings: PhotosBackupPref): Promise<Hold | null> {
    if (!this.ports.available()) return { phase: 'unavailable', pauseReason: null };
    if (!settings.enabled) return { phase: 'off', pauseReason: null };
    if ((await this.ports.media.access()) === 'none') return { phase: 'denied', pauseReason: null };
    if (await this.isPaused()) return { phase: 'paused', pauseReason: 'user' };
    const blocked = blockedBy(settings, await this.ports.conditions.read());
    return blocked === null ? null : { phase: 'paused', pauseReason: blocked };
  }

  private async isPaused(): Promise<boolean> {
    if (this.paused === null) {
      const stored = await loadPaused(this.ports.storage);
      this.paused ??= stored;
    }
    return this.paused;
  }

  async ledgerOf(): Promise<Ledger> {
    this.ledger ??= await loadLedger(this.ports.storage);
    return this.ledger;
  }

  private show(hold: Hold): void {
    if (this.stopped) return;
    patchBackupStatus({ ...hold, current: null, problem: null });
  }

  private async register(settings: PhotosBackupPref): Promise<void> {
    const key = JSON.stringify(settings);
    if (this.registered === key) return;
    const { identity } = this.ports;
    await this.ports.hub.register({
      deviceId: identity.deviceId,
      name: identity.name,
      platform: identity.platform,
      settings: {
        enabled: settings.enabled,
        folders: settings.albumIds,
        wifiOnly: settings.wifiOnly,
        chargingOnly: settings.chargingOnly,
        includeVideos: settings.includeVideos,
      },
    });
    this.registered = key;
  }

  private async cycle(settings: PhotosBackupPref): Promise<void> {
    const ledger = await this.ledgerOf();
    const controller = new AbortController();
    this.controller = controller;
    if (this.stale || this.stopped) controller.abort();
    const limitedAccess = (await this.ports.media.access()) === 'limited';
    if (controller.signal.aborted) return;
    patchBackupStatus({ pauseReason: null, problem: null, limitedAccess });
    const cycle = new BackupCycle(this.ports, ledger, scopeOf(settings), controller.signal);
    const end = await cycle.run();
    this.controller = null;
    this.conclude(end, ledger, cycle.failure);
  }

  private conclude(end: CycleEnd, ledger: Ledger, failure: string | null): void {
    if (this.stopped) return;
    log.info('backup.cycle_ended', { end });
    if (end === 'interrupted') {
      this.again = true;
      return;
    }
    patchBackupStatus({
      phase: 'idle',
      current: null,
      lastBackupAt: ledger.latestUpload(),
      problem: failure,
    });
  }
}
