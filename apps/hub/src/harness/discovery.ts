import {
  ApiError,
  HARNESS_DISCOVERY_REQUEST,
  HARNESS_DISCOVERY_PAGE,
  type HarnessDiscoveryPage,
  type HarnessDiscoveryRequest,
} from '@smarteverything/domain';
import {
  AnthropicSkills,
  ANTHROPIC_SKILLS_SOURCE,
  type AnthropicSkillSnapshot,
} from './anthropic-skills';
import { extensionDiscoveryPage } from './extension-discovery';
import { ClaudePlugins } from './claude-plugins';
import { HarnessDiscoverySourceError } from './discovery-http';
import type { HarnessConfigurationService } from './configuration';

const CACHE_MS = 5 * 60 * 1000;
const MAX_CACHED_PAGES = 64;
export class HarnessDiscovery {
  readonly skills = new AnthropicSkills();
  readonly plugins = new ClaudePlugins();
  private readonly pages = new Map<string, HarnessDiscoveryPage>();
  private readonly pending = new Map<string, Promise<HarnessDiscoveryPage>>();

  constructor(private readonly configuration: HarnessConfigurationService) {}

  async browse(input: unknown): Promise<HarnessDiscoveryPage> {
    const request = HARNESS_DISCOVERY_REQUEST.parse(input);
    if (!request.refresh && request.snapshot !== undefined)
      (request.kind === 'skill' ? this.skills : this.plugins).retainedSnapshot(request.snapshot);
    const key = JSON.stringify({ ...request, refresh: false });
    const current = this.pages.get(key);
    const inFlight = this.pending.get(key);
    const page = inFlight ?? this.load(request, key, current);
    const result = await page;
    const installed = installedIds(this.configuration);
    return HARNESS_DISCOVERY_PAGE.parse({
      ...result,
      items: result.items.map((item) => ({
        ...item,
        installed_id: installed.get(item.id) ?? null,
      })),
    });
  }

  private load(
    request: HarnessDiscoveryRequest,
    key: string,
    current: HarnessDiscoveryPage | undefined,
  ): Promise<HarnessDiscoveryPage> {
    if (
      !request.refresh &&
      current !== undefined &&
      !current.stale &&
      Date.now() - Date.parse(current.fetched_at) < CACHE_MS
    )
      return Promise.resolve(current);
    const work = this.fetchPage(request)
      .then((page) => this.remember(key, page, current))
      .catch((cause: unknown) => {
        if (cause instanceof ApiError) throw cause;
        const warning =
          cause instanceof HarnessDiscoverySourceError
            ? cause.message
            : 'The online source failed its bounded response, network or schema checks.';
        if (current !== undefined) return this.remember(key, { ...current, stale: true, warning });
        throw new ApiError('conflict', warning);
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, work);
    return work;
  }

  private remember(
    key: string,
    page: HarnessDiscoveryPage,
    current?: HarnessDiscoveryPage,
  ): HarnessDiscoveryPage {
    const retained =
      page.stale && current !== undefined
        ? { ...current, stale: true, warning: page.warning }
        : page;
    this.pages.delete(key);
    this.pages.set(key, retained);
    while (this.pages.size > MAX_CACHED_PAGES) {
      const oldest = this.pages.keys().next().value;
      if (oldest !== undefined) this.pages.delete(oldest);
    }
    return retained;
  }

  private async fetchPage(request: HarnessDiscoveryRequest): Promise<HarnessDiscoveryPage> {
    if (request.kind === 'extension') return extensionDiscoveryPage(this.plugins, request);
    try {
      const snapshot = await this.skills.snapshot(
        request.refresh,
        request.refresh ? undefined : request.snapshot,
      );
      return skillPage(snapshot, request, false);
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      const cached = this.skills.cached();
      if (cached === undefined) throw cause;
      return {
        ...skillPage(cached, request, true),
        warning: 'Anthropic source refresh failed; this retained immutable snapshot is stale.',
      };
    }
  }
}

function skillPage(
  snapshot: AnthropicSkillSnapshot,
  request: HarnessDiscoveryRequest,
  stale: boolean,
): HarnessDiscoveryPage {
  const query = request.query.toLocaleLowerCase();
  const filtered = snapshot.items.filter((item) =>
    `${item.name} ${item.description} ${item.publisher}`.toLocaleLowerCase().includes(query),
  );
  const offset = (request.page - 1) * request.page_size;
  return {
    source: ANTHROPIC_SKILLS_SOURCE,
    snapshot: snapshot.commit,
    fetched_at: snapshot.fetched_at,
    stale,
    items: filtered.slice(offset, offset + request.page_size),
    total: filtered.length,
    next_page:
      offset + request.page_size >= filtered.length || request.page === 1000
        ? null
        : request.page + 1,
  };
}

function installedIds(configuration: HarnessConfigurationService): ReadonlyMap<string, string> {
  const identities = new Map<string, string>();
  for (const entry of configuration.desired().entries) {
    identities.set(entry.id, entry.id);
    for (const asset of entry.metadata?.skill_assets ?? [])
      identities.set(asset.id, `skill-asset:${asset.id}`);
  }
  return identities;
}
