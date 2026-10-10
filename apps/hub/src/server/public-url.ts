import { randomBytes } from 'node:crypto';
import { ApiError, MEDIA_PATHS, buildPath, type PublicUrlCheck } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PublicUrlOutcome } from '../store/repositories/settings';
import type { Store } from '../store/store';

const PROBE_TIMEOUT_MS = 10_000;

export interface PublicUrlOptions {
  readonly store: Store;
  readonly fetch: typeof fetch;
  readonly log: Logger;
}

function probeUrl(publicUrl: string, nonce: string): URL {
  const base = publicUrl.endsWith('/') ? publicUrl : `${publicUrl}/`;
  return new URL(buildPath(MEDIA_PATHS.publicUrlProbe, { nonce }).slice(1), base);
}

function reasonOf(cause: unknown): string {
  return cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
}

export class PublicUrlVerifier {
  private readonly pending = new Set<string>();

  constructor(private readonly options: PublicUrlOptions) {}

  answers(nonce: string): boolean {
    return this.pending.has(nonce);
  }

  async verify(): Promise<PublicUrlCheck> {
    const url = this.options.store.settings.read().public_url;
    if (url === null) {
      throw new ApiError('conflict', 'No public URL is saved; save one before verifying it.');
    }
    const nonce = randomBytes(16).toString('hex');
    this.pending.add(nonce);
    let outcome: PublicUrlOutcome;
    try {
      outcome = await this.probe(url, nonce);
    } finally {
      this.pending.delete(nonce);
    }
    const settings = this.options.store.settings.recordPublicUrlCheck(url, outcome);
    this.options.log.info('public_url.checked', { verified: outcome.verified });
    return outcome.verified
      ? { outcome: 'verified', settings }
      : { outcome: 'failed', reason: outcome.reason, settings };
  }

  private async probe(url: string, nonce: string): Promise<PublicUrlOutcome> {
    const target = probeUrl(url, nonce);
    try {
      const response = await this.options.fetch(target, {
        redirect: 'error',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const body = (await response.text()).trim();
      if (!response.ok) {
        return {
          verified: false,
          reason: `${target.toString()} answered HTTP ${String(response.status)}`,
        };
      }
      return body === nonce
        ? { verified: true }
        : {
            verified: false,
            reason: `${target.toString()} answered with something other than this server's nonce`,
          };
    } catch (cause) {
      return {
        verified: false,
        reason: `${target.toString()} could not be fetched: ${reasonOf(cause)}`,
      };
    }
  }
}
