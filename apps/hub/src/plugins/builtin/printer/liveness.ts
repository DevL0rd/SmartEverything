import { PrinterError } from '@smarteverything/domain';
import type { PrinterEmitter } from './emitter';
import type { PrinterLedger } from './ledger';
import { Presence, type Flip } from './presence';
import type { PrinterRecord } from './records';

const OFFLINE_LONG_MS = 1_800_000;
const AUTH_TRIES = 3;

export interface LivenessPorts {
  readonly record: () => PrinterRecord;
  readonly update: (patch: Partial<PrinterRecord>) => void;
  readonly name: () => string;
  readonly emitter: PrinterEmitter;
  readonly ledger: PrinterLedger;
}

export interface Failure {
  readonly busy: boolean;
  readonly flip: Flip;
}

export class Liveness {
  readonly presence: Presence;
  #offlineSince: number | null = null;
  #announced = false;
  #authAttempts = 0;
  #busyStreak = 0;

  constructor(
    private readonly ports: LivenessPorts,
    online: boolean,
  ) {
    this.presence = new Presence(online);
  }

  get busyStreak(): number {
    return this.#busyStreak;
  }

  get authBlocked(): boolean {
    return this.ports.record().needsAuth && this.#authAttempts >= AUTH_TRIES;
  }

  succeeded(now: Date): Flip {
    this.#busyStreak = 0;
    this.#authAttempts = 0;
    this.#offlineSince = null;
    this.#announced = false;
    if (this.ports.record().needsAuth) this.ports.update({ needsAuth: false });
    return this.presence.success(now.getTime());
  }

  failed(cause: unknown, now: Date): Failure {
    const reason = cause instanceof PrinterError ? cause.reason : 'unreachable';
    if (reason === 'busy') {
      this.#busyStreak += 1;
      return { busy: true, flip: null };
    }
    if (reason === 'not_authenticated') this.#authLapsed();
    if (reason === 'certificate_changed' && cause instanceof PrinterError) this.#certificate(cause);
    const immediate = reason === 'certificate_changed' || reason === 'not_authenticated';
    const flip = this.presence.failure(now.getTime(), immediate);
    this.#offlineSince ??= now.getTime();
    if (flip === 'offline')
      this.ports.ledger.note('offline', `${this.ports.name()} went offline (${reason})`, now);
    this.#offlineLong(now);
    return { busy: false, flip };
  }

  #authLapsed(): void {
    this.#authAttempts += 1;
    if (!this.ports.record().needsAuth) this.ports.update({ needsAuth: true });
    this.ports.emitter.emit({
      kind: 'pairing_problem',
      text: `${this.ports.name()} needs a user name and password`,
      data: { reason: 'not_authenticated' },
      cap: 'pairing',
      subject: 'not_authenticated',
    });
  }

  #certificate(cause: PrinterError): void {
    const presented = String(cause.fields['presented'] ?? '');
    if (this.ports.record().certificateChange?.presented !== presented) {
      this.ports.update({
        certificateChange: { previous: this.ports.record().pin ?? '', presented },
      });
    }
    this.ports.emitter.emit({
      kind: 'pairing_problem',
      text: `${this.ports.name()} presented a different certificate`,
      data: { reason: 'certificate_changed' },
      cap: 'pairing',
      subject: 'certificate_changed',
    });
  }

  #offlineLong(now: Date): void {
    if (this.#offlineSince === null || this.#announced) return;
    if (
      now.getTime() - this.#offlineSince < OFFLINE_LONG_MS ||
      !this.ports.record().settings.notify.offline
    )
      return;
    this.#announced = true;
    this.ports.emitter.emit({
      kind: 'offline_long',
      text: `${this.ports.name()} has been offline for 30 minutes`,
      data: {},
      cap: 'presence',
    });
  }
}
