import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { IMAGE_GENERATE_INPUT } from '../../src/image-operations';
import {
  AI_IMAGE_KINDS,
  IMAGE_ASPECT_CHOICES,
  IMAGE_BACKGROUND_CHOICES,
  IMAGE_RESOLUTION_CHOICES,
  IMAGE_TIMEOUT_MS,
} from '../../src/automation-nodes/ai-image';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import type { InputPortDecl } from '../../src/automation-nodes/define';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, fallibleOf } from '../../src/automation-nodes/exec-ports';
import { isOptionSourceId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { hasModeChoice, modesOf, runModeOf } from '../../src/automation-nodes/run-modes';
import { renderSummary, summaryText } from '../../src/automation-nodes/summary-template';

const image = NODE_REGISTRY.get('ai.image');

function input(name: string): InputPortDecl | undefined {
  return image?.inputs.find((port) => port.name === name);
}

describe('ai.image registration', () => {
  it('registers the kind once in the AI category without problems', () => {
    expect(AI_IMAGE_KINDS.map((kind) => kind.id)).toEqual(['ai.image']);
    expect(ALL_NODE_KINDS.filter((kind) => kind.id === 'ai.image')).toHaveLength(1);
    expect(image?.category).toBe('ai');
    expect(image?.class).toBe('effect');
    expect(image?.access).toBe('owner');
    expect(image === undefined ? ['missing'] : kindProblems(image)).toEqual([]);
  });

  it('keeps the other AI kinds', () => {
    for (const id of ['ai.ask', 'ai.vision', 'ai.decide'])
      expect(NODE_REGISTRY.get(id)).toBeDefined();
  });
});

describe('ai.image ports', () => {
  it('takes a prompt, an optional model, three choices, references and a timeout', () => {
    expect(image?.inputs.map((port) => port.name)).toEqual([
      'prompt',
      'model',
      'aspect',
      'resolution',
      'background',
      'references',
      'timeout',
    ]);
    expect(input('prompt')).toMatchObject({ type: { t: 'text' }, required: true, summary: true });
  });

  it('picks the model from the image models', () => {
    const model = input('model');
    expect(model).toMatchObject({ required: false, ui: { optionsFrom: 'models.image' } });
    expect(isOptionSourceId(model?.ui?.optionsFrom ?? '')).toBe(true);
  });

  it('offers the size and style as closed choices the picture service accepts', () => {
    const choices = [
      ['aspect', IMAGE_ASPECT_CHOICES],
      ['resolution', IMAGE_RESOLUTION_CHOICES],
      ['background', IMAGE_BACKGROUND_CHOICES],
    ] as const;
    for (const [name, options] of choices) {
      expect(input(name)?.type).toEqual({
        t: 'optional',
        of: { t: 'choice', options: [...options] },
      });
      expect(input(name)?.required).toBe(false);
    }
    for (const option of IMAGE_ASPECT_CHOICES) {
      const parsed = IMAGE_GENERATE_INPUT.parse({
        chatId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        prompt: 'x',
        options: { aspect_ratio: option.id },
      });
      expect(parsed.options.aspect_ratio).toBe(option.id);
    }
  });

  it('takes the references as a list of picture ids that can be wired', () => {
    expect(input('references')).toMatchObject({
      type: { t: 'optional', of: { t: 'list', of: { t: 'text' } } },
      required: false,
      live: true,
    });
  });

  it('gives up after 120 seconds unless told otherwise, with a duration editor', () => {
    expect(IMAGE_TIMEOUT_MS).toBe(120_000);
    expect(input('timeout')).toMatchObject({
      type: { t: 'duration' },
      default: 120_000,
      ui: { editor: 'duration' },
    });
  });

  it('gives back the picture id and the cost, only when the step waited', () => {
    expect(image?.outputs).toEqual([
      expect.objectContaining({ name: 'picture', type: { t: 'text' }, optional: true }),
      expect.objectContaining({
        name: 'cost',
        type: { t: 'number', min: 0, unit: 'USD' },
        optional: true,
      }),
      ERROR_OUT,
    ]);
  });
});

describe('ai.image run mode and error exit', () => {
  it('waits by default and can also send', () => {
    const modes = modesOf(image);
    expect(modes.default).toBe('wait_for_result');
    expect([...modes.allowed].sort()).toEqual(['fire_and_forget', 'wait_for_result']);
    expect(hasModeChoice(image)).toBe(true);
    expect(runModeOf(image, undefined)).toBe('wait_for_result');
    expect(runModeOf(image, 'fire_and_forget')).toBe('fire_and_forget');
  });

  it('can fail and route the failure to the error exit', () => {
    expect(fallibleOf('ai.image', STATIC_KIND_LOOKUP)).toBe(true);
    expect(canRouteOnError('ai.image', STATIC_KIND_LOOKUP)).toBe(true);
    expect(image?.exits).toEqual(['next']);
  });

  it('reads plainly in a summary', () => {
    const parts = renderSummary(image?.summary ?? '', { prompt: { lit: 'a red door' } });
    expect(summaryText(parts)).toBe('Make a picture a red door');
  });
});
