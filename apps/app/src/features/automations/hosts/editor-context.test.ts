import { describe, expect, it } from 'vitest';
import {
  EMPTY_LAYOUT,
  NODE_REGISTRY,
  type AutomationFunctionSummary,
} from '@smarteverything/domain';
import { PREVIEW_LINT } from '../model/fixtures/lint-context';
import { automation, gnode, idOf, note, start } from '../model/graph/graph-scene-fixtures';
import { editorContextOf, inspectorEnvOf } from './editor-context';

const SUMMARY: AutomationFunctionSummary = {
  id: '00000000-0000-4000-8000-0000000000f1',
  name: 'Dim gently',
  description: null,
  category: null,
  icon: null,
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
    expect(options.names('person', 'p1')).toBe('Fynn');
    expect(words.names('person', 'p1')).toBe('Fynn');
    expect(options.functions.get(SUMMARY.id)).toEqual({ name: 'Dim gently', latest: 4 });
    expect(functions.get(SUMMARY.id)?.latest).toBe(4);
  });
});

describe('inspectorEnvOf', () => {
  const program = automation([start('a'), note('a')], { triggers: [] });
  const layout = { ...EMPTY_LAYOUT, nodes: { [idOf('a')]: { x: 10, y: 20 } } };
  const input = { program, layout, findings: [] };

  it('reads the free position of the selected step from the layout', () => {
    const model = inspectorEnvOf({ ...input, target: idOf('a') }, context());
    expect(model.steps?.freePosition).toBe(true);
    expect(inspectorEnvOf({ ...input, target: null }, context()).steps?.freePosition).toBe(false);
    expect(model.steps?.exits).toEqual([]);
  });

  it('keeps the graph for steps the structured form does not hold', () => {
    const model = inspectorEnvOf({ ...input, target: idOf('a') }, context());
    expect(model.graph.graph).toBe(program);
    expect(model.steps?.graph).toBe(program);
  });

  it('offers only the graph panel while the program does not read as steps', () => {
    const loose = automation([start('a'), note('a'), gnode('stray', 'notify.feed')], {
      triggers: [],
    });
    const model = inspectorEnvOf({ ...input, program: loose, target: idOf('stray') }, context());
    expect(model.steps).toBeNull();
    expect(model.graph.graph).toBe(loose);
  });
});
