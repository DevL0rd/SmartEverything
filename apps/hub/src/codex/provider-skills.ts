import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { CodexClient } from './client';
import type { CodexJob } from './job';
import { RPC_RECORD } from './protocol';
import { CodexRuntimeError } from './errors';
import { SKILLS_LIST_PARAMS, SKILLS_LIST_REPLY } from './skills-protocol';

export const CODEX_COMMAND_REVISION = 'codex-app-server-0.162.1-compact-r1';
type SkillEntry = z.infer<typeof SKILLS_LIST_REPLY>['data'][number];
interface Binding {
  readonly client: CodexClient;
  readonly generation: string;
}
export class CodexProviderSkills {
  private binding: Binding | null = null;
  private readonly entries = new Map<string, Promise<SkillEntry>>();
  private reload = false;
  private readonly loaded = new Map<string, SkillEntry>();
  private currentRevision = CODEX_COMMAND_REVISION;
  get revision(): string {
    return this.currentRevision;
  }
  constructor(private readonly current: (job: CodexJob) => boolean) {}
  retain(job: CodexJob): void {
    if (this.binding !== null && !this.matches(job)) this.invalidate();
    this.binding = { client: job.client, generation: job.generation };
  }
  invalidate(): void {
    this.entries.clear();
    this.loaded.clear();
    this.reload = true;
    this.currentRevision = `${CODEX_COMMAND_REVISION}:skills:${randomUUID()}`;
  }
  peek(job: CodexJob): SkillEntry {
    this.requireCurrent(job);
    const entry = this.loaded.get(job.cwd);
    if (entry === undefined)
      throw new CodexRuntimeError(
        'provider_skills',
        'The current owned skill catalogue is unavailable.',
      );
    return entry;
  }
  async read(job: CodexJob, fresh = false): Promise<SkillEntry> {
    this.requireCurrent(job);
    const revision = this.revision;
    if (fresh) {
      this.entries.delete(job.cwd);
      this.loaded.delete(job.cwd);
    }
    let pending = this.entries.get(job.cwd);
    if (pending === undefined) {
      if (this.entries.size >= 200)
        throw new CodexRuntimeError('provider_skills', 'Native skill cache capacity was reached.');
      pending = this.load(job, revision, fresh);
      this.entries.set(job.cwd, pending);
    }
    try {
      const entry = await pending;
      this.requireCurrent(job, revision);
      this.loaded.set(job.cwd, entry);
      return entry;
    } catch (cause) {
      if (this.entries.get(job.cwd) === pending) this.entries.delete(job.cwd);
      throw cause;
    }
  }
  private async load(job: CodexJob, revision: string, fresh: boolean): Promise<SkillEntry> {
    const params = SKILLS_LIST_PARAMS.parse({ cwds: [job.cwd], forceReload: fresh || this.reload });
    const response = SKILLS_LIST_REPLY.parse(
      await job.client.request('skills/list', RPC_RECORD.parse(params)),
    );
    this.requireCurrent(job, revision);
    const entry = response.data[0];
    if (entry?.cwd !== job.cwd)
      throw new CodexRuntimeError(
        'provider_skills',
        'Native skills/list must return exactly the requested owned working directory.',
      );
    return entry;
  }
  private matches(job: CodexJob): boolean {
    return this.binding?.client === job.client && this.binding.generation === job.generation;
  }
  private requireCurrent(job: CodexJob, revision = this.revision): void {
    if (!this.current(job) || !this.matches(job) || revision !== this.revision)
      throw new CodexRuntimeError(
        'provider_skills',
        'The owned Codex client, process or native skill catalogue changed during discovery.',
      );
  }
}
