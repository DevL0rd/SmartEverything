import {
  APP_PUBLICATION_RESULT,
  APP_PUBLICATION_STATUS,
  DESKTOP_RELEASE_RESULT,
  DESKTOP_RELEASE_STATUS,
  HUB_UPDATE_ACCEPTANCE,
  UPDATE_APP_INPUT,
  UPDATE_DESKTOP_INPUT,
  UPDATE_HUB_INPUT,
  UPDATE_RECOVER_INPUT,
  UPDATE_STATUS_INPUT,
  UPDATE_UI_INPUT,
  hubUpdateOutcome,
  type AppPublicationInput,
  type DesktopReleaseInput,
  type UpdateInput,
} from '@smarteverything/domain';
import {
  runConfiguredUpdateCommand,
  runUpdateCommand,
  UpdateBusyError,
  UpdateUnavailableError,
} from '../../../self-update/command';
import { recoverHubUpdate } from '../../../self-update/execute';
import type { HubLayout } from '../../../data-layout';
import { readHubUpdate } from '../../../self-update/recovery';
import {
  defineTool,
  PHYSICAL,
  READS,
  ToolError,
  type Tool,
  type ToolContext,
  type ToolOutput,
} from './registry';
import { requireUpdateRequester } from './update-requester';

type Update = Extract<UpdateInput, { action: 'hub' }>;

function layoutOf(context: ToolContext): HubLayout {
  requireUpdateRequester(context);
  return context.layout;
}

function updateError(cause: unknown): never {
  if (cause instanceof UpdateUnavailableError) throw new ToolError(cause.message, 'unavailable');
  if (cause instanceof UpdateBusyError) throw new ToolError(cause.message, 'busy');
  throw cause;
}

async function update(context: ToolContext, input: Update): Promise<ToolOutput> {
  const { chatId, profileId } = requireUpdateRequester(context);
  const origin = chatId === null ? undefined : { chatId, profileId };
  try {
    return {
      structured: HUB_UPDATE_ACCEPTANCE.parse(
        await runUpdateCommand(context.layout, input, origin),
      ),
    };
  } catch (cause) {
    updateError(cause);
  }
}

function publicServer(context: ToolContext): string {
  const settings = context.store.settings.read();
  const server = settings.public_url_verified_at === null ? null : settings.public_url;
  if (server === null || new URL(server).protocol !== 'https:')
    throw new ToolError(
      'Set and verify the hub’s public HTTPS address before publishing an update.',
      'unavailable',
    );
  return server;
}

async function publication(
  context: ToolContext,
  script: 'self-update-app-command.ts' | 'self-update-desktop-command.ts',
  input: AppPublicationInput | DesktopReleaseInput,
): Promise<Readonly<Record<string, unknown>>> {
  const layout = layoutOf(context);
  try {
    return await runConfiguredUpdateCommand(script, layout, {
      input,
      server: publicServer(context),
    });
  } catch (cause) {
    if (cause instanceof UpdateBusyError)
      throw new ToolError(
        'An update is being prepared. Check its request ID in status before retrying.',
        'busy',
      );
    updateError(cause);
  }
}

async function publishApp(context: ToolContext, input: AppPublicationInput): Promise<ToolOutput> {
  const result = await publication(context, 'self-update-app-command.ts', input);
  return { structured: APP_PUBLICATION_RESULT.parse(result) };
}

async function publishDesktop(
  context: ToolContext,
  input: DesktopReleaseInput,
): Promise<ToolOutput> {
  const result = await publication(context, 'self-update-desktop-command.ts', input);
  return { structured: DESKTOP_RELEASE_RESULT.parse(result) };
}

async function runStatus(
  layout: HubLayout,
  script: 'self-update-app-command.ts' | 'self-update-desktop-command.ts',
  runId: string,
): Promise<Readonly<Record<string, unknown>>> {
  try {
    return await runConfiguredUpdateCommand(script, layout, { runId });
  } catch (cause) {
    if (cause instanceof UpdateBusyError)
      throw new ToolError(
        'An update is still being prepared. Its outcome is not known yet.',
        'busy',
      );
    updateError(cause);
  }
}

async function runStatusOutput(layout: HubLayout, runId: string): Promise<ToolOutput> {
  const app = APP_PUBLICATION_STATUS.parse(
    await runStatus(layout, 'self-update-app-command.ts', runId),
  );
  if (app.publication !== null) return { structured: { release: null, ...app } };
  const desktop = DESKTOP_RELEASE_STATUS.parse(
    await runStatus(layout, 'self-update-desktop-command.ts', runId),
  );
  return { structured: { release: null, ...(desktop.desktop === null ? app : desktop) } };
}

async function status(context: ToolContext, runId: string | undefined): Promise<ToolOutput> {
  const layout = layoutOf(context);
  const release = await readHubUpdate(layout, runId);
  if (release === null)
    return runId === undefined ? { structured: { release: null } } : runStatusOutput(layout, runId);
  return {
    structured: {
      release: {
        runId: release.runId,
        phase: release.phase,
        outcome: hubUpdateOutcome(release),
        backup: release.backup,
        checks: release.checks,
        failedChecks: release.failedChecks,
        reason: release.reason,
        finishedAt: release.finishedAt,
      },
    },
  };
}

export const UPDATE_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'update_status',
    input: UPDATE_STATUS_INPUT.omit({ action: true }),
    annotations: READS,
    run: (context, input) => status(context, input.id),
  }),
  defineTool({
    name: 'update_hub',
    input: UPDATE_HUB_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: (context, input) => update(context, { ...input, action: 'hub' }),
  }),
  defineTool({
    name: 'update_app',
    input: UPDATE_APP_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: (context, input) => publishApp(context, { ...input, action: 'app' }),
  }),
  defineTool({
    name: 'update_ui',
    input: UPDATE_UI_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: (context, input) => publishApp(context, { ...input, action: 'ui' }),
  }),
  defineTool({
    name: 'update_desktop',
    input: UPDATE_DESKTOP_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: (context, input) => publishDesktop(context, { ...input, action: 'desktop' }),
  }),
  defineTool({
    name: 'update_recover',
    input: UPDATE_RECOVER_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: async (context, input) => ({
      structured: await recoverHubUpdate(layoutOf(context), input.id, input.holdSeconds),
    }),
  }),
];
