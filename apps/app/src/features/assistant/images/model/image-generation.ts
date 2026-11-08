import type { z } from 'zod';
import type {
  IMAGE_EDIT_INPUT,
  IMAGE_GENERATE_INPUT,
  ImageOperationReceipt,
} from '@smarteverything/domain';
import { imageReceiptStatus } from './image-receipt';
import { pendingImageFrame } from './image-thread';

export type GenerationStage = 'queued' | 'painting' | 'saved' | 'failed' | 'cancelled' | 'unknown';

export function generationStage(receipt: ImageOperationReceipt): GenerationStage {
  switch (receipt.state) {
    case 'reserved':
      return 'queued';
    case 'running':
      return 'painting';
    case 'completed':
      return 'saved';
    case 'failed':
    case 'cancelled':
    case 'unknown':
      return receipt.state;
  }
}

export function isGenerating(receipt: ImageOperationReceipt): boolean {
  return receipt.state === 'reserved' || receipt.state === 'running';
}

const FIRST_PREVIEW_BLUR = 18;

export function previewBlur(seen: number): number {
  return FIRST_PREVIEW_BLUR / seen;
}

const SECOND_MS = 1000;

export function elapsedSeconds(since: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(since)) / SECOND_MS));
}

export function takenSeconds(receipt: ImageOperationReceipt): number {
  return Math.round((Date.parse(receipt.updated_at) - Date.parse(receipt.created_at)) / SECOND_MS);
}

export interface FrameCell {
  readonly width: number;
  readonly height: number;
}

export function variationCount(receipt: ImageOperationReceipt): number {
  return receipt.results.length > 0 ? receipt.results.length : receipt.request.options.n;
}

export function frameCells(receipt: ImageOperationReceipt): readonly FrameCell[] {
  const { aspectRatio } = pendingImageFrame(receipt);
  return Array.from({ length: variationCount(receipt) }, () => ({
    width: aspectRatio,
    height: 1,
  }));
}

export function promptLine(receipt: ImageOperationReceipt): string {
  const count = variationCount(receipt);
  const prompt = receipt.request.prompt.trim();
  return count > 1 ? `${String(count)} variations of ${prompt}` : prompt;
}

export interface DetailRow {
  readonly label: string;
  readonly value: string;
  readonly figure: boolean;
}

function sizeOf(receipt: ImageOperationReceipt): string | null {
  const width = receipt.results[0]?.attachment.width ?? null;
  const height = receipt.results[0]?.attachment.height ?? null;
  if (width !== null && height !== null) return `${String(width)} × ${String(height)}`;
  const options = receipt.request.options;
  return options.size?.replace('x', ' × ') ?? options.aspect_ratio ?? null;
}

function costOf(
  receipt: ImageOperationReceipt,
  dollars: (amount: number) => string,
): string | null {
  const cost = receipt.usage?.['cost'];
  if (cost !== undefined) return dollars(cost);
  return isGenerating(receipt) ? null : 'Not reported';
}

export function detailRows(
  receipt: ImageOperationReceipt,
  dollars: (amount: number) => string,
): readonly DetailRow[] {
  const seed = receipt.request.options.seed;
  const rows: readonly (DetailRow | null)[] = [
    { label: 'Prompt', value: receipt.request.prompt, figure: false },
    { label: 'Model', value: receipt.endpoint.name, figure: false },
    nullableRow('Size', sizeOf(receipt)),
    seed === undefined ? null : { label: 'Seed', value: String(seed), figure: true },
    isGenerating(receipt)
      ? null
      : { label: 'Time', value: `${String(takenSeconds(receipt))} s`, figure: true },
    nullableRow('Cost', costOf(receipt, dollars)),
  ];
  return rows.filter((row) => row !== null);
}

function nullableRow(label: string, value: string | null): DetailRow | null {
  return value === null ? null : { label, value, figure: true };
}

export type ImageLineAction = 'edit' | 'retry' | 'check';

export interface ImageNoticeLine {
  readonly text: string;
  readonly tone: 'critical' | 'warning' | 'variant';
  readonly actions: readonly ImageLineAction[];
}

export function noticeLineOf(receipt: ImageOperationReceipt): ImageNoticeLine | null {
  if (receipt.results.length > 0 || isGenerating(receipt)) return null;
  switch (receipt.state) {
    case 'failed':
      return {
        text: receipt.reason ?? 'The image request could not finish.',
        tone: 'critical',
        actions: ['edit', 'retry'],
      };
    case 'unknown':
      return {
        text: 'Outcome unknown. You may still be charged; check Costs before trying again.',
        tone: 'warning',
        actions: ['edit', 'check'],
      };
    case 'reserved':
    case 'running':
    case 'completed':
    case 'cancelled':
      return { text: imageReceiptStatus(receipt), tone: 'variant', actions: ['edit', 'retry'] };
  }
}

type GenerateBody = z.input<typeof IMAGE_GENERATE_INPUT>;
type EditBody = z.input<typeof IMAGE_EDIT_INPUT>;

export type ImageRetry =
  | { readonly kind: 'generate'; readonly body: GenerateBody }
  | { readonly kind: 'edit'; readonly body: EditBody };

type Request = ImageOperationReceipt['request'];
type Selector = Extract<Request, { mode: 'edit' }>['source'];

const LATEST_WORD = { any: 'latest', uploaded: 'latestUploaded', generated: 'latestGenerated' };

function referenceOf(selector: Selector): string {
  return selector.kind === 'attachment' ? selector.attachment_id : LATEST_WORD[selector.origin];
}

function baseOf(receipt: ImageOperationReceipt): GenerateBody {
  const { stream: _stream, ...options } = receipt.request.options;
  const tag = receipt.request.provider_tag;
  return {
    chatId: receipt.chat_id,
    prompt: receipt.request.prompt,
    model: receipt.request.model,
    ...(tag === undefined ? {} : { providerTag: tag }),
    options,
  };
}

export function retryOf(receipt: ImageOperationReceipt): ImageRetry {
  const request = receipt.request;
  const base = baseOf(receipt);
  switch (request.mode) {
    case 'generate':
      return { kind: 'generate', body: base };
    case 'reference':
      return {
        kind: 'generate',
        body: { ...base, references: request.references.map(referenceOf) },
      };
    case 'edit':
      return {
        kind: 'edit',
        body: {
          ...base,
          source: referenceOf(request.source),
          references: request.references.map(referenceOf),
        },
      };
  }
}
