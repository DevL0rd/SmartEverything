import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PreviewConsoleRecord, PreviewDiagnosticScope } from '@smarteverything/domain';

export function previewErrorFingerprint(record: PreviewConsoleRecord): string {
  const message = record.message.replace(/https?:\/\/[^\s"'<>]+/gu, stableResource);
  return createHash('sha256')
    .update(JSON.stringify([message, stableSource(record.source), stableStack(record.stack)]))
    .digest('hex');
}
export function previewErrorScope(
  scope: PreviewDiagnosticScope,
  record: PreviewConsoleRecord,
): string {
  if (!scope.documentId.startsWith('public:')) return `page:${scope.documentId}`;
  const source = stableSource(record.source);
  const parsed = z.url().safeParse(source);
  return parsed.success ? `site:${new URL(parsed.data).origin}` : 'chat-public-console';
}
function stableSource(source: string | null): string | null {
  if (source === null) return null;
  const candidate = source.replace(/:\d+$/u, '');
  const parsed = z.url().safeParse(candidate);
  if (!parsed.success) return candidate.replace(/:\d+$/u, '');
  const url = new URL(parsed.data);
  url.pathname = url.pathname.replace(/:\d+$/u, '');
  return `${url.origin}${url.pathname}`;
}
function stableResource(value: string, offset: number, text: string): string {
  const enclosed = text[offset - 1] === '(' && value.endsWith(')');
  const punctuation = enclosed ? ')' : '';
  const resource = enclosed ? value.slice(0, -1) : value;
  const parsed = z.url().safeParse(resource);
  if (!parsed.success) return value;
  const url = new URL(parsed.data);
  return `${url.origin}${url.pathname}${punctuation}`;
}

function stableStack(stack: string | null): string | null {
  return stack === null
    ? null
    : stack.replace(/:\d+:\d+/gu, '').replace(/https?:\/\/[^\s"'<>]+/gu, stableResource);
}
