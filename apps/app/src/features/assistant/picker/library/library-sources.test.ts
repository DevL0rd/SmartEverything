import { describe, expect, it } from 'vitest';
import type { AiHarnessCatalogue, AiHarnessHost, AiModelRoute } from '@smarteverything/domain';
import type { ModelCandidate } from '../../data/model-candidates';
import { nativeModelKey } from '../../provider/computer-engine';
import type { SearchCandidates } from '../model-search-candidates';
import { favouriteIdOf, libraryRows, libraryView, selectedRow } from './library-rows';
import {
  candidateWhere,
  HUB_SOURCE,
  librarySources,
  matchesSources,
  sourceChipLabel,
  type SourceFacts,
} from './library-sources';

const WORKSTATION = '11111111-1111-4111-8111-111111111111';
const STUDIO = '22222222-2222-4222-8222-222222222222';
const ROUTE_ID = '33333333-3333-4333-8333-333333333333';
const UNSIGNED = '44444444-4444-4444-8444-444444444444';

function host(deviceId: string | null, name: string, online: boolean): AiHarnessHost {
  return {
    target: deviceId === null ? { kind: 'server' } : { kind: 'device', device_id: deviceId },
    name,
    online,
    runtime_instance: ROUTE_ID,
    connection_generation: ROUTE_ID,
    manifest: null,
    unavailable_reason: online ? null : 'This machine is offline.',
    platform: 'linux',
  };
}

function route(
  id: string,
  deviceId: string,
  provider: 'openai' | 'anthropic',
  ready: boolean,
): AiModelRoute {
  const fields = {
    id,
    profile_id: ROUTE_ID,
    supplier: { kind: 'device' as const, device_id: deviceId },
    subscriber_id: 'me',
    auth:
      provider === 'openai'
        ? { provider, kind: 'chatgpt-sign-in' as const }
        : { provider, kind: 'claude-subscription-oauth' as const },
    billing: 'subscription-only' as const,
    fallback: 'none' as const,
    background_authorized: true,
    capability_revision: 'r1',
    models: [],
  };
  return ready
    ? { ...fields, state: 'ready' }
    : {
        ...fields,
        state: 'unavailable',
        failure: {
          code: 'subscription_unavailable',
          message: 'Sign in to ChatGPT.',
          retry_at: null,
        },
      };
}

function catalogue(
  hosts: readonly AiHarnessHost[],
  routes: readonly AiModelRoute[],
): AiHarnessCatalogue {
  return { capability: 'ai-harness-v1', hosts: [...hosts], routes: [...routes] };
}

const FACTS: SourceFacts = {
  harness: catalogue(
    [
      host(null, 'Hub', true),
      host(WORKSTATION, 'Workstation', true),
      host(STUDIO, 'Studio', false),
    ],
    [route(ROUTE_ID, WORKSTATION, 'anthropic', true), route(UNSIGNED, STUDIO, 'openai', false)],
  ),
  engines: undefined,
  owner: true,
};

describe('librarySources', () => {
  const sources = librarySources(FACTS);

  it('lists the hub, each computer and each plan', () => {
    expect(sources.map((source) => source.id)).toEqual([
      HUB_SOURCE,
      `device:${WORKSTATION}`,
      `device:${STUDIO}`,
      'plan:anthropic',
      'plan:openai',
    ]);
  });

  it('marks an offline computer and a signed-out plan with a reason in the chip', () => {
    const labels = sources.map(sourceChipLabel);
    expect(labels).toContain('Studio · offline');
    expect(labels).toContain('ChatGPT plan · signed out');
    expect(labels).toContain('Home Hub · OpenRouter');
    expect(labels).toContain('Workstation');
  });

  it('always offers the hub even before the catalogue loads', () => {
    expect(
      librarySources({ harness: undefined, engines: undefined, owner: true }).map(
        (source) => source.id,
      ),
    ).toEqual([HUB_SOURCE]);
  });
});

describe('candidateWhere', () => {
  it('places a plan route on the computer that supplies it', () => {
    const where = candidateWhere(`dsh:${ROUTE_ID}:claude-sonnet`, undefined, FACTS);
    expect(where.sources).toEqual([`device:${WORKSTATION}`, 'plan:anthropic']);
    expect(where.line).toBe('Claude plan on Workstation');
    expect(where.ready).toBe(true);
  });

  it('explains an unavailable plan with the hub message', () => {
    expect(candidateWhere(`dsh:${UNSIGNED}:gpt-5`, undefined, FACTS).blame).toBe(
      'Sign in to ChatGPT.',
    );
  });

  it('places catalogue models on the Home Hub', () => {
    const where = candidateWhere('catalogue:openrouter:x', 'OpenRouter', FACTS);
    expect(where.sources).toEqual([HUB_SOURCE]);
    expect(where.line).toBe('OpenRouter on Home Hub');
  });

  it('says a computer model has no computer, or is owner only for members', () => {
    const key = nativeModelKey('claude', 'sonnet');
    expect(candidateWhere(key, undefined, FACTS)).toMatchObject({
      sources: ['plan:anthropic'],
      line: 'Claude',
      blame: 'No computer offers this model.',
      ready: false,
    });
    expect(candidateWhere(key, undefined, { ...FACTS, owner: false }).blame).toBe(
      'Only the owner can use models on their computers.',
    );
  });
});

