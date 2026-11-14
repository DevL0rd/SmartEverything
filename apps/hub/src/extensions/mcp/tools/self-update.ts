import {
  APP_PUBLICATION_RESULT,
  APP_PUBLICATION_STATUS,
  DESKTOP_RELEASE_RESULT,
  DESKTOP_RELEASE_STATUS,
  HUB_UPDATE_ACCEPTANCE,
  REPAIR_WORK_CLAIM_INPUT,
  SELF_UPDATE_APP_INPUT,
  SELF_UPDATE_DESKTOP_INPUT,
  SELF_UPDATE_FILE_INPUT,
  SELF_UPDATE_HUB_INPUT,
  SELF_UPDATE_INPUT,
  SELF_UPDATE_RECOVER_INPUT,
  SELF_UPDATE_UI_INPUT,
  hubUpdateOutcome,
  type AiChatRow,
  type AppPublicationInput,
  type DesktopReleaseInput,
  type RepairWorkComponent,
  type SelfUpdateInput,
} from '@smarteverything/domain';
import {
  runConfiguredUpdateCommand,
  runUpdateCommand,
  UpdateBusyError,
  UpdateUnavailableError,
} from '../../../self-update/command';
import { recoverHubUpdate } from '../../../self-update/execute';
import { sendChatFileLinkToChat, sendChatFileToChat } from '../../../self-update/chat-file';
import type { HubLayout } from '../../../data-layout';
import { AssistantFiles } from '../../../assistant/files';
import { readHubUpdate } from '../../../self-update/recovery';
import {
  defineTool,
  PHYSICAL,
  READS,
  WRITES,
  ToolError,
  type Tool,
  type ToolContext,
  type ToolOutput,
} from './registry';
import { profileCanClaim } from '../../../assistant/repair-work-recipient';
import { saveRepairWorkClaim } from '../../../store/repositories/repair-work-claims';
import { requireUpdateChat } from './self-update-owner';

type Update = Extract<SelfUpdateInput, { action: 'hub' }>;
type FileInput = Omit<Extract<SelfUpdateInput, { action: 'file' }>, 'action'>;

function layoutOf(context: ToolContext): HubLayout {
  requireUpdateChat(context);
  return context.layout;
}

function updateError(cause: unknown): never {
  if (cause instanceof UpdateUnavailableError) throw new ToolError(cause.message, 'unavailable');
  if (cause instanceof UpdateBusyError) throw new ToolError(cause.message, 'busy');
  throw cause;
}

async function update(context: ToolContext, input: Update): Promise<ToolOutput> {
  const chatId = requireUpdateChat(context);
  const profileId = context.store.aiChats.chat(chatId).profile_id;
  try {
    return {
      structured: HUB_UPDATE_ACCEPTANCE.parse(
        await runUpdateCommand(context.layout, input, { chatId, profileId }),
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

type ChatFile = Pick<FileInput, 'path' | 'name' | 'what'> & {
  readonly layout: HubLayout;
  readonly chat: AiChatRow;
};

async function shareLink(context: ToolContext, file: ChatFile): Promise<ToolOutput> {
  const settings = context.store.settings.read();
  const publicUrl = settings.public_url_verified_at === null ? null : settings.public_url;
  if (publicUrl === null)
    throw new ToolError(
      'Set and verify the hub’s public HTTPS address before sharing a file.',
      'unavailable',
    );
  return {
    structured: {
      ...(await sendChatFileLinkToChat(context.store, { ...file, publicUrl }, context.clock.now())),
      status: 'Download link already posted in this chat.',
    },
  };
}

async function share(context: ToolContext, { link, ...input }: FileInput): Promise<ToolOutput> {
  const chatId = requireUpdateChat(context);
  const { layout } = context;
  const file = { ...input, layout, chat: context.store.aiChats.chat(chatId) };
  if (link === true) return shareLink(context, file);
  const files = new AssistantFiles({
    layout,
    chat: context.store.assistantChat,
    now: (): Date => context.clock.now(),
  });
  files.attachMediaNotes(context.mediaNotes);
  return {
    structured: {
      ...(await sendChatFileToChat(context.store, files, file)),
      status: 'File already delivered as an attachment in this chat.',
    },
  };
}

function claimRepair(context: ToolContext, component: RepairWorkComponent): ToolOutput {
  const chatId = requireUpdateChat(context);
  const chat = context.store.aiChats.chat(chatId);
  if (
    chat.archived_at !== null ||
    chat.deletion_state !== null ||
    !profileCanClaim(context.store, component, chat.profile_id)
  )
    throw new ToolError('Use an active owner chat and a component you can manage.', 'forbidden');
  const { expiresAt } = saveRepairWorkClaim(
    context.store.settingsKv,
    { component, chatId, profileId: chat.profile_id },
    context.clock.now(),
  );
  return { structured: { component, chatId, expiresAt } };
}

export const SELF_UPDATE_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'self_update_status',
    input: SELF_UPDATE_INPUT.options[0].omit({ action: true }),
    annotations: READS,
    run: (context, input) => status(context, input.id),
  }),
  defineTool({
    name: 'self_update_hub',
    input: SELF_UPDATE_HUB_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: (context, input) => update(context, { ...input, action: 'hub' }),
  }),
  defineTool({
    name: 'self_update_app',
    input: SELF_UPDATE_APP_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: (context, input) => publishApp(context, { ...input, action: 'app' }),
  }),
  defineTool({
    name: 'self_update_ui',
    input: SELF_UPDATE_UI_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: (context, input) => publishApp(context, { ...input, action: 'ui' }),
  }),
  defineTool({
    name: 'self_update_desktop',
    input: SELF_UPDATE_DESKTOP_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: (context, input) => publishDesktop(context, { ...input, action: 'desktop' }),
  }),
  defineTool({
    name: 'send_chat_file',
    input: SELF_UPDATE_FILE_INPUT.omit({ action: true }),
    annotations: WRITES,
    answer: true,
    run: share,
  }),
  defineTool({
    name: 'claim_repair_work',
    input: REPAIR_WORK_CLAIM_INPUT,
    annotations: WRITES,
    run: (context, input) => claimRepair(context, input.component),
  }),
  defineTool({
    name: 'recover_hub_update',
    input: SELF_UPDATE_RECOVER_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: async (context, input) => ({
      structured: await recoverHubUpdate(layoutOf(context), input.id, input.holdSeconds),
    }),
  }),
];
