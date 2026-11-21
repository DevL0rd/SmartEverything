import { createHash } from 'node:crypto';
import {
  ApiError,
  HARNESS_SOURCE_ADD,
  HARNESS_SOURCES,
  type HarnessExtensionSourceRequest,
  type HarnessSourceEntry,
  type HarnessSources,
} from '@smarteverything/domain';
import type { HomeMirror } from '../store/home-mirror';
import { gitSourceOf } from './extension-source';

const KEY = 'harness_sources';
const SEEDED: readonly { readonly label: string; readonly url: string }[] = [
  { label: 'Anthropic skills', url: 'anthropics/skills' },
  { label: 'Official Claude plugins', url: 'anthropics/claude-plugins-official' },
];

export class HarnessSourceRegistry {
  constructor(private readonly saved: Pick<HomeMirror['saved'], 'read' | 'save'>) {}

  list(): HarnessSources {
    const saved = this.saved.read(KEY);
    if (saved === null)
      return { sources: SEEDED.map((seed) => entryOf(seed.label, { url: seed.url })) };
    return HARNESS_SOURCES.parse(saved);
  }

  async add(input: unknown): Promise<HarnessSources> {
    const request = HARNESS_SOURCE_ADD.parse(input);
    const added = entryOf(request.label ?? gitSourceOf(request.source).url, request.source);
    const current = this.list().sources;
    const known = current.some((entry) => entry.id === added.id);
    return this.save(
      known ? current.map((entry) => (entry.id === added.id ? added : entry)) : [...current, added],
    );
  }

  async remove(id: string): Promise<HarnessSources> {
    const current = this.list().sources;
    if (!current.some((entry) => entry.id === id))
      throw new ApiError('not_found', `There is no known source ${id}.`);
    return this.save(current.filter((entry) => entry.id !== id));
  }

  private async save(sources: readonly HarnessSourceEntry[]): Promise<HarnessSources> {
    const next = { sources: [...sources] };
    await this.saved.save(KEY, next);
    return next;
  }
}

function entryOf(label: string, source: HarnessExtensionSourceRequest): HarnessSourceEntry {
  const id = createHash('sha256')
    .update(JSON.stringify(gitSourceOf(source)))
    .digest('hex');
  return { id, label, source };
}
