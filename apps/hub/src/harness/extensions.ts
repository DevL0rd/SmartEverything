import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  ApiError,
  HARNESS_EXTENSION_INSTALL,
  HARNESS_EXTENSION_PATCH,
  HARNESS_EXTENSION_SOURCE_REQUEST,
  HARNESS_SKILL_FILES,
  type AiHarnessExtensions,
  type HarnessExtensionItem,
  type HarnessExtensionPatch,
  type HarnessExtensionResolution,
  type HarnessExtensionSourceRequest,
  type HarnessExtensionTree,
} from '@smarteverything/domain';
import {
  HARNESS_BUILTIN_IDS,
  HarnessSkillAssets,
  bundledHarnessSkills,
  harnessTreeHash,
  includedHarnessExtension,
  parseMarkdownFile,
  readHarnessTree,
  writeHarnessTree,
  type HarnessExtensionKind,
} from '@smarteverything/harness';
import { Logger } from '@smarteverything/logging';
import type {
  HarnessExtensionsRepository,
  StoredExtension,
} from '../store/repositories/harness-extensions';
import type { HarnessConfigurationService } from './configuration';
import {
  choose,
  inspect,
  prepared,
  refreshed,
  resolved,
  type Candidate,
} from './extension-inspect';
import { builtinSelection, extensionItem, publisherOf } from './extension-items';
import {
  gitSourceOf,
  withCheckout,
  type CheckedOutSource,
  type GitSource,
} from './extension-source';

interface Staged {
  readonly row: StoredExtension;
  readonly tree: HarnessExtensionTree;
}

export interface ExtensionUpdateCounts {
  readonly updated: number;
  readonly unchanged: number;
  readonly skipped: number;
}

