import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { createElement } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup as renderMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NODE_REGISTRY, type FlowNode, type ProgramV4 } from '@smarteverything/domain';
import { structuredOf } from '@smarteverything/flow/graph/structured-of';
import { Ids, automation, ifNode, scope, setLight } from '../../model/canvas/canvas-fixtures';
import {
  automation as graphAutomation,
  forkProgram,
  gnode,
  idOf,
  note,
  start,
} from '../../model/graph/graph-scene-fixtures';
import { envOf, recordingActions, viewByKey } from './sections/inspector-fixtures';
import { ValueServicesContext, type ValueServices } from './values/value-services';
import type { InspectorModel } from './inspector';
import type { InspectorEnv, ValueRequest } from './sections/section-types';

vi.mock('../../../../design/colour', () => ({
  useColour: (): string => '#000000',
  withAlpha: (): string => '#000000',
}));
vi.mock('../../../../components/switch', () => ({
  Switch: (): null => null,
  SwitchTrack: (): null => null,
}));

const SERVICES: ValueServices = {
  env: null,
  references: { options: () => [] },
  secrets: { options: [], owner: false, onAdd: (): void => undefined },
  deviceOptions: () => ({ status: 'ready', options: [{ id: 'brightness', label: 'Brightness' }] }),
};

function renderToStaticMarkup(element: ReactElement): string {
  return renderMarkup(createElement(ValueServicesContext, { value: SERVICES }, element));
}

const { NodeSections } = await import('./sections');
const { setMoreOptionsOpen } = await import('./sections/more-options-state');

function opened<T>(run: () => T): T {
  setMoreOptionsOpen(true);
  try {
    return run();
  } finally {
    setMoreOptionsOpen(false);
  }
}
const { Inspector } = await import('./inspector');

function render(
  program: ReturnType<typeof automation>,
  key: string,
  extra: Partial<InspectorEnv> = {},
): string {
  const { actions } = recordingActions();
  return renderToStaticMarkup(
    createElement(NodeSections, {
      view: viewByKey(program, key),
      env: envOf(program, extra),
      actions,
    }),
  );
}

function lone(kind: string, extra: Partial<FlowNode> = {}): FlowNode {
  return { ...new Ids(40).next(), kind, ...extra };
}

