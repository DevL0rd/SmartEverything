import { describe, expect, it } from 'vitest';
import {
  AI_DECISION,
  NODE_REGISTRY,
  aiJsonOf,
  aiShapeInstruction,
  aiShapeSchema,
  kindProblems,
  nodeCatalogue,
} from '../../src/automation-nodes';
import { holdsSecret } from '../../src/automation-v3/type-rules';

const V11_IDS = [
  'ai.ask',
  'ai.vision',
  'ai.decide',
  'camera.snapshot',
  'computer.power',
  'computer.read',
  'health.read',
  'http.respond',
  'phone.action',
  'phone.read',
  'signal.emit',
  'signal.latest',
  'var.secret',
  'weather.forecast',
];

describe('v1.1 integration kinds', () => {
  it('registers every kind in the shipped v1.1 tier and passes the define rules', () => {
    for (const id of V11_IDS) {
      const kind = NODE_REGISTRY.get(id);
      expect(kind?.tier, id).toBe('v1.1');
      expect(kindProblems(kind ?? NODE_REGISTRY.kinds[0]!), id).toEqual([]);
      expect(
        NODE_REGISTRY.shipped().some((shipped) => shipped.id === id),
        id,
      ).toBe(true);
    }
  });

  it('ships the ask node at v1 because the hub can ask, wait and take the answer', () => {
    const ask = NODE_REGISTRY.get('notify.ask');
    expect(ask?.tier).toBe('v1');
    expect(kindProblems(ask ?? NODE_REGISTRY.kinds[0]!)).toEqual([]);
    expect(NODE_REGISTRY.shipped().some((shipped) => shipped.id === 'notify.ask')).toBe(true);
  });

  it('keeps the AI, web answer and secret kinds owner-only', () => {
    const owner = ['ai.ask', 'ai.vision', 'ai.decide', 'http.respond', 'var.secret'];
    for (const id of owner) expect(NODE_REGISTRY.get(id)?.access, id).toBe('owner');
    const member = nodeCatalogue(NODE_REGISTRY, { includeUnshipped: true, kind: 'ai.ask' });
    expect(member[0]?.available).toBe(false);
  });

  it('gives AI calls no tools by default and a cost cap option', () => {
    const ask = NODE_REGISTRY.get('ai.ask');
    expect(ask?.inputs.find((port) => port.name === 'tools')?.default).toEqual([]);
    expect(ask?.inputs.some((port) => port.name === 'budget')).toBe(true);
    expect(NODE_REGISTRY.get('ai.vision')?.inputs.some((port) => port.name === 'tools')).toBe(
      false,
    );
  });

  it('hands out a secret only as a hidden handle', () => {
    const output = NODE_REGISTRY.get('var.secret')?.outputs[0];
    expect(output !== undefined && holdsSecret(output.type)).toBe(true);
  });

  it('keeps the phone and computer status outputs optional', () => {
    for (const id of ['computer.read', 'phone.read']) {
      expect(
        NODE_REGISTRY.get(id)?.outputs.every((port) => port.optional === true),
        id,
      ).toBe(true);
    }
  });
});

describe('the AI answer shape', () => {
  const shape = { mood: 'text', score: 'number', tags: 'list_of_text' } as const;

  it('accepts exactly the fields of the shape', () => {
    const schema = aiShapeSchema(shape);
    expect(schema.safeParse({ mood: 'ok', score: 2, tags: ['a'] }).success).toBe(true);
    expect(schema.safeParse({ mood: 'ok', score: '2', tags: ['a'] }).success).toBe(false);
    expect(schema.safeParse({ mood: 'ok', score: 2, tags: ['a'], extra: 1 }).success).toBe(false);
  });

  it('names every field for the model', () => {
    expect(aiShapeInstruction(shape)).toContain('"score": a number');
  });

  it('finds the JSON object in a chatty answer', () => {
    expect(aiJsonOf('Sure!\n{"answer": true, "reason": "x"}\nDone')).toEqual({
      answer: true,
      reason: 'x',
    });
    expect(aiJsonOf('no object here')).toBeUndefined();
    expect(aiJsonOf('{broken')).toBeUndefined();
    expect(AI_DECISION.safeParse({ answer: true, reason: 'x' }).success).toBe(true);
  });
});
