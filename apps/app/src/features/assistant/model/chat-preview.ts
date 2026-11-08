import type { AssistantReasonCode } from '@smarteverything/domain';
import {
  inlineText,
  parseMarkdown,
  plainBlockText,
  type Block,
} from '@smarteverything/domain/markdown';

const PREVIEW_MAX = 160;

const FAILURE: Readonly<Record<AssistantReasonCode, string | null>> = {
  credits: 'Out of OpenRouter credits',
  rate_limit: 'Rate limited',
  model_unavailable: 'Model unavailable',
  offline: 'Offline',
  interrupted: 'Interrupted',
  stopped: null,
  unknown: 'Something went wrong',
};

export function failureReasonOf(code: AssistantReasonCode | null): string | null {
  return code === null ? FAILURE.unknown : FAILURE[code];
}

function blockText(block: Block): string | null {
  return block.kind === 'heading' ? null : plainBlockText(block);
}

function headingsOf(blocks: readonly Block[]): string {
  return blocks
    .map((block) => (block.kind === 'heading' ? inlineText(block.inline) : ''))
    .join(' ');
}

export function previewTextOf(markdown: string): string {
  const blocks = parseMarkdown(markdown);
  const body = blocks.map(blockText).filter((text) => text !== null);
  const text = body.length === 0 ? headingsOf(blocks) : body.join(' ');
  return text.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_MAX);
}