describe('inspector sections render', () => {
  it('shows the kind and its description in the header, with no key and no name field', () => {
    const light = setLight(new Ids(), null, { label: 'Dim the lamp' });
    const html = render(automation([light]), light.key, { breakpoint: true });
    expect(html).toContain('Change device');
    expect(html).toContain('Pauses here');
    expect(html).not.toContain('Dim the lamp');
    expect(html).not.toContain(`>${light.key}<`);
  });

  it('keeps name, note, failure handling, key, Step is on and Free position inside More options', () => {
    const light = setLight(new Ids(), null, { label: 'Dim the lamp' });
    const closed = render(automation([light]), light.key);
    expect(closed).toContain('More options');
    for (const hidden of ['Keep where I drop it', 'Step is on', 'Stop the run', 'Dim the lamp']) {
      expect(closed).not.toContain(hidden);
    }
    const open = opened(() => render(automation([light]), light.key));
    for (const shown of [
      'Keep where I drop it',
      'Step is on',
      'When it fails',
      'Stop the run',
      'Dim the lamp',
      'Note',
    ]) {
      expect(open).toContain(shown);
    }
  });

  it('says what is set inside More options while it is closed', () => {
    const light = setLight(new Ids(), null, { note: 'Careful', policy: { timeout: 5000 } });
    const html = render(automation([light]), light.key);
    expect(html).toContain('Note, Time limit 5 s');
  });

  it('offers Delete step and says what happens to the steps around it', () => {
    const ids = new Ids();
    const light = setLight(ids, null);
    const html = render(automation([light]), light.key);
    expect(html).toContain('Delete step');
    expect(html).toContain('joined up');
    const branch = ifNode(new Ids(10), [scope([setLight(new Ids(20), null)])]);
    expect(render(automation([branch]), branch.key)).toContain('Delete step');
  });

  it('shows the problems of the node with a fix button', () => {
    const light = setLight(new Ids(), null);
    const html = render(automation([light]), light.key, {
      findings: [
        {
          id: 'a',
          severity: 'error',
          message: 'No light chosen',
          port: undefined,
          fix: 'Pick one',
        },
        { id: 'b', severity: 'warning', message: 'Runs often', port: undefined, fix: undefined },
      ],
    });
    expect(html).toContain('No light chosen');
    expect(html).toContain('Pick one');
    expect(html.indexOf('No light chosen')).toBeLessThan(html.indexOf('Runs often'));
  });

  it('shows Loop limits with the caption of the loop kind', () => {
    const loop = lone('flow.while', { scopes: { body: scope([]) } });
    const html = opened(() => render(automation([loop]), loop.key));
    expect(html).toContain('Loop limits');
    expect(html).toContain('Before checking again');
    expect(html).toContain('Stops the loop even in the middle of a pass');
    expect(html).toContain('Pass limit');
    expect(html).not.toContain('Most passes');
  });

  it('shows the pass stepper once a While has a pass limit', () => {
    const loop = lone('flow.while', {
      scopes: { body: scope([]) },
      ports: { limit: { lit: { iterations: 500, onLimit: 'fail' } } },
    });
    const html = opened(() => render(automation([loop]), loop.key));
    expect(html).toContain('Most passes');
  });

  it('shows For each at the same time and the collect switch', () => {
    const loop = lone('flow.for_each', { scopes: { body: scope([]) } });
    expect(render(automation([loop]), loop.key)).not.toContain('At the same time');
    const html = opened(() => render(automation([loop]), loop.key));
    expect(html).toContain('At the same time');
    expect(html).toContain('Passes can finish in any order');
    expect(html).toContain('Collect a value from each pass');
    expect(html).toContain('Adds the output Results');
  });

  it('shows the cases of an If with an add button', () => {
    const branch = ifNode(new Ids(), [scope([]), scope([])]);
    const html = render(automation([branch]), branch.key);
    expect(html).toContain('Add a case');
    expect(html).toContain('Otherwise');
  });

  it('shows the match types and Run every matching case on a Switch', () => {
    const ids = new Ids();
    const node = lone('flow.switch', {
      ports: { subject: { lit: 'a' } },
      cases: [{ id: ids.next().id, match: { eq: 'a' }, scope: scope([]) }],
    });
    const html = render(automation([node]), node.key);
    for (const label of ['Equals', 'One of', 'Between', 'Condition', 'Run every matching case']) {
      expect(html).toContain(label);
    }
  });

  it('offers every option of the subject that has no case yet', () => {
    const node = lone('flow.switch', { ports: { subject: { lit: 'a' } }, cases: [] });
    const html = render(automation([node]), node.key, {
      subjectChoices: { options: [{ id: 'a', label: 'A' }] },
    });
    expect(html).toContain('Add all options');
    expect(render(automation([node]), node.key)).not.toContain('Add all options');
  });

  it('shows Do together with its paths and the Wait for all options', () => {
    const node = lone('flow.parallel', { scopes: { path1: scope([]), path2: scope([]) } });
    const html = render(automation([node]), node.key);
    expect(html).toContain('Paths');
    expect(html).toContain('Add a path');
    expect(html).toContain('Path 2');
  });

  it('shows where each exit of a step leads and what leads into it', () => {
    const light = setLight(new Ids(), null);
    const html = render(automation([light]), light.key);
    expect(html).toContain('Comes from');
  });

  it('shows Which loop with the loops around a Break', () => {
    const ids = new Ids();
    const leave: FlowNode = { ...ids.next(), kind: 'flow.break' };
    const outer: FlowNode = {
      ...ids.next(),
      kind: 'flow.repeat',
      ports: { times: { lit: 2 } },
      scopes: { body: scope([leave]) },
    };
    const html = render(automation([outer]), leave.key);
    expect(html).toContain('Which loop');
    expect(html).toContain('Repeat 2 times');
    expect(html).toContain('Innermost');
  });

  it('shows the Return exit picker and what it gives back', () => {
    const node = lone('flow.return');
    const html = render(automation([node]), node.key, { exits: ['next', 'failed'] });
    expect(html).toContain('Leave through');
    expect(html).toContain('Edit interface');
  });

  it('shows Remembers only for a stateful node in the run view', () => {
    const light = setLight(new Ids(), null);
    const run = {
      iterations: 1,
      iteration: 0,
      inputs: { a: 1 },
      outputs: { b: 2 },
      memory: undefined,
    };
    const html = render(automation([light]), light.key, { run });
    expect(html).toContain('Run values');
    expect(html).not.toContain('Remembers');
  });

  it('hands every value editor to the slot with the port it edits', () => {
    const requests: ValueRequest[] = [];
    const light = setLight(new Ids(), null);
    render(automation([light]), light.key, {
      renderValue: (request) => {
        requests.push(request);
        return null;
      },
    });
    expect(requests.map((request) => request.slot)).toContain('to');
    expect(requests.every((request) => request.nodeKey === light.key)).toBe(true);
  });
});

