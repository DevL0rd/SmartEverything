import { describe, expect, it } from 'vitest';
import {
  EMPTY_LAYOUT,
  NODE_REGISTRY,
  type AutomationFunctionSummary,
} from '@smarteverything/domain';
import { PREVIEW_LINT } from '../model/fixtures/lint-context';
import { Ids, automation, setLight } from '../model/canvas/canvas-fixtures';
import { editorContextOf, inspectorEnvOf } from './editor-context';

const SUMMARY: AutomationFunctionSummary = {
  id: '00000000-0000-4000-8000-0000000000f1',
  name: 'Dim gently',
  description: null,
  category: null,
  icon: null,
  builtin: false,
  editable: true,
  revision: 4,
  interface: { flavour: 'action', inputs: [], outputs: [], exits: ['done'] },
  interfaceHash: 'hash',
  users: 0,
  createdBy: null,
  updatedAt: null,
};

function context(): ReturnType<typeof editorContextOf> {
  return editorContextOf({
    registry: NODE_REGISTRY,
    names: (kind, id) => (kind === 'person' && id === 'p1' ? 'Fynn' : undefined),
    lint: PREVIEW_LINT,
    summaries: [SUMMARY],
  });
}

describe('editorContextOf', () => {
  it('gives the canvas the home names and the Custom Nodes', () => {
    const { options, describe: words, functions } = context();
    expect(options.names?.('person', 'p1')).toBe('Fynn');
    expect(words.names('person', 'p1')).toBe('Fynn');
    expect(options.functions?.get(SUMMARY.id)).toEqual({ name: 'Dim gently', latest: 4 });
    expect(functions.get(SUMMARY.id)?.latest).toBe(4);
  });
});

describe('inspectorEnvOf', () => {
  it('reads the free position of the selected step from the layout', () => {
    const ids = new Ids();
    const step = setLight(ids, null);
    const program = automation([step]);
    const layout = { ...EMPTY_LAYOUT, nodes: { [step.id]: { x: 10, y: 20 } } };
    const input = { program, layout, findings: [] };
    expect(inspectorEnvOf({ ...input, target: step.id }, context()).freePosition).toBe(true);
    expect(inspectorEnvOf({ ...input, target: null }, context()).freePosition).toBe(false);
    expect(inspectorEnvOf({ ...input, target: step.id }, context()).exits).toEqual([]);
  });
});
