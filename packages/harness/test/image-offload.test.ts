import { afterEach, describe, expect, it } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import {
  IMAGE_OFFLOAD_REQUIRED_CODE,
  LlmError,
  requiredImageOffload,
  type ContentBlock,
  type GenerateOptions,
} from '@deepseek-ai/dsh-llm';
import { bootDispatcher } from './support/dispatcher';
import type { DispatcherFixture } from './support/dispatcher';

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const BOUND = 20_971_520;
const REQUEST_IMAGE_BYTES = 1_048_576;

let fixture: DispatcherFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

function imagesIn(options: GenerateOptions): number {
  return options.messages.reduce(
    (sum, message) =>
      sum +
      message.content.filter((block) => block.type === 'image' && block.offloaded !== true).length,
    0,
  );
}

async function run(steps: number): Promise<readonly GenerateOptions[]> {
  const accepted: GenerateOptions[] = [];
  const rendered: ContentBlock[] = [];
  const host = await bootDispatcher(undefined, async (ctx: Context) => {
    await ctx.inject(['tools', 'attachments'], (ready) => {
      ready.tools.register({
        name: 'screenshot_probe',
        description: 'Read an image.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        isConcurrencySafe: (): boolean => false,
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: () => rendered.splice(0),
        },
        execute: async () => {
          const content = await ready.attachments.admitPromptContent([
            { type: 'image', mediaType: 'image/png', data: PNG },
          ]);
          rendered.push(...content);
          return { admitted: content.length };
        },
      });
    });
  });
  fixture = host;
  host.model.guard = (options): void => {
    const required = requiredImageOffload(
      options.messages,
      { representation: 'base64', maxBytes: BOUND },
      () => REQUEST_IMAGE_BYTES,
    );
    if (required > 0)
      throw new LlmError('bound', IMAGE_OFFLOAD_REQUIRED_CODE, { offloadImages: required });
    accepted.push(options);
  };
  const replies = Array.from({ length: steps }, (_, index) => ({
    kind: 'tool' as const,
    id: `call-${String(index)}`,
    name: 'screenshot_probe',
    input: {},
  }));
  host.model.script(...replies, { kind: 'text', text: 'done' });
  const opened = await host.open();
  await host.send(opened, 'look at everything');
  await host.finished(1);
  return accepted;
}

describe('images piling up inside one turn', () => {
  it('are offloaded oldest first so every request fits the bound and the newest stay', async () => {
    const requests = await run(40);

    expect(requests).toHaveLength(41);
    const last = requests[requests.length - 1];
    if (last === undefined) throw new Error('No request was accepted.');
    expect(imagesIn(last)).toBeGreaterThan(5);
    expect(imagesIn(last) * Math.ceil(REQUEST_IMAGE_BYTES / 3) * 4).toBeLessThanOrEqual(BOUND);
    const kinds = last.messages.flatMap((message) =>
      message.content.flatMap((block) =>
        block.type === 'image' ? [block.offloaded === true] : [],
      ),
    );
    expect(kinds[kinds.length - 1]).toBe(false);
    expect(kinds.slice(0, 5).every(Boolean)).toBe(true);
  });

  it('leave turns with a few images untouched', async () => {
    const requests = await run(3);

    const last = requests[requests.length - 1];
    if (last === undefined) throw new Error('No request was accepted.');
    expect(imagesIn(last)).toBe(3);
  });
});
