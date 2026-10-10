import type { Logger } from '@smarteverything/logging';

export interface CloudLookup {
  readonly host: string | null;
  readonly online: boolean;
}

export interface ReachabilityOptions {
  readonly did: string;
  readonly online: boolean;
  readonly lookup: (did: string) => Promise<CloudLookup>;
  readonly publish: (did: string, online: boolean) => void;
  readonly log: Logger;
}

export class Reachability {
  private current: boolean;
  private checking: Promise<CloudLookup | null> | null = null;
  private refuted: boolean | null = null;
  private closed = false;

  constructor(private readonly options: ReachabilityOptions) {
    this.current = options.online;
  }

  get online(): boolean {
    return this.current;
  }

  heard(): void {
    this.set(true);
  }

  close(): void {
    this.closed = true;
  }

  async disputed(claim: boolean): Promise<void> {
    if (claim === this.current) {
      this.refuted = null;
      return;
    }
    if (claim === this.refuted) {
      return;
    }
    const found = await this.confirm();
    if (found !== null && claim !== this.current) {
      this.refuted = claim;
    }
  }

  confirm(): Promise<CloudLookup | null> {
    this.checking ??= this.lookupOnce().finally(() => {
      this.checking = null;
    });
    return this.checking;
  }

  private async lookupOnce(): Promise<CloudLookup | null> {
    const { did, lookup, log } = this.options;
    try {
      const found = await lookup(did);
      this.set(found.online);
      return found;
    } catch (error) {
      log.warn('xiaomi_device.lookup_failed', { did, reason: String(error) });
      return null;
    }
  }

  private set(online: boolean): void {
    if (this.closed || online === this.current) {
      return;
    }
    this.current = online;
    this.refuted = null;
    this.options.log.info('xiaomi_device.online_changed', { did: this.options.did, online });
    this.options.publish(this.options.did, online);
  }
}
