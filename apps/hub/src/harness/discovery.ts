import { createHash } from 'node:crypto';
import {
  HARNESS_DISCOVERY_PAGE,
  HARNESS_DISCOVERY_REQUEST,
  type HarnessDiscoveryItem,
  type HarnessDiscoveryPage,
  type HarnessDiscoveryRequest,
  type HarnessExtensionSourceRequest,
} from '@smarteverything/domain';
import { inspect, readMarketplace, type Candidate } from './extension-inspect';
import { gitSourceOf, withCheckout, type GitSource } from './extension-source';

const CACHE_MS = 60 * 60 * 1000;
const DEFAULT_SOURCES: Readonly<Record<HarnessDiscoveryRequest['kind'], string>> = {
  skill: 'anthropics/skills',
  extension: 'anthropics/claude-plugins-official',
};

interface Catalogue {
  readonly label: string;
  readonly owner: string | null;
  readonly commit: string;
  readonly fetchedAt: Date;
  readonly candidates: readonly Candidate[];
}

export class HarnessDiscovery {
  private readonly catalogues = new Map<string, Catalogue>();

  constructor(
    private readonly installed: () => ReadonlySet<string>,
    private readonly now: () => Date,
  ) {}

  async browse(input: unknown): Promise<HarnessDiscoveryPage> {
    const request = HARNESS_DISCOVERY_REQUEST.parse(input);
    const requested: HarnessExtensionSourceRequest = request.source ?? {
      url: DEFAULT_SOURCES[request.kind],
    };
    const source = gitSourceOf(requested);
    const catalogue = await this.catalogue(source, request.refresh);
    const kind = request.kind === 'skill' ? 'skill' : 'plugin';
    const query = request.query.toLocaleLowerCase();
    const matching = catalogue.candidates.filter(
      (candidate) =>
        candidate.kind === kind &&
        `${candidate.name} ${candidate.description}`.toLocaleLowerCase().includes(query),
    );
    const offset = (request.page - 1) * request.page_size;
    const installed = this.installed();
    return HARNESS_DISCOVERY_PAGE.parse({
      source: { id: catalogue.label, label: catalogue.label, url: source.url },
      snapshot: catalogue.commit,
      fetched_at: catalogue.fetchedAt.toISOString(),
      items: matching
        .slice(offset, offset + request.page_size)
        .map((candidate) => item(candidate, source, catalogue, installed)),
      total: matching.length,
      next_page: offset + request.page_size >= matching.length ? null : request.page + 1,
    });
  }

  private async catalogue(source: GitSource, refresh: boolean): Promise<Catalogue> {
    const key = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    const known = this.catalogues.get(key);
    if (
      !refresh &&
      known !== undefined &&
      this.now().getTime() - known.fetchedAt.getTime() < CACHE_MS
    )
      return known;
    const loaded = await withCheckout(source, async (checkout) => {
      const marketplace = await readMarketplace(checkout.directory, source.path);
      return {
        label: marketplace?.name ?? source.url,
        owner: marketplace?.owner ?? null,
        commit: checkout.commit,
        fetchedAt: this.now(),
        candidates: marketplace?.candidates ?? (await inspect(checkout.directory, source.path)),
      };
    });
    this.catalogues.set(key, loaded);
    return loaded;
  }
}

function item(
  candidate: Candidate,
  source: GitSource,
  catalogue: Catalogue,
  installed: ReadonlySet<string>,
): HarnessDiscoveryItem {
  const id = `${candidate.kind}:${candidate.name}`;
  const origin = candidate.source ?? {
    url: source.url,
    ...(source.ref === null ? {} : { ref: source.ref }),
    ...(candidate.path === '' ? {} : { path: candidate.path }),
  };
  return {
    id,
    kind: candidate.kind === 'skill' ? 'skill' : 'extension',
    name: candidate.name,
    description: candidate.description,
    publisher: catalogue.owner ?? catalogue.label,
    license: candidate.license,
    source_url: origin.url,
    installed_id: installed.has(id) ? id : null,
    install: { source: origin, select: candidate.source === undefined ? [candidate.name] : [] },
  };
}
