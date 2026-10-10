import type { AssistantReasonCode } from '@smarteverything/domain';
import { parseMarkdown, type Block, type Inline } from '../components/markdown/parse';

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

function inlineText(inline: readonly Inline[]): string {
  return inline.map((part) => part.text).join('');
}

function blockText(block: Block): string | null {
  switch (block.kind) {
    case 'paragraph':
    case 'quote':
      return inlineText(block.inline);
    case 'list':
      return block.items.map(inlineText).join(' · ');
    case 'table':
      return block.header.map(inlineText).join(' · ');
    case 'code':
      return block.code;
    case 'heading':
      return null;
  }
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