export class HarnessExtensions {
  readonly assets: HarnessSkillAssets;
  private readonly log = new Logger('hub.harness-extensions');
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly repository: HarnessExtensionsRepository,
    private readonly configuration: HarnessConfigurationService,
    private readonly directory: string,
    private readonly now: () => Date,
  ) {
    this.assets = new HarnessSkillAssets(join(directory, 'shared-skill-assets'), {
      read: (kind, asset): Promise<HarnessExtensionTree> =>
        this.tree(kind, asset.id, asset.version),
    });
  }

  catalogue(): AiHarnessExtensions {
    const builtins = this.repository.builtins();
    return {
      items: [
        ...HARNESS_BUILTIN_IDS.map((id) =>
          includedHarnessExtension(id, builtinSelection(builtins, id)),
        ),
        ...this.repository.list().map(extensionItem),
      ],
      bundled_skills: bundledHarnessSkills(),
    };
  }

  installed(): ReadonlySet<string> {
    return new Set(this.repository.list().map((row) => row.id));
  }

  async resolve(input: unknown): Promise<HarnessExtensionResolution> {
    const source = gitSourceOf(HARNESS_EXTENSION_SOURCE_REQUEST.parse(input));
    return withCheckout(source, async (checkout) => ({
      url: source.url,
      ref: source.ref,
      commit: checkout.commit,
      candidates: [...(await inspect(checkout.directory, source.path))],
    }));
  }

  install(input: unknown): Promise<HarnessExtensionItem[]> {
    const request = HARNESS_EXTENSION_INSTALL.parse(input);
    return this.serial(async () => {
      const items = await this.installFrom(
        request.source,
        request.select ?? [],
        request.confirm_executes,
      );
      this.configuration.refresh();
      return items;
    });
  }

  change(id: string, input: unknown): Promise<HarnessExtensionItem> {
    const patch = HARNESS_EXTENSION_PATCH.parse(input);
    return this.serial(() => {
      const item = HARNESS_BUILTIN_IDS.includes(id)
        ? this.changeBuiltin(id, patch)
        : this.changeStored(id, patch);
      this.configuration.refresh();
      return item;
    });
  }

  remove(id: string): Promise<void> {
    return this.serial(async () => {
      if (HARNESS_BUILTIN_IDS.includes(id))
        throw new ApiError(
          'invalid_request',
          'Built-in extensions switch off; they stay installed.',
        );
      const row = this.stored(id);
      await rm(this.folderOf(row.kind, row.name), { recursive: true, force: true });
      this.repository.remove(id);
      this.configuration.refresh();
    });
  }

  write(name: string, input: unknown): Promise<HarnessExtensionItem> {
    const body = HARNESS_SKILL_FILES.parse(input);
    return this.serial(async () => {
      const skill = body.files.find((file) => file.path === 'SKILL.md');
      const written = parseMarkdownFile(skill?.content ?? '').frontmatter;
      if (written.name !== name || written.description === undefined)
        throw new ApiError(
          'invalid_request',
          `SKILL.md must name the skill "${name}" and describe it in its front matter.`,
        );
      const tree = {
        files: body.files.map((file) => ({
          path: file.path,
          base64: Buffer.from(file.content).toString('base64'),
        })),
      };
      const previous = this.repository.find(`skill:${name}`);
      const row = this.row(
        {
          kind: 'skill',
          name,
          description: written.description,
          path: '',
          license: written.license ?? null,
          executes: false,
        },
        { source: { kind: 'editor' }, publisher: 'You', version: harnessTreeHash(tree), previous },
      );
      await this.commit({ row, tree });
      this.configuration.refresh();
      return extensionItem(row);
    });
  }

  async tree(
    kind: HarnessExtensionKind,
    id: string,
    version: string,
  ): Promise<HarnessExtensionTree> {
    const row = this.repository.find(id);
    if (row?.kind !== kind || row.version !== version)
      throw new ApiError('conflict', `${id} changed on the Home Hub; it will sync again.`);
    return readHarnessTree(this.folderOf(kind, row.name));
  }

  update(only: 'missing' | 'all'): Promise<ExtensionUpdateCounts> {
    return this.serial(async () => {
      const counts = { updated: 0, unchanged: 0, skipped: 0 };
      for (const row of this.repository.list()) {
        if (only === 'missing' && row.version !== null) continue;
        if (row.source.kind !== 'git') counts.skipped += 1;
        else counts[await this.refetch(row, row.source)] += 1;
      }
      this.configuration.refresh();
      return counts;
    });
  }

  private async refetch(
    row: StoredExtension,
    source: Extract<StoredExtension['source'], { kind: 'git' }>,
  ): Promise<keyof ExtensionUpdateCounts> {
    try {
      return await withCheckout(
        { url: source.url, ref: source.ref, path: source.path },
        async (checkout) => {
          const candidate = await refreshed(checkout.directory, source.path, row);
          const staged = await this.stage(candidate, {
            checkout,
            source: { url: source.url, ref: source.ref, path: source.path },
            confirm: false,
          });
          if (staged.row.version === row.version) return 'unchanged';
          await this.commit(staged);
          return 'updated';
        },
      );
    } catch (cause) {
      this.log.error('extensions.update_failed', cause, { id: row.id });
      return 'skipped';
    }
  }

  private async installFrom(
    request: HarnessExtensionSourceRequest,
    select: readonly string[],
    confirm: boolean,
  ): Promise<HarnessExtensionItem[]> {
    const source = gitSourceOf(request);
    return withCheckout(source, async (checkout) => {
      const chosen = choose(await inspect(checkout.directory, source.path), select);
      const items: HarnessExtensionItem[] = [];
      for (const candidate of chosen)
        items.push(
          ...(candidate.source === undefined
            ? [await this.installCandidate(candidate, { checkout, source, confirm })]
            : await this.installFrom(candidate.source, [], confirm)),
        );
      return items;
    });
  }

  private async installCandidate(
    candidate: Candidate,
    from: { checkout: CheckedOutSource; source: GitSource; confirm: boolean },
  ): Promise<HarnessExtensionItem> {
    const staged = await this.stage(candidate, from);
    if (staged.row.executes && !staged.row.confirmed)
      throw new ApiError(
        'invalid_request',
        `${candidate.name} runs hooks or MCP servers on your computers. Confirm to install it.`,
      );
    await this.commit(staged);
    return extensionItem(staged.row);
  }

  private async stage(
    candidate: Candidate,
    from: { checkout: CheckedOutSource; source: GitSource; confirm: boolean },
  ): Promise<Staged> {
    const folder = await resolved(from.checkout.directory, candidate.path);
    if (candidate.kind === 'plugin') await prepared(folder, candidate);
    const tree = await readHarnessTree(folder);
    const previous = this.repository.find(`${candidate.kind}:${candidate.name}`);
    const row = this.row(candidate, {
      source: {
        kind: 'git',
        url: from.source.url,
        ref: from.source.ref,
        path: candidate.path === '' ? null : candidate.path,
        commit: from.checkout.commit,
      },
      publisher: publisherOf(from.source.url),
      version: harnessTreeHash(tree),
      previous,
      confirm: from.confirm,
    });
    return { row, tree };
  }

  private row(
    candidate: Candidate,
    from: {
      readonly source: StoredExtension['source'];
      readonly publisher: string;
      readonly version: string;
      readonly previous: StoredExtension | undefined;
      readonly confirm?: boolean;
    },
  ): StoredExtension {
    return {
      id: `${candidate.kind}:${candidate.name}`,
      kind: candidate.kind,
      enabled: from.previous?.enabled ?? true,
      source: from.source,
      version: from.version,
      name: candidate.name,
      description: candidate.description,
      publisher: from.publisher,
      license: candidate.license,
      executes: candidate.executes,
      confirmed: candidate.executes && (from.confirm === true || from.previous?.confirmed === true),
      installed_at: from.previous?.installed_at ?? this.now().toISOString(),
    };
  }

  private async commit(staged: Staged): Promise<void> {
    const target = this.folderOf(staged.row.kind, staged.row.name);
    const incoming = `${target}.incoming`;
    await rm(incoming, { recursive: true, force: true });
    await mkdir(incoming, { recursive: true });
    await writeHarnessTree(incoming, staged.tree);
    await rm(target, { recursive: true, force: true });
    await mkdir(dirname(target), { recursive: true });
    await rename(incoming, target);
    this.repository.keep(staged.row);
  }

  private changeBuiltin(id: string, patch: HarnessExtensionPatch): HarnessExtensionItem {
    if (patch.confirm_executes !== undefined)
      throw new ApiError(
        'invalid_request',
        'Only plugins that run hooks or MCP servers need confirming.',
      );
    const current = builtinSelection(this.repository.builtins(), id);
    const next = {
      enabled: patch.enabled ?? current.enabled,
      config: patch.config ?? current.config,
    };
    this.repository.keepBuiltin(id, next);
    return includedHarnessExtension(id, next);
  }

  private changeStored(id: string, patch: HarnessExtensionPatch): HarnessExtensionItem {
    const row = this.stored(id);
    if (patch.config !== undefined)
      throw new ApiError('invalid_request', 'Only built-in extensions have settings.');
    if (patch.confirm_executes === true && !row.executes)
      throw new ApiError('invalid_request', `${row.name} runs no hooks or MCP servers.`);
    const next = {
      ...row,
      enabled: patch.enabled ?? row.enabled,
      confirmed: row.executes && (patch.confirm_executes ?? row.confirmed),
    };
    this.repository.keep(next);
    return extensionItem(next);
  }

  private stored(id: string): StoredExtension {
    const row = this.repository.find(id);
    if (row === undefined)
      throw new ApiError('not_found', `There is no installed skill or plugin ${id}.`);
    return row;
  }

  private folderOf(kind: HarnessExtensionKind, name: string): string {
    return join(this.directory, 'store', `${kind}s`, name);
  }

  private serial<T>(work: () => Promise<T> | T): Promise<T> {
    const next = this.tail.then(work, work);
    // eslint-disable-next-line local/no-swallowed-errors -- the caller receives the same failure from the task result
    this.tail = next.catch(() => undefined);
    return next;
  }
}
