import { z } from 'zod';
import type { CodexAiSettings } from '@smarteverything/domain';
import type { RpcRecord } from './protocol';
const GRANT = z.object({
  url: z.url({ protocol: /^https?$/ }),
  token: z.string().regex(/^scg_[A-Za-z0-9_-]{43}$/),
});
export type CodexNativeGrant = z.infer<typeof GRANT>;
export interface CodexNativeGrantResolver {
  readonly resolve: (settings: CodexAiSettings) => Promise<CodexNativeGrant | null>;
  readonly revoke: () => Promise<void>;
}
export async function nativeMcpConfig(
  resolver: CodexNativeGrantResolver | undefined,
  settings: CodexAiSettings,
): Promise<RpcRecord> {
  if (resolver === undefined) return {};
  const result = await resolver.resolve(settings);
  if (result === null) return {};
  const grant = GRANT.parse(result);
  return {
    config: {
      mcp_servers: {
        smarteverything: {
          url: grant.url,
          http_headers: { Authorization: `Bearer ${grant.token}` },
        },
      },
    },
  };
}
