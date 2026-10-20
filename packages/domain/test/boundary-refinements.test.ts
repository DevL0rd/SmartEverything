import { describe, expect, it } from 'vitest';
import { AI_MODEL_ROUTE } from '../src/ai-model-route';
import { AI_PREVIEW_ORIGIN } from '../src/ai-previews';
import { AI_PROJECT_PREVIEW_SOURCE } from '../src/ai-preview-documents';
import { AI_PROJECT_PATH } from '../src/ai-project-files';
import { AI_SUBSCRIPTION_INTERACTION } from '../src/ai-subscription-host';
import { CLAUDE_MCP_SERVERS, COMPUTER_AI_SETTINGS_PATCH } from '../src/computer-ai';
import { HUB_PAIRING_CANDIDATE_URL, HUB_PAIRING_OBSERVATION } from '../src/hub-pairing';
import { NATIVE_HUB_RESOURCE } from '../src/hub-native-resources';

const ID = 'a'.repeat(64);
const NEXT = '3a000000-0000-4000-8000-0000000000a1';

describe('NATIVE_HUB_RESOURCE', () => {
  const resource = {
    id: ID,
    localUrl: `http://127.0.0.1:4000/resource/${ID}`,
    expiresAt: '2026-10-08T07:00:00Z',
  };

  it('accepts an exact loopback grant for its own id', () => {
    expect(NATIVE_HUB_RESOURCE.safeParse(resource).success).toBe(true);
  });

  it.each([
    `https://127.0.0.1:4000/resource/${ID}`,
    `http://localhost:4000/resource/${ID}`,
    `http://127.0.0.1/resource/${ID}`,
    `http://user:pw@127.0.0.1:4000/resource/${ID}`,
    `http://127.0.0.1:4000/resource/${ID}?x=1`,
    `http://127.0.0.1:4000/resource/${ID}#x`,
    'http://127.0.0.1:4000/resource/short',
  ])('refuses the address %s', (localUrl) => {
    expect(NATIVE_HUB_RESOURCE.safeParse({ ...resource, localUrl }).success).toBe(false);
  });

  it('refuses a grant whose path names another resource', () => {
    const other = 'b'.repeat(64);
    expect(
      NATIVE_HUB_RESOURCE.safeParse({
        ...resource,
        localUrl: `http://127.0.0.1:4000/resource/${other}`,
      }).success,
    ).toBe(false);
  });
});

describe('hub pairing addresses', () => {
  it.each(['https://192.168.1.5', 'https://192.168.1.5:8443', 'https://[fe80::1]'])(
    'accepts the literal address %s',
    (url) => {
      expect(HUB_PAIRING_CANDIDATE_URL.safeParse(url).success).toBe(true);
    },
  );

  it.each([
    'http://192.168.1.5/',
    'https://hub.local/',
    'https://user:pw@192.168.1.5/',
    'https://192.168.1.5/',
    'https://192.168.1.5/path',
    'https://192.168.1.5/?x=1',
    'https://192.168.1.5/#x',
  ])('refuses %s', (url) => {
    expect(HUB_PAIRING_CANDIDATE_URL.safeParse(url).success).toBe(false);
  });

  const observation = {
    kind: 'observed',
    requestId: 'r',
    generation: 0,
    url: 'https://192.168.1.5:8443',
    address: '192.168.1.5',
    port: 8443,
    tls: {
      serverName: `smarteverything-${'a'.repeat(32)}.local`,
      certificateSha256: ID,
      publicKeySha256: ID,
    },
    validFrom: '2026-10-08T07:00:00Z',
    validTo: '2026-10-09T07:00:00Z',
  };

  it('accepts an observation that matches the inspected address, port and window', () => {
    expect(HUB_PAIRING_OBSERVATION.safeParse(observation).success).toBe(true);
    expect(
      HUB_PAIRING_OBSERVATION.safeParse({
        ...observation,
        url: 'https://[fe80::1]',
        address: 'fe80::1',
        port: 443,
      }).success,
    ).toBe(true);
  });

  it.each([{ address: '192.168.1.6' }, { port: 9000 }, { validTo: '2026-10-08T07:00:00Z' }])(
    'refuses an observation that differs by %j',
    (change) => {
      expect(HUB_PAIRING_OBSERVATION.safeParse({ ...observation, ...change }).success).toBe(false);
    },
  );
});

