import { z } from 'zod';

const COUNT = z.int().nonnegative();
export const SUPPLIER_USAGE = z.looseObject({
  prompt_tokens: COUNT,
  completion_tokens: COUNT,
  total_tokens: COUNT.optional(),
  cost: z.number().nonnegative().nullable().optional(),
  prompt_tokens_details: z
    .looseObject({ cached_tokens: COUNT.optional(), cache_write_tokens: COUNT.optional() })
    .nullable()
    .optional(),
  completion_tokens_details: z
    .looseObject({ reasoning_tokens: COUNT.optional() })
    .nullable()
    .optional(),
});
const FRAME = z.looseObject({
  id: z.string().min(1).max(200).optional(),
  model: z.string().min(1).max(200).optional(),
  usage: SUPPLIER_USAGE.nullable().optional(),
});
export type SupplierUsage = z.infer<typeof SUPPLIER_USAGE>;
export interface SupplierUsageSnapshot {
  readonly generationId: string;
  readonly model: string;
  readonly usage: SupplierUsage | null;
}
const MAX_FRAME_CHARACTERS = 2 * 1024 * 1024;

export class MeteredUsageStream {
  private readonly decoder = new TextDecoder();
  private buffer = '';
  private generationId: string | undefined;
  private model: string | undefined;
  snapshot: SupplierUsageSnapshot | undefined;
  constructor(private readonly observed: (snapshot: SupplierUsageSnapshot) => void) {}

  response(response: Response): Response {
    if (!response.ok || response.body === null) return response;
    return new Response(
      response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform: (bytes, controller): void => {
            this.feed(bytes);
            controller.enqueue(bytes);
          },
          flush: (): void => {
            this.buffer += this.decoder.decode();
            if (this.buffer.trim() !== '') this.frame(this.buffer);
            this.buffer = '';
          },
        }),
      ),
      { status: response.status, statusText: response.statusText, headers: response.headers },
    );
  }
  private feed(bytes: Uint8Array): void {
    this.buffer = (this.buffer + this.decoder.decode(bytes, { stream: true })).replace(
      /\r\n/g,
      '\n',
    );
    let boundary = this.buffer.indexOf('\n\n');
    while (boundary >= 0) {
      this.frame(this.buffer.slice(0, boundary));
      this.buffer = this.buffer.slice(boundary + 2);
      boundary = this.buffer.indexOf('\n\n');
    }
    if (this.buffer.length > MAX_FRAME_CHARACTERS)
      throw new Error('Supplier SSE accounting frame exceeded the supported size.');
  }
  private frame(frame: string): void {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (data === '' || data === '[DONE]') return;
    const parsed = FRAME.parse(JSON.parse(data));
    this.generationId = parsed.id ?? this.generationId;
    this.model = parsed.model ?? this.model;
    if (this.generationId === undefined || this.model === undefined) return;
    const previous = snapshotOfGeneration(this.snapshot, this.generationId);
    if (previous !== undefined && !hasUsage(parsed.usage)) return;
    this.snapshot = {
      generationId: this.generationId,
      model: this.model,
      usage: mergeUsage(previous?.usage, parsed.usage),
    };
    this.observed(this.snapshot);
  }
}

function hasUsage(usage: SupplierUsage | null | undefined): boolean {
  return usage !== null && usage !== undefined;
}

function snapshotOfGeneration(
  snapshot: SupplierUsageSnapshot | undefined,
  generationId: string,
): SupplierUsageSnapshot | undefined {
  if (snapshot?.generationId !== generationId) return undefined;
  return snapshot;
}

function mergeUsage(
  previous: SupplierUsage | null | undefined,
  usage: SupplierUsage | null | undefined,
): SupplierUsage | null {
  if (usage === null || usage === undefined) return previous ?? null;
  return {
    ...previous,
    ...usage,
    ...(usage.prompt_tokens_details === null || usage.prompt_tokens_details === undefined
      ? {}
      : {
          prompt_tokens_details: {
            ...previous?.prompt_tokens_details,
            ...usage.prompt_tokens_details,
          },
        }),
    ...(usage.completion_tokens_details === null || usage.completion_tokens_details === undefined
      ? {}
      : {
          completion_tokens_details: {
            ...previous?.completion_tokens_details,
            ...usage.completion_tokens_details,
          },
        }),
  };
}
