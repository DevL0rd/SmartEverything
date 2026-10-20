import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FlowNode } from '@smarteverything/domain';
import { Ids, automation, ifNode, scope, setLight } from '../../model/canvas/canvas-fixtures';
import { envOf, recordingActions, viewByKey } from './sections/inspector-fixtures';
import type { InspectorEnv, ValueRequest } from './sections/section-types';

vi.mock('../../../../design/colour', () => ({
  useColour: (): string => '#000000',
  withAlpha: (): string => '#000000',
}));
vi.mock('../../../../components/switch', () => ({
  Switch: (): null => null,
  SwitchTrack: (): null => null,
}));

const { NodeSections } = await import('./sections');
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
  it('shows the header with the class badge, the label and no key', () => {
    const light = setLight(new Ids(), null, { label: 'Dim the lamp' });
    const html = render(automation([light]), light.key, { breakpoint: true });
    expect(html).toContain('Dim the lamp');
    expect(html).toContain('Step');
    expect(html).toContain('Pauses here');
    expect(html).not.toContain(`>${light.key}<`);
  });

  it('keeps the key, Step is on and Free position inside Advanced', () => {
    const light = setLight(new Ids(), null);
    const html = render(automation([light]), light.key);
    expect(html).toContain('Advanced');
    expect(html).not.toContain('Free position');
    expect(html).not.toContain('Step is on');
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
    const html = render(automation([loop]), loop.key);
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
    const html = render(automation([loop]), loop.key);
    expect(html).toContain('Most passes');
  });

  it('shows For each at the same time and the collect switch', () => {
    const loop = lone('flow.for_each', { scopes: { body: scope([]) } });
    const html = render(automation([loop]), loop.key);
    expect(html).toContain('At the same time');
    expect(html).toContain('Passes can finish in any order');
    expect(html).toContain('Collect a value from each pass');
    expect(html).toContain('Adds the output Results');
  });

  it('shows the cases of an If with an add button', () => {
    const branch = ifNode(new Ids(), [scope([]), scope([])]);
    const html = render(automation([branch]), branch.key);
    expect(html).toContain('Otherwise if');
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

  it('shows Do together with its join, failure policy and branches', () => {
    const node = lone('flow.parallel', { scopes: { branch1: scope([]), branch2: scope([]) } });
    const html = render(automation([node]), node.key);
    expect(html).toContain('Finishes when');
    expect(html).toContain('If one branch fails');
    expect(html).toContain('Add a branch');
    expect(html).toContain('Branch 2');
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

describe('Inspector', () => {
  it('renders nothing for a missing selection and the sections for a docked panel', () => {
    const light = setLight(new Ids(), null);
    const program = automation([light]);
    const { actions } = recordingActions();
    const empty = renderToStaticMarkup(
      createElement(Inspector, {
        selectedId: null,
        env: envOf(program),
        actions,
        docked: true,
        onClose: (): undefined => undefined,
      }),
    );
    expect(empty).toBe('');
    const docked = renderToStaticMarkup(
      createElement(Inspector, {
        selectedId: light.id,
        env: envOf(program),
        actions,
        docked: true,
        onClose: (): undefined => undefined,
      }),
    );
    expect(docked).toContain('Step options');
    expect(docked).toContain('Inputs');
  });
});
