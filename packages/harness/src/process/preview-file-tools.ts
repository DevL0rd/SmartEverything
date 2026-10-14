import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import {
  AI_FILE_PREVIEW_WRITE,
  AI_HTML_PREVIEW_PUBLICATION,
  JSON_VALUE,
  type AiHtmlPreviewPublication,
  type JsonValue,
} from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';
import type { HarnessHttp } from './http';
import type { HttpHarnessPersistence } from './persistence';
import type { NativePreviewAdapter } from './preview-tools';
import { previewFileScope, readPreviewFile } from './preview-file-read';
import { PreviewFileWatch } from './preview-file-watch';
const CALL = z.object({ callId: z.string(), name: z.string(), arguments: z.string() });
const DONE = z.object({ ok: z.literal(true) });
interface OwnedFile {
  readonly claim: ReturnType<HttpHarnessPersistence['claim']>;
  readonly handle: string;
  readonly workspace: string;
  readonly validate: () => Promise<void>;
}
interface PreparedFile {
  readonly agent: NonNullable<ToolRunContext['agent']>;
  readonly owned: OwnedFile;
  readonly file: Awaited<ReturnType<typeof previewFileScope>>;
  readonly html: string;
  readonly title: string;
  readonly lineage: {
    readonly call_id: string;
    readonly call_seq: number;
    readonly arguments: Readonly<Record<string, JsonValue>>;
  };
}
export class NativePreviewFileTools {
  private readonly calls = new Map<
    string,
    { readonly sequence: number; readonly arguments: string }
  >();
  constructor(
    private readonly http: HarnessHttp,
    private readonly persistence: HttpHarnessPersistence,
    private readonly adapter: NativePreviewAdapter,
  ) {}
  install(ctx: Context): void {
    ctx.on('session/event', (session, event) => {
      if (event.type !== 'tool/call') return;
      const call = CALL.parse(event.data);
      if (call.name === 'publish_file_preview')
        this.calls.set(`${session.id}:${call.callId}`, {
          sequence: event.seq,
          arguments: call.arguments,
        });
    });
    ctx.on('tools/result', (execution) => {
      if (execution.agent !== undefined)
        this.calls.delete(`${execution.agent.id}:${execution.callId}`);
    });
    const parameters = z.toJSONSchema(AI_FILE_PREVIEW_WRITE, { io: 'input' });
    if (parameters.type !== 'object')
      throw new HarnessRuntimeError(
        'composition_incompatible',
        'File preview arguments must be an object.',
      );
    ctx.tools.register({
      name: 'publish_file_preview',
      description:
        'Show an HTML file inside this current workspace in the chat browser without starting a development server. The app opens it automatically; file changes reload it automatically. Self-contained HTML only; no arbitrary filesystem/network access. Returns the publication once, never poll for changes.',
      parameters: { ...parameters, type: 'object' },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: (raw, execution) => this.execute(ctx, raw, execution),
    });
  }
  private async execute(
    ctx: Context,
    value: unknown,
    execution: ToolRunContext,
  ): Promise<AiHtmlPreviewPublication> {
    const { agent, owned, file, html, title, lineage } = await this.prepare(ctx, value, execution);
    const abort = new AbortController();
    const admission = AbortSignal.any([execution.signal, abort.signal]);
    let watch: PreviewFileWatch | null = null;
    this.adapter.registerFile(owned.handle, agent.id, () => {
      abort.abort();
      watch?.stop();
    });
    try {
      await ctx.sessions.flush(agent.session);
      const publication = await this.http.call(
        {
          operation: 'preview_file_publish',
          claim: owned.claim,
          watch_handle: owned.handle,
          workspace: owned.workspace,
          file_path: file.path,
          html,
          title,
          ...lineage,
        },
        AI_HTML_PREVIEW_PUBLICATION,
        admission,
      );
      admission.throwIfAborted();
      watch = this.watch(file, { html, initial: publication, owned, signal: abort.signal });
      watch.start();
      return publication;
    } catch (cause) {
      this.adapter.forget(owned.handle);
      await this.abandon(owned);
      throw cause;
    }
  }
  private async prepare(
    ctx: Context,
    value: unknown,
    execution: ToolRunContext,
  ): Promise<PreparedFile> {
    const agent = execution.agent;
    if (agent === undefined)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'File previews require an owned native chat.',
      );
    const call = this.calls.get(`${agent.id}:${execution.callId}`);
    const raw = z.record(z.string(), JSON_VALUE).parse(value);
    if (call === undefined || !isDeepStrictEqual(JSON.parse(call.arguments), raw))
      throw new HarnessRuntimeError(
        'ownership_lost',
        'The HTML file has no exact native tool lineage.',
      );
    const input = AI_FILE_PREVIEW_WRITE.parse(raw);
    const owned = this.owned(ctx, agent);
    await owned.validate();
    const file = await previewFileScope(owned.workspace, input.file_path);
    const html = await readPreviewFile(file);
    return {
      agent,
      owned,
      file,
      html,
      title: input.title,
      lineage: { call_id: execution.callId, call_seq: call.sequence, arguments: raw },
    };
  }
  private owned(ctx: Context, agent: NonNullable<ToolRunContext['agent']>): OwnedFile {
    const workspace = ctx.workingDirectory.get(agent.session);
    const claim = this.persistence.claim(agent.id);
    const validate = async (): Promise<void> => {
      if (
        ctx.workingDirectory.get(agent.session) !== workspace ||
        ctx.permissionPresets.resolve(ctx.permissionPresets.current(agent.session)).sandbox ===
          'read-only'
      )
        throw new HarnessRuntimeError(
          'ownership_lost',
          'The file preview workspace or native permission changed.',
        );
      await this.persistence.verify(claim);
    };
    return { claim, workspace, handle: randomUUID(), validate };
  }
  private watch(
    file: Awaited<ReturnType<typeof previewFileScope>>,
    input: {
      readonly html: string;
      readonly initial: AiHtmlPreviewPublication;
      readonly owned: OwnedFile;
      readonly signal: AbortSignal;
    },
  ): PreviewFileWatch {
    const { html, initial, owned, signal } = input;
    let publication = initial;
    return new PreviewFileWatch(file, html, {
      validate: async (): Promise<void> => {
        signal.throwIfAborted();
        await owned.validate();
        await this.http.call(
          {
            operation: 'preview_file_validate',
            claim: owned.claim,
            publication_id: publication.id,
            watch_handle: owned.handle,
          },
          DONE,
          signal,
        );
      },
      publish: async (content): Promise<void> => {
        publication = await this.http.call(
          {
            operation: 'preview_file_update',
            claim: owned.claim,
            publication_id: publication.id,
            revision: publication.revision,
            watch_handle: owned.handle,
            html: content,
          },
          AI_HTML_PREVIEW_PUBLICATION,
          signal,
        );
      },
      failed: (cause): void => {
        this.adapter.reportFileFailure(cause);
        this.adapter.forget(owned.handle);
        void this.abandon(owned);
      },
    });
  }
  private async abandon(owned: OwnedFile): Promise<void> {
    try {
      await this.http.call(
        { operation: 'preview_file_abandon', claim: owned.claim, watch_handle: owned.handle },
        DONE,
      );
    } catch (cause) {
      this.adapter.reportFileFailure(cause);
    }
  }
}
