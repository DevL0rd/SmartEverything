import { z } from 'zod';
import { createParser } from 'eventsource-parser';
import { Logger, messageOf } from '@smarteverything/logging';

const COUNT = z.int().nonnegative();
const SUPPLIER_USAGE = z.looseObject({
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
const FRAME_TEXT = z
  .string()
  .transform((text, context): unknown => {
    try {
      return JSON.parse(text);
    } catch (cause) {
      context.addIssue({
        code: 'custom',
        message: `The supplier frame is not JSON: ${messageOf(cause)}.`,
      });
      return z.NEVER;
    }
  })
  .pipe(FRAME);
export type SupplierUsage = z.infer<typeof SUPPLIER_USAGE>;
export interface SupplierUsageSnapshot {
  readonly generationId: string;
  readonly model: string;
  readonly usage: SupplierUsage | null;
}

export class MeteredUsageStream {
  private readonly decoder = new TextDecoder();
  private readonly log = new Logger('hub.harness');
  private readonly parser = createParser({
    onEvent: (event): void => {
      this.frame(event.data);
    },
  });
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
            this.parser.feed(this.decoder.decode(bytes, { stream: true }));
            controller.enqueue(bytes);
          },
          flush: (): void => {
            this.parser.feed(this.decoder.decode());
            this.parser.reset({ consume: true });
          },
        }),
      ),
      { status: response.status, statusText: response.statusText, headers: response.headers },
    );
  }

  private frame(data: string): void {
    const parsed = this.parsed(data);
    if (parsed === undefined) return;
    this.generationId = parsed.id ?? this.generationId;
    this.model = parsed.model ?? this.model;
    const next = nextSnapshot(this.snapshot, this.generationId, this.model, parsed.usage);
    if (next === undefined) return;
    this.snapshot = next;
    this.observed(next);
  }

  private parsed(data: string): z.infer<typeof FRAME> | undefined {
    if (data === '[DONE]') return undefined;
    const result = FRAME_TEXT.safeParse(data);
    if (result.success) return result.data;
    this.log.warn('metered_usage.frame_invalid', { issues: result.error.issues.length });
    return undefined;
  }
}

function nextSnapshot(
  snapshot: SupplierUsageSnapshot | undefined,
  generationId: string | undefined,
  model: string | undefined,
  usage: SupplierUsage | null | undefined,
): SupplierUsageSnapshot | undefined {
  if (generationId === undefined || model === undefined) return undefined;
  const previous = snapshot?.generationId === generationId ? snapshot : undefined;
  if (previous !== undefined && !hasUsage(usage)) return undefined;
  return { generationId, model, usage: mergeUsage(previous?.usage, usage) };
}

function hasUsage(usage: SupplierUsage | null | undefined): boolean {
  return usage !== null && usage !== undefined;
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
