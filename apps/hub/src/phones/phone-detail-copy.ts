import type { LiveChange, PhoneDetail } from '@smarteverything/domain';
import type { Store } from '../store/store';

export interface PhoneDetails {
  read(deviceId: string): PhoneDetail;
}

export class PhoneDetailsNotLoadedError extends Error {
  override readonly name = 'PhoneDetailsNotLoadedError';

  constructor() {
    super('The phone details were read before they were loaded from the store host.');
  }
}

type Step =
  | { readonly kind: 'merged'; readonly deviceId: string; readonly parts: PhoneDetail }
  | { readonly kind: 'removed'; readonly deviceId: string };

function defined(parts: PhoneDetail): PhoneDetail {
  return Object.fromEntries(Object.entries(parts).filter(([, section]) => section !== undefined));
}

export class PhoneDetailCopy implements PhoneDetails {
  private readonly details = new Map<string, PhoneDetail>();
  private readonly early: Step[] = [];
  private loading: Promise<void> | null = null;
  private ready = false;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly store: Pick<Store, 'feed' | 'host'>) {}

  load(): Promise<void> {
    if (this.loading === null) {
      this.unsubscribe = this.store.feed.subscribe((change) => {
        this.changed(change);
      });
      this.loading = this.fill();
    }
    return this.loading;
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  read(deviceId: string): PhoneDetail {
    if (!this.ready) throw new PhoneDetailsNotLoadedError();
    return this.details.get(deviceId) ?? {};
  }

  merged(deviceId: string, parts: PhoneDetail): void {
    this.step({ kind: 'merged', deviceId, parts });
  }

  private changed(change: LiveChange): void {
    if (change.table !== 'devices' || change.operation !== 'DELETE' || change.oldRecord === null)
      return;
    this.step({ kind: 'removed', deviceId: change.oldRecord.id });
  }

  private step(step: Step): void {
    if (this.ready) this.apply(step);
    else if (this.loading !== null) this.early.push(step);
  }

  private async fill(): Promise<void> {
    const rows = await this.store.host.read('phoneDetailRows', null);
    for (const row of rows) this.details.set(row.deviceId, row.detail);
    for (const step of this.early.splice(0)) this.apply(step);
    this.ready = true;
  }

  private apply(step: Step): void {
    if (step.kind === 'removed') {
      this.details.delete(step.deviceId);
      return;
    }
    this.details.set(step.deviceId, {
      ...this.details.get(step.deviceId),
      ...defined(step.parts),
    });
  }
}
