import { z } from 'zod';
import { Logger } from '@smarteverything/logging';

const ERROR_NAME = z.enum([
  'Error',
  'TypeError',
  'AbortError',
  'TimeoutError',
  'AggregateError',
  'SystemError',
  'APIConnectionError',
  'APIConnectionTimeoutError',
]);
const CAUSE_CODE = z.enum([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_ABORTED',
  'UND_ERR_DESTROYED',
  'UND_ERR_CLOSED',
]);
const ERROR_FIELDS = z.object({
  name: z.unknown().optional(),
  code: z.unknown().optional(),
  cause: z.unknown().optional(),
});
const MAX_CAUSE_DEPTH = 4;

export function connectionDiagnosticFetch(
  hop: 'harness_hub' | 'hub_supplier',
  fetcher: typeof fetch,
): typeof fetch {
  return async (input, init): Promise<Response> => {
    const started = performance.now();
    try {
      return await fetcher(input, init);
    } catch (error) {
      new Logger('hub.harness').warn('inference.connection_failed', {
        hop,
        elapsed_ms: Math.round(performance.now() - started),
        ...connectionFacts(error),
      });
      throw error;
    }
  };
}

function connectionFacts(error: unknown): {
  readonly error_name: z.infer<typeof ERROR_NAME> | null;
  readonly cause_code: z.infer<typeof CAUSE_CODE> | null;
} {
  const fields = ERROR_FIELDS.safeParse(error);
  const name = ERROR_NAME.safeParse(fields.success ? fields.data.name : undefined);
  let cause: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    const nested = ERROR_FIELDS.safeParse(cause);
    if (!nested.success) break;
    const code = CAUSE_CODE.safeParse(nested.data.code);
    if (code.success) return { error_name: name.success ? name.data : null, cause_code: code.data };
    cause = nested.data.cause;
  }
  return { error_name: name.success ? name.data : null, cause_code: null };
}
