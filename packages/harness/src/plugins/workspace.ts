import type { Context } from '@deepseek-ai/cordis';
import { appendPluginRecord } from '@deepseek-ai/dsh-session';
import type { Session } from '@deepseek-ai/dsh-session';
import * as Present from '@deepseek-ai/dsh-tool-present';
import * as WorkspaceChanges from '@deepseek-ai/dsh-workspace-changes';
import type {
  WorkspaceChangesSummary,
  WorkspaceFileDiff,
} from '@deepseek-ai/dsh-workspace-changes';
import {
  WORKSPACE_CHANGES_RECORD,
  WORKSPACE_CHANGES_RECORD_DATA,
  WORKSPACE_STATE_RECORD,
  WORKSPACE_STATE_RECORD_DATA,
} from '@smarteverything/domain';
import type { WorkspaceChangesRecordData, WorkspaceStateRecordData } from '@smarteverything/domain';
import { provideAgentLoopSettings } from './goals';

declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    'plugin:smarteverything/workspace-changes': WorkspaceChangesRecordData;
    'plugin:smarteverything/workspace-state': WorkspaceStateRecordData;
  }
}

export const name = 'workspace';

export const WORKSPACE_TOOL_NAMES = ['present'] as const;

function topLevelWithDirectory(session: Session): boolean {
  const { cwd, origin, delegationDepth } = session.header;
  return cwd !== undefined && origin !== 'subagent' && (delegationDepth ?? 0) === 0;
}

function recordFile(
  summary: WorkspaceChangesSummary,
  diffs: readonly (WorkspaceFileDiff | undefined)[],
): WorkspaceChangesRecordData['files'] {
  return summary.files.map((file, index) => ({
    path: file.path,
    display: file.display,
    added: file.added,
    deleted: file.deleted,
    ...(file.binary === true ? { binary: true as const } : {}),
    ...(file.oversized === true ? { oversized: true as const } : {}),
    diff: diffs[index] ?? null,
  }));
}

function recordOf(
  seq: number,
  summary: WorkspaceChangesSummary,
  diffs: readonly (WorkspaceFileDiff | undefined)[],
): WorkspaceChangesRecordData {
  return WORKSPACE_CHANGES_RECORD_DATA.parse({
    seq,
    turn: summary.turn,
    cwd: summary.cwd,
    files: recordFile(summary, diffs),
    total: summary.total,
    added: summary.added,
    deleted: summary.deleted,
    ...(summary.snapshot === undefined ? {} : { snapshot: summary.snapshot }),
  });
}

class WorkspaceRecorder {
  private readonly lifetime = new AbortController();
  private readonly noted = new WeakSet<Session>();
  private git: Promise<boolean> | undefined;

  constructor(private readonly ctx: Context) {}

  observe(): void {
    const { ctx } = this;
    ctx.effect(() => (): void => {
      this.lifetime.abort();
    });
    ctx.on('session/event', (session, event) => {
      if (event.type === 'turn/start' && topLevelWithDirectory(session))
        this.later('git state', () => this.noteGit(session));
      if (event.type === 'workspace/changes')
        this.later('changes', () => this.recordChanges(session, event.seq));
    });
  }

  private later(what: string, work: () => Promise<void>): void {
    queueMicrotask(() => {
      work().catch((cause: unknown) => {
        this.ctx.logger.error(`workspace ${what} record failed`, cause);
      });
    });
  }

  private gitPresent(): Promise<boolean> {
    this.git ??= this.ctx.subprocess.resolveExecutable('git', undefined, this.lifetime.signal).then(
      () => true,
      () => false,
    );
    return this.git;
  }

  private async noteGit(session: Session): Promise<void> {
    if (this.noted.has(session)) return;
    this.noted.add(session);
    const present = await this.gitPresent();
    appendPluginRecord(
      session,
      WORKSPACE_STATE_RECORD,
      WORKSPACE_STATE_RECORD_DATA.parse({ git: present ? 'present' : 'missing' }),
    );
  }

  private async recordChanges(session: Session, seq: number): Promise<void> {
    const summary = this.ctx.workspaceChanges.summary(session.id, seq);
    if (summary === undefined) {
      this.ctx.logger.warn(`workspace changes of event ${String(seq)} are no longer available`);
      return;
    }
    const diffs: (WorkspaceFileDiff | undefined)[] = [];
    for (const index of summary.files.keys())
      diffs.push(
        await this.ctx.workspaceChanges.diff(session.id, seq, index, this.lifetime.signal),
      );
    appendPluginRecord(session, WORKSPACE_CHANGES_RECORD, recordOf(seq, summary, diffs));
  }
}

async function mountPresent(scope: Context): Promise<void> {
  const { present_max_files: maxFiles } = scope.agentLoopSettings.settings.workspace;
  if (maxFiles === undefined) await scope.plugin(Present);
  else await scope.plugin(Present, { maxFiles });
}

export async function mount(ctx: Context): Promise<void> {
  await provideAgentLoopSettings(ctx);
  await ctx.plugin(WorkspaceChanges);
  await ctx.inject(['agentLoopSettings'], mountPresent);
  await ctx.inject(['subprocess', 'workspaceChanges'], (active: Context): void => {
    new WorkspaceRecorder(active).observe();
  });
}
