import { createHash } from 'node:crypto';
import {
  ApiError,
  HARNESS_DISCOVERY_PAGE,
  HARNESS_DISCOVERY_REQUEST,
  sameHarnessGitOrigin,
  type HarnessDiscoveryItem,
  type HarnessDiscoveryPage,
  type HarnessDiscoveryRequest,
  type HarnessExtensionSourceRequest,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { availableVersion, inspect, readMarketplace, type Candidate } from './extension-inspect';
import { gitSourceOf, offerOrigin, withCheckout, type GitSource } from './extension-source';

const CACHE_MS = 60 * 60 * 1000;

export interface InstalledVersion {
  readonly version: string | null;
  readonly origin: GitSource | null;
}

interface Offer {
  readonly candidate: Candidate;
  readonly version: string | null;
  readonly origin: GitSource;
}

interface Catalogue {
  readonly request: HarnessExtensionSourceRequest;
  readonly label: string;
  readonly publisher: string;
  readonly commit: string;
  readonly fetchedAt: Date;
  readonly offers: readonly Offer[];
}

interface Listed {
  readonly offer: Offer;
  readonly catalogue: Catalogue;
}

type SourceResult =
  | { readonly status: 'loaded'; readonly catalogue: Catalogue }
  | { readonly status: 'unavailable'; readonly source: HarnessExtensionSourceRequest };

export class HarnessDiscovery {
  private readonly catalogues = new Map<string, Catalogue>();
  private readonly loading = new Map<string, Promise<Catalogue>>();
  private readonly log = new Logger('hub.harness-discovery');

  constructor(
    private readonly installed: () => ReadonlyMap<string, InstalledVersion>,
    private readonly known: () => readonly HarnessExtensionSourceRequest[],
    private readonly tmp: string,
    private readonly now: () => Date,
  ) {}

  async browse(input: unknown): Promise<HarnessDiscoveryPage> {
    const request = HARNESS_DISCOVERY_REQUEST.parse(input);
    const results = await this.browseSources(request);
    const catalogues = results.flatMap((result) =>
      result.status === 'loaded' ? [result.catalogue] : [],
    );
    const snapshot = catalogueSnapshot(catalogues);
    if (request.snapshot !== undefined && request.snapshot !== snapshot)
      throw new ApiError(
        'conflict',
        `The listing moved from snapshot ${request.snapshot} to ${snapshot}; start again from page 1.`,
        'snapshot_moved',
      );
    const installed = this.installed();
    const matching = ordered(
      catalogues
        .flatMap((catalogue) => catalogue.offers.map((offer) => ({ offer, catalogue })))
        .filter((listed) => wanted(listed, request, installed)),
      request.query.toLocaleLowerCase(),
    );
    const offset = (request.page - 1) * request.page_size;
    return HARNESS_DISCOVERY_PAGE.parse({
      sources: catalogues.map((catalogue) => ({
        source: catalogue.request,
        label: catalogue.label,
        publisher: catalogue.publisher,
        snapshot: catalogue.commit,
        fetched_at: catalogue.fetchedAt.toISOString(),
      })),
      unavailable_sources: results.flatMap((result) =>
        result.status === 'unavailable' ? [result.source] : [],
      ),
      snapshot,
      items: matching
        .slice(offset, offset + request.page_size)
        .map((listed) => item(listed, installed)),
      total: matching.length,
      next_page: offset + request.page_size >= matching.length ? null : request.page + 1,
    });
  }

  private async browseSources(request: HarnessDiscoveryRequest): Promise<readonly SourceResult[]> {
    if (request.source === undefined)
      return Promise.all(this.known().map((source) => this.browseKnown(source, request.refresh)));
    return [{ status: 'loaded', catalogue: await this.catalogue(request.source, request.refresh) }];
  }

  private async browseKnown(
    source: HarnessExtensionSourceRequest,
    refresh: boolean,
  ): Promise<SourceResult> {
    try {
      return { status: 'loaded', catalogue: await this.catalogue(source, refresh) };
    } catch (cause) {
      this.log.error('catalogue.source_unavailable', cause);
      return { status: 'unavailable', source };
    }
  }

  private async catalogue(
    request: HarnessExtensionSourceRequest,
    refresh: boolean,
  ): Promise<Catalogue> {
    const source = gitSourceOf(request);
    const key = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    const known = this.catalogues.get(key);
    if (
      !refresh &&
      known !== undefined &&
      this.now().getTime() - known.fetchedAt.getTime() < CACHE_MS
    )
      return known;
    const pending = this.loading.get(key);
    if (pending !== undefined) return pending;
    const load = this.load(request, source)
      .then((loaded) => {
        this.catalogues.set(key, loaded);
        return loaded;
      })
      .finally(() => {
        this.loading.delete(key);
      });
    this.loading.set(key, load);
    return load;
  }

  private load(request: HarnessExtensionSourceRequest, source: GitSource): Promise<Catalogue> {
    return withCheckout(this.tmp, source, async (checkout) => {
      const marketplace = await readMarketplace(checkout.directory, source.path);
      const candidates = marketplace?.candidates ?? (await inspect(checkout, source.path));
      const label = marketplace?.name ?? source.url;
      return {
        request,
        label,
        publisher: marketplace?.owner ?? label,
        commit: checkout.commit,
        fetchedAt: this.now(),
        offers: await Promise.all(
          candidates.map(async (candidate) => ({
            candidate,
            version: await availableVersion(checkout.directory, candidate),
            origin: offerOrigin(source, candidate),
          })),
        ),
      };
    });
  }
}

function catalogueSnapshot(catalogues: readonly Catalogue[]): string {
  return createHash('sha256')
    .update(JSON.stringify(catalogues.map(({ request, commit }) => [request, commit])))
    .digest('hex');
}

function idOf(candidate: Candidate): string {
  return `${candidate.kind}:${candidate.name}`;
}

function wanted(
  { offer, catalogue }: Listed,
  request: HarnessDiscoveryRequest,
  installed: ReadonlyMap<string, InstalledVersion>,
): boolean {
  const { candidate } = offer;
  if (request.kind !== undefined && candidate.kind !== request.kind) return false;
  if (
    request.publisher !== undefined &&
    catalogue.publisher.toLocaleLowerCase() !== request.publisher.toLocaleLowerCase()
  )
    return false;
  if (
    request.installed !== undefined &&
    (installedOffer(offer, installed) !== undefined) !== request.installed
  )
    return false;
  return true;
}

function installedOffer(
  { candidate, origin }: Offer,
  installed: ReadonlyMap<string, InstalledVersion>,
): InstalledVersion | undefined {
  const present = installed.get(idOf(candidate));
  const known = present?.origin ?? null;
  return known !== null && sameHarnessGitOrigin(known, origin) ? present : undefined;
}

function ordered(listed: readonly Listed[], query: string): readonly Listed[] {
  if (query === '') return listed;
  const rank = ({ offer: { candidate }, catalogue }: Listed): number => {
    const name = candidate.name.toLocaleLowerCase();
    if (name === query) return 0;
    if (name.includes(query)) return 1;
    if (candidate.description.toLocaleLowerCase().includes(query)) return 2;
    return catalogue.publisher.toLocaleLowerCase().includes(query) ? 3 : 4;
  };
  return listed
    .map((entry) => ({ entry, rank: rank(entry) }))
    .filter((ranked) => ranked.rank < 4)
    .sort((a, b) => a.rank - b.rank)
    .map((ranked) => ranked.entry);
}

function item(
  { offer, catalogue }: Listed,
  installed: ReadonlyMap<string, InstalledVersion>,
): HarnessDiscoveryItem {
  const { candidate, version, origin } = offer;
  const id = idOf(candidate);
  const present = installedOffer(offer, installed);
  return {
    id,
    kind: candidate.kind,
    name: candidate.name,
    description: candidate.description,
    publisher: catalogue.publisher,
    license: candidate.license,
    source_url: origin.url,
    executes: candidate.executes,
    reference: { source: catalogue.request, snapshot: catalogue.commit, id, origin },
    installed_id: present === undefined ? null : id,
    installed_version: present?.version ?? null,
    available_version: version,
    update: updateOf(present, version),
  };
}

function updateOf(
  present: InstalledVersion | undefined,
  available: string | null,
): HarnessDiscoveryItem['update'] {
  if (present === undefined) return 'not_installed';
  if (present.version === null || available === null) return 'unknown';
  return present.version === available ? 'current' : 'update_available';
}