function modelOf(program: ReturnType<typeof automation>): InspectorModel {
  const env = envOf(program);
  return { graph: env, steps: env };
}

describe('Inspector', () => {
  it('renders nothing for a missing selection and the sections for a docked panel', () => {
    const light = setLight(new Ids(), null);
    const program = automation([light]);
    const { actions } = recordingActions();
    const empty = renderToStaticMarkup(
      createElement(Inspector, {
        selectedId: null,
        model: modelOf(program),
        actions,
        docked: true,
        onClose: (): undefined => undefined,
      }),
    );
    expect(empty).toBe('');
    const docked = renderToStaticMarkup(
      createElement(Inspector, {
        selectedId: light.id,
        model: modelOf(program),
        actions,
        docked: true,
        onClose: (): undefined => undefined,
      }),
    );
    expect(docked).toContain('Step options');
    expect(docked).toContain('Inputs');
  });
});

describe('Inspector for steps the structured form does not hold', () => {
  const noop = (): undefined => undefined;

  function docked(program: ProgramV4, selectedId: string, structured: boolean): string {
    const tree = structuredOf(program, STATIC_KIND_LOOKUP);
    if (tree.kind !== 'structured') throw new Error('the fixture does not read as steps');
    const env = envOf(tree.tree, { graph: program });
    const { actions } = recordingActions();
    return renderToStaticMarkup(
      createElement(Inspector, {
        selectedId,
        model: { graph: env, steps: structured ? env : null },
        actions,
        docked: true,
        onClose: noop,
      }),
    );
  }

  it('shows the options of Wait for all when it is selected', () => {
    const program = forkProgram('all');
    const joinId = program.nodes.find((node) => node.kind === 'flow.join')?.id ?? '';
    const html = docked(program, joinId, true);
    expect(html).toContain('Wait for all');
    expect(html).toContain('Finishes when');
    expect(html).toContain('Comes from');
  });

  it('shows Then of Start so the first wire can be changed', () => {
    const html = docked(forkProgram('all'), idOf('start'), true);
    expect(html).toContain('Start');
    expect(html).toContain('Goes to');
    expect(html).toContain('Do together');
    expect(html).toContain('Only start if');
    expect(html).toContain('Check before every run');
  });

  it('still offers wires and rows when the program does not read as steps', () => {
    const program = graphAutomation(
      [
        start('a'),
        gnode('a', 'flow.parallel', { paths: [{ name: 'one' }, { name: 'two' }] }),
        note('b'),
      ],
      { triggers: [] },
    );
    const tree = structuredOf(program, STATIC_KIND_LOOKUP);
    expect(tree.kind).toBe('unstructured');
    const { actions } = recordingActions();
    const html = renderToStaticMarkup(
      createElement(Inspector, {
        selectedId: idOf('b'),
        model: {
          graph: {
            graph: program,
            registry: NODE_REGISTRY,
            findings: [],
            subjectChoices: undefined,
            renderValue: () => null,
            locked: false,
          },
          steps: null,
        },
        actions,
        docked: true,
        onClose: noop,
      }),
    );
    expect(html).toContain('Comes from');
  });
});