describe('matchesSources', () => {
  it('matches everything when nothing is ticked', () => {
    expect(matchesSources(['a'], new Set())).toBe(true);
  });

  it('matches a row from any ticked source', () => {
    expect(matchesSources(['a', 'b'], new Set(['b']))).toBe(true);
    expect(matchesSources(['a'], new Set(['b']))).toBe(false);
  });
});

function candidate(key: string, extra: Partial<ModelCandidate> = {}): ModelCandidate {
  return {
    key,
    model: {
      id: 'm',
      name: 'M',
      provider: 'p',
      providerLabel: 'Maker',
      contextLength: null,
      price: { inputPerMillion: null, outputPerMillion: null, variable: false },
      efforts: [],
      latest: false,
      inputs: [],
      outputs: [],
    },
    selected: false,
    favourite: false,
    render: () => null,
    pick: null,
    ...extra,
  };
}

function search(rows: Partial<SearchCandidates>): SearchCandidates {
  return { current: [], favorites: [], all: [], nativeCount: 0, ...rows };
}

describe('libraryRows', () => {
  const pick = (): void => undefined;
  const rows = search({
    current: [candidate(`dsh:${ROUTE_ID}:a`, { selected: true, pick })],
    favorites: [candidate('catalogue:openrouter:b', { favourite: true })],
    all: [candidate(`dsh:${UNSIGNED}:c`)],
  });

  it('orders current, favourites, then the rest', () => {
    expect(libraryRows(rows, FACTS, true, new Set()).map((row) => row.key)).toEqual([
      `dsh:${ROUTE_ID}:a`,
      'catalogue:openrouter:b',
      `dsh:${UNSIGNED}:c`,
    ]);
  });

  it('filters by ticked sources', () => {
    expect(
      libraryRows(rows, FACTS, true, new Set([`device:${STUDIO}`])).map((row) => row.key),
    ).toEqual([`dsh:${UNSIGNED}:c`]);
  });

  it('gives a reason only to rows that cannot be picked in an interactive library', () => {
    const interactive = libraryRows(rows, FACTS, true, new Set());
    expect(interactive.map((row) => row.reason)).toEqual([
      null,
      'Not offered by Home Hub or your computers.',
      'Sign in to ChatGPT.',
    ]);
  });

  it('shows the failure of an unavailable route in browse, and nothing for ready rows', () => {
    expect(libraryRows(rows, FACTS, false, new Set()).map((row) => row.reason)).toEqual([
      null,
      null,
      'Sign in to ChatGPT.',
    ]);
  });

  it('keeps native favourites under their native key and others under the model id', () => {
    const native = candidate(nativeModelKey('codex', 'gpt-5'));
    expect(favouriteIdOf(native)).toBe(native.key);
    expect(favouriteIdOf(candidate('catalogue:openrouter:b'))).toBe('m');
  });
});

describe('selectedRow', () => {
  const rows = libraryRows(
    search({
      current: [candidate('catalogue:openrouter:a', { selected: true })],
      all: [candidate('catalogue:openrouter:b')],
    }),
    FACTS,
    true,
    new Set(),
  );

  it('prefers the chosen row, then the current one, then the first', () => {
    expect(selectedRow(rows, 'catalogue:openrouter:b')?.key).toBe('catalogue:openrouter:b');
    expect(selectedRow(rows, null)?.key).toBe('catalogue:openrouter:a');
    expect(selectedRow(rows, 'gone')?.key).toBe('catalogue:openrouter:a');
    expect(selectedRow([], null)).toBeNull();
  });
});

describe('libraryView', () => {
  const base = { rows: 0, failed: false, loading: false, reachable: true };

  it('shows rows whenever there are any', () => {
    expect(libraryView({ ...base, rows: 3, failed: true })).toBe('ready');
  });

  it('reports a failed load, an unreachable hub, a loading list and no matches', () => {
    expect(libraryView({ ...base, failed: true })).toBe('error');
    expect(libraryView({ ...base, reachable: false })).toBe('offline');
    expect(libraryView({ ...base, loading: true })).toBe('loading');
    expect(libraryView(base)).toBe('empty');
  });
});