describe('project paths and previews', () => {
  it.each(['workspace', 'workspace/a/b.txt', 'temporary/x'])('accepts the path %s', (path) => {
    expect(AI_PROJECT_PATH.safeParse(path).success).toBe(true);
  });

  it.each([
    'other/a',
    'workspace/../a',
    'workspace//a',
    'workspace/./a',
    'workspace\\a',
    'workspace/a%2f',
    'workspaces/a',
  ])('refuses the path %s', (path) => {
    expect(AI_PROJECT_PATH.safeParse(path).success).toBe(false);
  });

  it('keeps a project preview inside the workspace and on a plain html entry', () => {
    const source = { root: 'workspace/site', entry: 'index.html' };
    expect(AI_PROJECT_PREVIEW_SOURCE.safeParse(source).success).toBe(true);
    expect(AI_PROJECT_PREVIEW_SOURCE.safeParse({ ...source, root: 'temporary/site' }).success).toBe(
      false,
    );
    for (const entry of [
      '/index.html',
      'a/../index.html',
      'a//b.html',
      'a\\b.html',
      'a%2e.html',
      'index.js',
    ]) {
      expect(AI_PROJECT_PREVIEW_SOURCE.safeParse({ ...source, entry }).success).toBe(false);
    }
  });

  it('allows only a literal loopback origin with an exact valid port', () => {
    expect(AI_PREVIEW_ORIGIN.safeParse('http://127.0.0.1:3000').success).toBe(true);
    expect(AI_PREVIEW_ORIGIN.safeParse('https://[::1]:65535').success).toBe(true);
    expect(AI_PREVIEW_ORIGIN.safeParse('http://127.0.0.1:65536').success).toBe(false);
    expect(AI_PREVIEW_ORIGIN.safeParse('http://127.0.0.1').success).toBe(false);
    expect(AI_PREVIEW_ORIGIN.safeParse('http://localhost:3000').success).toBe(false);
  });
});

describe('subscription sign-in addresses', () => {
  const interaction = {
    enrollment_id: NEXT,
    message: 'Sign in',
    prompt: null,
    options: [],
    user_code: null,
  };

  it('accepts a plain authorization address, or none', () => {
    expect(
      AI_SUBSCRIPTION_INTERACTION.safeParse({
        ...interaction,
        url: 'https://auth.example.com/start?state=1',
      }).success,
    ).toBe(true);
    expect(AI_SUBSCRIPTION_INTERACTION.safeParse({ ...interaction, url: null }).success).toBe(true);
  });

  it.each([
    'https://user:pw@auth.example.com/',
    'https://auth.example.com/#frag',
    'https://auth.example.com/?id_token_hint=x',
    'https://auth.example.com/?Access_Token=x',
    'https://auth.example.com/?refresh_token=x',
    'https://auth.example.com/?client_secret=x',
  ])('refuses %s because it exposes credentials', (url) => {
    expect(AI_SUBSCRIPTION_INTERACTION.safeParse({ ...interaction, url }).success).toBe(false);
  });
});

describe('model routes', () => {
  const capabilities = {
    revision: 'r',
    input_modalities: ['text'],
    output_modalities: ['text'],
    reasoning: false,
    efforts: [],
    local_tools: false,
    context_tokens: null,
    discovered_at: '2026-10-08T07:00:00Z',
  };
  const route = {
    id: NEXT,
    profile_id: NEXT,
    supplier: { kind: 'server' },
    subscriber_id: 's',
    state: 'ready',
    auth: { provider: 'anthropic', kind: 'claude-subscription-oauth' },
    billing: 'subscription-only',
    fallback: 'none',
    background_authorized: false,
    capability_revision: 'r',
    models: [{ id: 'm', name: 'M', capabilities }],
  };

  it('needs subscription billing for a subscription provider and metered for the api key', () => {
    expect(AI_MODEL_ROUTE.safeParse(route).success).toBe(true);
    expect(AI_MODEL_ROUTE.safeParse({ ...route, billing: 'metered' }).success).toBe(false);
    const keyed = { ...route, auth: { provider: 'openrouter', kind: 'hub-api-key' } };
    expect(AI_MODEL_ROUTE.safeParse({ ...keyed, billing: 'metered' }).success).toBe(true);
    expect(AI_MODEL_ROUTE.safeParse(keyed).success).toBe(false);
  });
});

describe('computer ai settings', () => {
  it('needs a setting to change', () => {
    expect(COMPUTER_AI_SETTINGS_PATCH.safeParse({}).success).toBe(false);
    expect(COMPUTER_AI_SETTINGS_PATCH.safeParse({ control: { enabled: true } }).success).toBe(true);
  });

  it('keeps remote servers on http or https and protects the home bridge name', () => {
    expect(
      CLAUDE_MCP_SERVERS.safeParse({ docs: { type: 'http', url: 'https://x.example/mcp' } })
        .success,
    ).toBe(true);
    expect(
      CLAUDE_MCP_SERVERS.safeParse({ docs: { type: 'sse', url: 'ftp://x.example/mcp' } }).success,
    ).toBe(false);
    expect(
      CLAUDE_MCP_SERVERS.safeParse({ home: { type: 'http', url: 'https://x.example/mcp' } })
        .success,
    ).toBe(false);
  });

  it('allows at most 100 servers', () => {
    const server = { type: 'http', url: 'https://x.example/mcp' };
    const many = (count: number): Record<string, typeof server> =>
      Object.fromEntries(
        Array.from({ length: count }, (_, index) => [`s${String(index)}`, server]),
      );
    expect(CLAUDE_MCP_SERVERS.safeParse(many(100)).success).toBe(true);
    expect(CLAUDE_MCP_SERVERS.safeParse(many(101)).success).toBe(false);
  });
});
