import { describe, expect, it } from 'vitest';
import { NODE_REGISTRY } from '../../src/automation-nodes';
import { automationSentence, nodeSummaryText, wireScopeOf } from '../../src/automation-v3/describe';
import { plainStep, plainWire, type WireStep } from '../../src/automation-v3/describe-wire';
import { outlineLines } from '../../src/automation-v3/outline';
import { CTX, node, program } from './describe-fixture';

const IDENTIFIER = /[a-z][A-Z]|[A-Za-z_]\w*\.\w+/;

const scope = {
  step: (key: string): WireStep | undefined =>
    key === 'forEach' ? plainStep('Each light') : undefined,
  variable: (): string => 'Level',
  input: (): string => 'Target',
  trigger: plainStep('Hall button'),
};

const WIRES = [
  { from: 'forEach', port: 'light' },
  { from: 'vars', port: 'level' },
  { from: 'inputs', port: 'targetLevel' },
  { from: 'trigger', port: 'press' },
  { from: 'home', port: 'timeZone' },
  { from: 'run', port: 'startedAt' },
  { from: 'unknownKey', port: 'someField' },
];

describe('plain language guard', () => {
  it('writes no key or identifier shape for a wire', () => {
    for (const wire of WIRES) {
      expect(plainWire(wire, scope), `${wire.from}.${wire.port}`).not.toMatch(IDENTIFIER);
    }
  });

  it('writes no key in the sentence, the labels or the summaries of the outline', () => {
    expect(automationSentence(program, CTX)).not.toMatch(IDENTIFIER);
    for (const line of outlineLines(program, CTX)) {
      expect(line.summary, line.text).not.toMatch(IDENTIFIER);
      expect(line.label ?? '', line.text).not.toMatch(IDENTIFIER);
    }
  });

  it('writes no key in the palette name or the empty summary of any shipped kind', () => {
    const scoped = wireScopeOf(program, CTX);
    for (const kind of NODE_REGISTRY.shipped()) {
      expect(kind.name, kind.id).not.toMatch(IDENTIFIER);
      const text = nodeSummaryText(node(1, 'probe', kind.id), CTX, scoped);
      expect(text, kind.id).not.toMatch(IDENTIFIER);
    }
  });
});
