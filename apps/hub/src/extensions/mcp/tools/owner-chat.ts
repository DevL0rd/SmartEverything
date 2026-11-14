import {
  CHAT_FILE_SEND_INPUT,
  REPAIR_WORK_CLAIM_INPUT,
  type AiChatRow,
  type ChatFileSendInput,
  type RepairWorkComponent,
} from '@smarteverything/domain';
import { AssistantFiles } from '../../../assistant/files';
import { profileCanClaim } from '../../../assistant/repair-work-recipient';
import type { HubLayout } from '../../../data-layout';
import { sendChatFileLinkToChat, sendChatFileToChat } from '../../../self-update/chat-file';
import { saveRepairWorkClaim } from '../../../store/repositories/repair-work-claims';
import {
  defineTool,
  WRITES,
  ToolError,
  type Tool,
  type ToolContext,
  type ToolOutput,
} from './registry';
import { requesterChat } from './update-requester';

type ChatFile = Pick<ChatFileSendInput, 'path' | 'name' | 'what'> & {
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
      status: 'Download link already posted in the chat.',
    },
  };
}

async function share(
  context: ToolContext,
  { link, ...input }: ChatFileSendInput,
): Promise<ToolOutput> {
  const chat = await requesterChat(context);
  const file = { ...input, layout: context.layout, chat };
  if (link === true) return shareLink(context, file);
  const files = new AssistantFiles({
    layout: context.layout,
    chat: context.store.assistantChat,
    now: (): Date => context.clock.now(),
  });
  files.attachMediaNotes(context.mediaNotes);
  return {
    structured: {
      ...(await sendChatFileToChat(context.store, files, file)),
      status: 'File already delivered as an attachment in the chat.',
    },
  };
}

async function claim(context: ToolContext, component: RepairWorkComponent): Promise<ToolOutput> {
  const chat = await requesterChat(context);
  if (
    chat.archived_at !== null ||
    chat.deletion_state !== null ||
    !profileCanClaim(context.store, component, chat.profile_id)
  )
    throw new ToolError('Use an active owner chat and a component you can manage.', 'forbidden');
  const { expiresAt } = saveRepairWorkClaim(
    context.store.settingsKv,
    { component, chatId: chat.id, profileId: chat.profile_id },
    context.clock.now(),
  );
  return { structured: { component, chatId: chat.id, expiresAt } };
}

export const OWNER_CHAT_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'chat_file_send',
    input: CHAT_FILE_SEND_INPUT,
    annotations: WRITES,
    answer: true,
    run: share,
  }),
  defineTool({
    name: 'repair_claim',
    input: REPAIR_WORK_CLAIM_INPUT,
    annotations: WRITES,
    answer: true,
    run: (context, input) => claim(context, input.component),
  }),
];
