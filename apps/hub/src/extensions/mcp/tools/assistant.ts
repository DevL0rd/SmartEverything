import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ASSISTANT_POST, ASSISTANT_REPLY } from '@smarteverything/domain';
import { z } from 'zod';
import { operate } from './acting';
import { READS, ToolError, WRITES, defineTool, type Tool, type ToolContext } from './registry';

const INLINE_BYTES_MAX = 4 * 1024 * 1024;

function textual(mime: string): boolean {
  return mime.startsWith('text/') || mime === 'application/json';
}

async function attachment(
  context: ToolContext,
  id: string,
): Promise<{ structured: Record<string, unknown>; images?: { data: string; mimeType: string }[] }> {
  const file = context.store.assistantChat.attachment(id);
  const summary = {
    id: file.id,
    name: file.name,
    mime: file.mime,
    bytes: file.bytes,
    width: file.width,
    height: file.height,
  };
  if (file.bytes > INLINE_BYTES_MAX) {
    throw new ToolError(
      `${file.name} is larger than 4 MB; it is stored on the computer at ${file.storage_path} under the assistant folder.`,
    );
  }
  const content = await readFile(join(context.assistantFiles, file.storage_path));
  if (file.mime.startsWith('image/')) {
    return {
      structured: summary,
      images: [{ data: content.toString('base64'), mimeType: file.mime }],
    };
  }
  if (textual(file.mime)) {
    return { structured: { ...summary, text: content.toString('utf8') } };
  }
  return { structured: { ...summary, base64: content.toString('base64') } };
}

export const ASSISTANT_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'assistant_reply',
    input: ASSISTANT_REPLY,
    annotations: WRITES,
    run: async (context, input) => ({
      structured: { result: await operate(context, 'replyAssistant', { body: input }) },
    }),
  }),
  defineTool({
    name: 'assistant_post',
    input: ASSISTANT_POST,
    annotations: WRITES,
    run: async (context, input) => ({
      structured: { result: await operate(context, 'postAssistant', { body: input }) },
    }),
  }),
  defineTool({
    name: 'read_assistant_attachment',
    input: z.strictObject({ id: z.uuid() }),
    annotations: READS,
    run: (context, input) => attachment(context, input.id),
  }),
];
