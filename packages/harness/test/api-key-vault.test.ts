import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { Context } from '@deepseek-ai/cordis';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import type { HarnessCallRequest } from '@smarteverything/domain';
import { ApiKeyCredentials } from '../src/plugins/providers';
import { HubApiKeyVault } from '../src/process/api-key-vault';

const REFERENCE = 'DEEPSEEK_API_KEY';

function hub(stored: Readonly<Record<string, string>>): {
  readonly requests: HarnessCallRequest[];
  readonly call: <S extends z.ZodType>(
    request: HarnessCallRequest,
    schema: S,
  ) => Promise<z.output<S>>;
} {
  const requests: HarnessCallRequest[] = [];
  return {
    requests,
    call: (request, schema): Promise<z.output<typeof schema>> => {
      requests.push(request);
      const value = request.operation === 'api_key' ? (stored[request.reference] ?? null) : null;
      return Promise.resolve(schema.parse({ value }));
    },
  };
}

describe('the computer-side key vault', () => {
  it('asks the hub for the key each time and treats no key as absent', async () => {
    const stored: Record<string, string> = {};
    const source = hub(stored);
    const vault = new HubApiKeyVault(source);

    expect(await vault.read(REFERENCE)).toBeUndefined();
    stored[REFERENCE] = 'hub-key';

    expect(await vault.read(REFERENCE)).toBe('hub-key');
    expect(source.requests).toStrictEqual([
      { operation: 'api_key', reference: REFERENCE },
      { operation: 'api_key', reference: REFERENCE },
    ]);
  });

  it('serves the hub key through the credential seam and cannot change it', async () => {
    const ctx = new Context();
    const vault = new HubApiKeyVault(hub({ [REFERENCE]: 'hub-key' }));
    await ctx.plugin(ApiKeyCredentials, vault);

    expect(await ctx.credentials.resolve(credentialRef(REFERENCE))).toStrictEqual({
      value: 'hub-key',
      source: 'hub',
    });
    await expect(ctx.credentials.set(credentialRef(REFERENCE), 'other')).rejects.toThrow(
      /Settings on the hub/u,
    );
    await ctx.fiber.dispose();
  });
});
