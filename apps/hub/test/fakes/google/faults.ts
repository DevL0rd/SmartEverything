import { apiFailure, tokenFailure, type HttpFailure } from './reply';
import { TOKEN_HOST } from './route';

export interface FaultSpec {
  readonly times: number;
  readonly status: number;
  readonly reason?: string;
  readonly domain?: string;
  readonly message?: string;
  readonly retryAfterSeconds?: number;
  readonly host?: string;
  readonly method?: string;
  readonly pathIncludes?: string;
}

interface PendingFault {
  readonly spec: FaultSpec;
  remaining: number;
}

const RATE_LIMITED = {
  message:
    "Quota exceeded for quota metric 'Queries' and limit 'Queries per minute per user' of service 'calendar-json.googleapis.com'",
  reason: 'rateLimitExceeded',
  domain: 'usageLimits',
};

const BACKEND_ERROR = { message: 'Backend Error', reason: 'backendError', domain: 'global' };

function failureFor(spec: FaultSpec): HttpFailure {
  if (spec.host === TOKEN_HOST) {
    return tokenFailure(spec.status, spec.reason ?? 'temporarily_unavailable', spec.message);
  }
  const defaults = spec.status === 429 || spec.status === 403 ? RATE_LIMITED : BACKEND_ERROR;
  const headers =
    spec.retryAfterSeconds === undefined ? {} : { 'Retry-After': String(spec.retryAfterSeconds) };
  return apiFailure(spec.status, spec.message ?? defaults.message, spec.reason ?? defaults.reason, {
    domain: spec.domain ?? defaults.domain,
    headers,
  });
}

export class FaultInjector {
  private readonly queue: PendingFault[] = [];

  fail(spec: FaultSpec): void {
    this.queue.push({ spec, remaining: spec.times });
  }

  clear(): void {
    this.queue.length = 0;
  }

  take(host: string, method: string, path: string): HttpFailure | null {
    const hit = this.queue.find(
      (fault) =>
        fault.remaining > 0 &&
        (fault.spec.host === undefined || fault.spec.host === host) &&
        (fault.spec.method === undefined || fault.spec.method === method) &&
        (fault.spec.pathIncludes === undefined || path.includes(fault.spec.pathIncludes)),
    );
    if (hit === undefined) return null;
    hit.remaining -= 1;
    return failureFor(hit.spec);
  }
}
