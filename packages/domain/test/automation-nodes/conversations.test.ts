import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { VISION_SOURCE_CHOICES } from '../../src/automation-nodes/ai-model';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import {
  CONVERSATION_KINDS,
  LISTENING_SENSITIVITY_CHOICES,
  TRANSCRIPT_LINE_TYPE,
} from '../../src/automation-nodes/conversations';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, fallibleOf } from '../../src/automation-nodes/exec-ports';
import { isOptionSourceId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { modesOf, runModeOf } from '../../src/automation-nodes/run-modes';
import { WAKE_SENSITIVITIES } from '../../src/wake-sensitivity';

const IDS = ['chat.post', 'transcript.read', 'listening.set'] as const;

function kindOf(id: string): NonNullable<ReturnType<typeof NODE_REGISTRY.get>> {
  const found = NODE_REGISTRY.get(id);
  if (found === undefined) throw new Error(`${id} is not registered`);
  return found;
}

function inputOf(
  kind: string,
  name: string,
): NonNullable<ReturnType<typeof kindOf>['inputs'][number]> {
  const found = kindOf(kind).inputs.find((port) => port.name === name);
  if (found === undefined) throw new Error(`${kind} has no input ${name}`);
  return found;
}

describe('conversation kinds registration', () => {
  it('registers the three kinds once each and valid as effects', () => {
    expect(CONVERSATION_KINDS.map((each) => each.id)).toEqual(IDS);
    for (const id of IDS) {
      expect(
        ALL_NODE_KINDS.filter((each) => each.id === id),
        id,
      ).toHaveLength(1);
      expect(kindProblems(kindOf(id)), id).toEqual([]);
      expect(kindOf(id).class).toBe('effect');
      expect(kindOf(id).access).toBe('member');
    }
  });

  it('has no raw JSON input, only known picker sources and an error exit', () => {
    for (const id of IDS) {
      for (const port of kindOf(id).inputs) {
        expect(['any'], `${id} ${port.name}`).not.toContain(port.type.t);
        expect(port.type.t === 'record', `${id} ${port.name}`).toBe(false);
        if (port.ui?.optionsFrom !== undefined)
          expect(isOptionSourceId(port.ui.optionsFrom), `${id} ${port.name}`).toBe(true);
      }
      expect(fallibleOf(id, STATIC_KIND_LOOKUP)).toBe(true);
      expect(canRouteOnError(id, STATIC_KIND_LOOKUP)).toBe(true);
      expect(kindOf(id).outputs.at(-1)).toBe(ERROR_OUT);
    }
  });
});

describe('chat.post', () => {
  const kind = kindOf('chat.post');

  it('takes a person, the text, a picture wire and the notify switch', () => {
    expect(kind.inputs.map((port) => port.name)).toEqual(['person', 'text', 'picture', 'notify']);
    expect(inputOf('chat.post', 'person')).toMatchObject({
      type: { t: 'optional', of: { t: 'ref', of: 'person' } },
      required: false,
    });
    expect(inputOf('chat.post', 'text')).toMatchObject({ live: true, required: false });
    expect(inputOf('chat.post', 'picture')).toMatchObject({
      type: { t: 'optional', of: { t: 'text' } },
      live: true,
    });
    expect(inputOf('chat.post', 'notify')).toMatchObject({
      type: { t: 'boolean' },
      default: true,
      static: true,
    });
  });

  it('sends by default, may wait, and only gives the message id when it waited', () => {
    expect(modesOf(kind)).toEqual({
      default: 'fire_and_forget',
      allowed: ['fire_and_forget', 'wait_for_result'],
    });
    expect(runModeOf(kind, undefined)).toBe('fire_and_forget');
    expect(kind.outputs.map((port) => port.name)).toEqual(['messageId', 'error']);
    expect(kind.outputs[0]?.optional).toBe(true);
  });
});

describe('transcript.read', () => {
  const kind = kindOf('transcript.read');

  it('takes a picked source, how far back and optional search words', () => {
    expect(kind.inputs.map((port) => port.name)).toEqual(['source', 'last', 'search']);
    expect(inputOf('transcript.read', 'source')).toMatchObject({
      type: { t: 'text' },
      required: true,
      ui: { optionsFrom: 'speech.sources' },
    });
    expect(inputOf('transcript.read', 'last')).toMatchObject({
      type: { t: 'duration' },
      required: true,
      ui: { editor: 'duration' },
    });
    expect(inputOf('transcript.read', 'last').ui?.max).toBeUndefined();
    expect(inputOf('transcript.read', 'search')).toMatchObject({
      type: { t: 'optional', of: { t: 'text' } },
      required: false,
    });
  });

  it('gives the text, the lines and the people who spoke', () => {
    expect(kind.outputs.map((port) => port.name)).toEqual(['text', 'lines', 'speakers', 'error']);
    expect(kind.outputs[1]?.type).toEqual({ t: 'list', of: TRANSCRIPT_LINE_TYPE });
    expect(
      Object.keys(TRANSCRIPT_LINE_TYPE.t === 'record' ? (TRANSCRIPT_LINE_TYPE.fields ?? {}) : {}),
    ).toEqual(['at', 'speaker', 'text', 'bot']);
    expect(kind.outputs[2]?.type).toEqual({ t: 'list', of: { t: 'ref', of: 'person' } });
  });

  it('always waits for the lines', () => {
    expect(modesOf(kind)).toEqual({ default: 'wait_for_result', allowed: ['wait_for_result'] });
    expect(runModeOf(kind, 'fire_and_forget')).toBe('wait_for_result');
  });
});

describe('listening.set', () => {
  const kind = kindOf('listening.set');

  it('takes a picked listener and three optional changes', () => {
    expect(kind.inputs.map((port) => port.name)).toEqual([
      'source',
      'wake',
      'transcribe',
      'sensitivity',
    ]);
    expect(inputOf('listening.set', 'source')).toMatchObject({
      required: true,
      ui: { optionsFrom: 'listening.sources' },
    });
    for (const name of ['wake', 'transcribe']) {
      expect(inputOf('listening.set', name)).toMatchObject({
        type: { t: 'optional', of: { t: 'boolean' } },
        required: false,
      });
    }
  });

  it('offers exactly the sensitivities the ears know', () => {
    expect(LISTENING_SENSITIVITY_CHOICES.map((choice) => choice.id)).toEqual([
      ...WAKE_SENSITIVITIES,
    ]);
    expect(inputOf('listening.set', 'sensitivity').type).toEqual({
      t: 'optional',
      of: { t: 'choice', options: [...LISTENING_SENSITIVITY_CHOICES] },
    });
  });

  it('sends by default and confirms with ok', () => {
    expect(runModeOf(kind, undefined)).toBe('fire_and_forget');
    expect(kind.outputs.map((port) => port.name)).toEqual(['ok', 'error']);
  });
});

describe('ai.vision sources', () => {
  const kind = kindOf('ai.vision');

  it('keeps every earlier port and adds the source, computer, window and phone', () => {
    const names = kind.inputs.map((port) => port.name);
    for (const kept of ['question', 'image', 'camera', 'shape', 'person', 'model', 'budget']) {
      expect(names, kept).toContain(kept);
    }
    for (const added of ['source', 'computer', 'window', 'phone']) {
      expect(names, added).toContain(added);
    }
  });

  it('offers the camera, a computer screen or window and a phone screen', () => {
    expect(VISION_SOURCE_CHOICES.map((choice) => choice.id)).toEqual([
      'camera',
      'computer_screen',
      'computer_window',
      'phone_screen',
    ]);
    expect(inputOf('ai.vision', 'source')).toMatchObject({
      type: { t: 'optional', of: { t: 'choice', options: [...VISION_SOURCE_CHOICES] } },
      required: false,
    });
    expect(inputOf('ai.vision', 'computer').type).toEqual({
      t: 'optional',
      of: { t: 'ref', of: 'computer' },
    });
    expect(inputOf('ai.vision', 'phone').type).toEqual({
      t: 'optional',
      of: { t: 'ref', of: 'phone' },
    });
    expect(kindProblems(kind)).toEqual([]);
  });
});
