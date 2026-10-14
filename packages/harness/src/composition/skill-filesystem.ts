import { withCodingProcess } from './coding-process';
import { ProjectFileSystem } from './project-filesystem';
import type { Context } from '@deepseek-ai/cordis';
import type { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import type * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem';
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require';
import type {
  SkillCandidate,
  SkillDefinition,
  SkillLookupOptions,
  SkillProvider,
  SkillProviderControl,
  SkillProviderObservation,
} from '@deepseek-ai/dsh-skill';
import { watch, type FSWatcher } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { HarnessHost } from '../host/contracts';
import { Logger, describeFailure } from '@smarteverything/logging';
import type { InstalledHarnessSkillAsset } from './skill-assets';

const MAX_WATCHED_PROJECTS = 32;
const loadSkillFilesystem = createLazyRequire<typeof SkillFilesystem>(
  '@deepseek-ai/dsh-skill-filesystem',
  import.meta.url,
);

interface WorkspaceSkillSelection {
  readonly assets: readonly InstalledHarnessSkillAsset[];
  readonly codingProcessAssets: readonly string[];
}

export class NativeWorkspaceSkills implements SkillProvider {
  readonly name = 'smarteverything-local-filesystem';
  private readonly assets: readonly InstalledHarnessSkillAsset[];
  private readonly codingProcessAssets: readonly string[];
  private readonly native: FileSystemSkillProvider;
  private readonly watchers = new Map<string, FSWatcher[]>();
  private incomplete = false;
  private readonly log = new Logger('desktop.harness-skills');

  constructor(
    ctx: Context,
    private readonly host: HarnessHost,
    private readonly control: SkillProviderControl,
    selection: readonly InstalledHarnessSkillAsset[] | WorkspaceSkillSelection = [],
  ) {
    const selected = workspaceSkillSelection(selection);
    this.assets = selected.assets;
    this.codingProcessAssets = selected.codingProcessAssets;
    const { FileSystemSkillProvider } = loadSkillFilesystem();
    const assetContext = ctx.fs instanceof ProjectFileSystem ? ctx.fs.runtimeFileContext(ctx) : ctx;
    this.native = new FileSystemSkillProvider(assetContext, control, {
      providerName: this.name,
      dshHome: host.stateDirectory,
      agentsHome: join(host.homeDirectory, '.agents'),
      includeDefaultRoots: true,
      watch: false,
      customSkillDirs: this.assets.map((asset) => asset.directory),
    });
    ctx.effect(() => (): void => {
      this.closeWatchers();
    });
    ctx.on('fs/observed', (target, _observation, actor): void => {
      if (actor === undefined || !('name' in actor)) return;
      if (actor.name !== 'write' && actor.name !== 'edit') return;
      this.native.observeHostMutation(target.displayPath);
      control.invalidate();
    });
  }

  async list(options: SkillLookupOptions): Promise<SkillProviderObservation> {
    options.signal?.throwIfAborted();
    for (const asset of this.assets) await asset.verify();
    const observed = await this.native.list(options);
    const candidates = ('candidates' in observed ? observed.candidates : observed).filter(
      (candidate) =>
        candidate.source !== 'custom' ||
        this.assets.some((asset) => asset.entrypoint === candidate.path),
    );
    const roots = this.roots(options.cwd, candidates);
    const complete = await this.observe(roots);
    return {
      candidates,
      complete: complete && !this.incomplete && (!('complete' in observed) || observed.complete),
    };
  }

  async get(
    candidate: SkillCandidate,
    options: SkillLookupOptions,
  ): Promise<SkillDefinition | undefined> {
    const asset =
      candidate.source === 'custom'
        ? this.assets.find((item) => item.entrypoint === candidate.path)
        : undefined;
    if (candidate.source === 'custom' && asset === undefined)
      throw new Error('Distributed skill candidate has no verified immutable asset.');
    if (asset !== undefined) await asset.verify();
    const definition = await this.native.get(candidate, options);
    if (
      definition === undefined ||
      asset === undefined ||
      !this.codingProcessAssets.includes(asset.asset.id)
    )
      return definition;
    return withCodingProcess(definition);
  }

  private roots(cwd: string | undefined, candidates: readonly SkillCandidate[]): readonly string[] {
    const project =
      cwd === undefined ? [] : [join(cwd, '.dsh/skills'), join(cwd, '.agents/skills')];
    const discovered = candidates.flatMap((candidate) =>
      candidate.path === undefined
        ? []
        : [
            basename(candidate.path) === 'SKILL.md'
              ? dirname(dirname(candidate.path))
              : dirname(candidate.path),
          ],
    );
    return [
      ...new Set([
        ...project,
        join(this.host.stateDirectory, 'skills'),
        join(this.host.homeDirectory, '.agents/skills'),
        ...discovered,
      ]),
    ];
  }

  private async observe(roots: readonly string[]): Promise<boolean> {
    if (this.control.signal.aborted) return false;
    for (const root of roots) {
      if (this.watchers.has(root)) continue;
      if (this.watchers.size >= MAX_WATCHED_PROJECTS) {
        this.evictWatcher();
        this.control.invalidate();
      }
      const watches = await this.watchRoot(root);
      if (watches === undefined) return false;
      this.watchers.set(root, watches);
    }
    return true;
  }

  private async watchRoot(root: string): Promise<FSWatcher[] | undefined> {
    const anchor = await existingDirectory(root);
    if (this.control.signal.aborted) return undefined;
    try {
      const observer = watch(
        anchor,
        { recursive: anchor === root, persistent: false },
        (): void => {
          this.evictWatcher(root);
          this.control.invalidate();
        },
      );
      observer.on('error', (): void => {
        this.incomplete = true;
        this.evictWatcher(root);
        this.control.invalidate();
      });
      return [observer];
    } catch (error) {
      this.log.warn('skills.observation_unavailable', { failure: describeFailure(error) });
      return undefined;
    }
  }

  private evictWatcher(root: string | undefined = this.watchers.keys().next().value): void {
    if (root === undefined) return;
    for (const watcher of this.watchers.get(root) ?? []) watcher.close();
    this.watchers.delete(root);
  }

  private closeWatchers(): void {
    for (const root of this.watchers.keys()) this.evictWatcher(root);
  }
}

async function existingDirectory(path: string): Promise<string> {
  try {
    if ((await stat(path)).isDirectory()) return path;
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const parent = dirname(path);
  if (parent === path) throw new Error('Native skill observation requires an existing directory.');
  return existingDirectory(parent);
}

function workspaceSkillSelection(
  selection: readonly InstalledHarnessSkillAsset[] | WorkspaceSkillSelection,
): WorkspaceSkillSelection {
  if ('assets' in selection) return selection;
  return { assets: selection, codingProcessAssets: [] };
}
