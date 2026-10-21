import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ASSISTANT_POST, SHOW_WIDGETS_INPUT } from '@smarteverything/domain';
import { z } from 'zod';
import { callerFor, operate, type ActingContext } from './acting';
import { ownedAttachment } from '../../../assistant/chat-directory';
import { chatOwnerOf } from '../../../server/auth';
import { showWidgets } from '../../../chat-widgets/show-widgets';
import type { StoredAttachment } from '../../../store/repositories/assistant-chat';
import { MediaTooLargeError, mediaKindOf } from '../../../transcripts/media-notes';
import { READS, ToolError, WRITES, defineTool, type Tool, type ToolContext } from './registry';

const INLINE_BYTES_MAX = 4 * 1024 * 1024;

function textual(mime: string): boolean {
  return mime.startsWith('text/') || mime === 'application/json';
}

async function transcriptOf(context: ToolContext, file: StoredAttachment): Promise<string> {
  try {
    return await context.mediaNotes.ensure(file);
  } catch (cause) {
    if (cause instanceof MediaTooLargeError) {
      throw new ToolError(cause.message);
    }
    throw cause;
  }
}

export function readableAttachment(context: ActingContext, id: string): StoredAttachment {
  const authority = context.actor?.authority;
  const owner = chatOwnerOf(context.store, callerFor(context));
  const file =
    owner.role === 'owner'
      ? context.store.assistantChat.attachment(id)
      : ownedAttachment(context.store, owner, id);
  if (authority !== undefined && file.profile_id !== authority.profile_id)
    throw new ToolError('Attachment belongs to another initiating profile.', 'forbidden');
  return file;
}

async function attachment(
  context: ToolContext,
  id: string,
): Promise<{ structured: Record<string, unknown>; images?: { data: string; mimeType: string }[] }> {
  const file = readableAttachment(context, id);
  const summary = {
    id: file.id,
    name: file.name,
    mime: file.mime,
    bytes: file.bytes,
    width: file.width,
    height: file.height,
  };
  const kind = mediaKindOf(file.mime);
  if (kind === 'audio' || kind === 'video') {
    return { structured: { ...summary, transcript: await transcriptOf(context, file) } };
  }
  if (file.bytes > INLINE_BYTES_MAX) {
    throw new ToolError(
      `${file.name} is larger than 4 MB; it is stored on the computer at ${file.storage_path} under the assistant folder.`,
    );
  }
  const content = await readFile(join(context.assistantFiles, file.storage_path));
  if (kind === 'image') {
    context.mediaNotes.later(file);
    return {
      structured: { ...summary, description: file.transcript },
      images: [{ data: content.toString('base64'), mimeType: file.mime }],
    };
  }
  if (textual(file.mime)) {
    return { structured: { ...summary, text: content.toString('utf8') } };
  }
  return { structured: { ...summary, base64: content.toString('base64') } };
}

const POST = ASSISTANT_POST.omit({ profileId: true }).extend({
  personId: ASSISTANT_POST.shape.profileId.describe(
    'Whose chat: a person id from person_read (not a device or app id); the owner’s when left out',
  ),
});

export const ASSISTANT_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'chat_post',
    input: POST,
    annotations: WRITES,
    run: async (context, { personId, ...post }) => ({
      structured: {
        result: await operate(context, 'postAssistant', {
          body: { ...post, profileId: personId },
        }),
      },
    }),
  }),
  defineTool({
    name: 'widget_show',
    input: SHOW_WIDGETS_INPUT,
    annotations: WRITES,
    run: (context, input) => ({ structured: showWidgets(context, input.widgets) }),
  }),
  defineTool({
    name: 'read_assistant_attachment',
    input: z.strictObject({
      attachmentId: z.uuid().describe('The attachment id, from chat_read view messages'),
    }),
    annotations: READS,
    run: (context, input) => attachment(context, input.attachmentId),
  }),
];
