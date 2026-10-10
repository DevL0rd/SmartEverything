import { PROVIDER_PROBLEMS, type ProviderProblem } from '@smarteverything/domain';
import { z } from 'zod';

const CARRIED = z.object({ problem: z.enum(PROVIDER_PROBLEMS) });

const SYSTEM_CODE = z.object({ code: z.string() });

const NETWORK_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const TIMEOUT_NAMES: ReadonlySet<string> = new Set(['TimeoutError', 'ConnectTimeoutError']);

const DEEPEST_CAUSE = 8;

function ownProblem(cause: Error): ProviderProblem | null {
  const carried = CARRIED.safeParse(cause);
  if (carried.success) {
    return carried.data.problem;
  }
  const code = SYSTEM_CODE.safeParse(cause);
  if ((code.success && NETWORK_CODES.has(code.data.code)) || TIMEOUT_NAMES.has(cause.name)) {
    return 'network';
  }
  return null;
}

export function problemOf(cause: unknown): ProviderProblem {
  let current = cause;
  for (let depth = 0; depth < DEEPEST_CAUSE && current instanceof Error; depth += 1) {
    const problem = ownProblem(current);
    if (problem !== null) {
      return problem;
    }
    current = current.cause;
  }
  return 'unknown';
}
