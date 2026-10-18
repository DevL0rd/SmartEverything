import type { Context } from '@deepseek-ai/cordis';
import type { Config, FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
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
import { access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { HarnessHost } from '../host/contracts';
import type { InstalledHarnessSkillAsset } from './skill-assets';

const loadSkillFilesystem = createLazyRequire<typeof SkillFilesystem>(
  '@deepseek-ai/dsh-skill-filesystem',
  import.meta.url,
);
const CLAUDE_SKILLS = '.claude/skills';
const SKILL_FILE = 'SKILL.md';
const EMPTY: SkillProviderObservation = { candidates: [], complete: true };

export function filesystemSkillProvider(
  ctx: Context,
  control: SkillProviderControl,
  config: Config,
): FileSystemSkillProvider {
  const { FileSystemSkillProvider } = loadSkillFilesystem();
  return new FileSystemSkillProvider(ctx, control, config);
}

export class NativeWorkspaceSkills implements SkillProvider {
  readonly name = 'smarteverything-local-filesystem';
  private readonly native: FileSystemSkillProvider;
  private readonly userClaude: FileSystemSkillProvider;
  private readonly projectClaude = new Map<string, FileSystemSkillProvider>();

  constructor(
    private readonly ctx: Context,
    private readonly host: HarnessHost,
    private readonly control: SkillProviderControl,
    private readonly assets: readonly InstalledHarnessSkillAsset[],
  ) {
    this.native = filesystemSkillProvider(ctx, control, {
      providerName: this.name,
      dshHome: host.stateDirectory,
      agentsHome: join(host.homeDirectory, '.agents'),
      customSkillDirs: assets.map((asset) => asset.directory),
    });
    this.userClaude = this.claudeProvider(join(host.homeDirectory, CLAUDE_SKILLS));
    ctx.on('fs/observed', (target, _observation, actor): void => {
      if (actor === undefined || !('name' in actor)) return;
      if (actor.name !== 'write' && actor.name !== 'edit') return;
      this.native.observeHostMutation(target.displayPath);
      this.userClaude.observeHostMutation(target.displayPath);
      for (const provider of this.projectClaude.values()) {
        provider.observeHostMutation(target.displayPath);
      }
    });
  }

  async list(options: SkillLookupOptions): Promise<SkillProviderObservation> {
    const project = await this.projectProvider(options.cwd);
    const [native, claude, user] = await Promise.all([
      this.native.list(options).then(observation),
      project === undefined ? EMPTY : project.list(options).then(observation),
      this.userClaude.list(options).then(observation),
    ]);
    return {
      candidates: [
        ...native.candidates.filter(
          (candidate) => candidate.source !== 'custom' || this.isEntrypoint(candidate),
        ),
        ...claude.candidates,
        ...user.candidates,
      ],
      complete: native.complete && claude.complete && user.complete,
    };
  }

  get(
    candidate: SkillCandidate,
    options: SkillLookupOptions,
  ): Promise<SkillDefinition | undefined> {
    return this.native.get(candidate, options);
  }

  private isEntrypoint(candidate: SkillCandidate): boolean {
    return this.assets.some((asset) => join(asset.directory, SKILL_FILE) === candidate.path);
  }

  private async projectProvider(
    cwd: string | undefined,
  ): Promise<FileSystemSkillProvider | undefined> {
    if (cwd === undefined) return undefined;
    const root = join(await projectRoot(resolve(cwd)), CLAUDE_SKILLS);
    if (root === join(this.host.homeDirectory, CLAUDE_SKILLS)) return undefined;
    const known = this.projectClaude.get(root);
    if (known !== undefined) return known;
    const provider = this.claudeProvider(root);
    this.projectClaude.set(root, provider);
    return provider;
  }

  private claudeProvider(directory: string): FileSystemSkillProvider {
    return filesystemSkillProvider(this.ctx, this.control, {
      providerName: this.name,
      includeDefaultRoots: false,
      customSkillDirs: [directory],
    });
  }
}

async function projectRoot(cwd: string): Promise<string> {
  for (let current = cwd; ; current = dirname(current)) {
    if (await exists(join(current, '.git'))) return current;
    if (dirname(current) === current) return cwd;
  }
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

function observation(
  observed: readonly SkillCandidate[] | SkillProviderObservation,
): SkillProviderObservation {
  return 'candidates' in observed
    ? { candidates: observed.candidates, complete: observed.complete }
    : { candidates: observed, complete: true };
}
