import {
  NODE_REGISTRY,
  type AutomationFunctionSummary,
  type AutomationSecretEntry,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  KITCHEN,
  buttonTrigger,
  program,
  row,
  setPower,
} from './model/consumers/consumer-fixtures';
import { AUTOMATIONS_ACTIONS, ROUTES, automationSearchPages, links } from './routes';

const kinds = NODE_REGISTRY.get;

function summary(over: Partial<AutomationFunctionSummary> = {}): AutomationFunctionSummary {
  return {
    id: 'fn-1',
    name: 'Fade lights',
    description: 'Dims slowly',
    category: 'Lighting',
    icon: null,
    builtin: false,
    editable: true,
    revision: 1,
    interface: {
      flavour: 'action',
      inputs: [{ name: 'lights', label: 'Which lights', type: { t: 'any' }, required: true }],
      outputs: [{ name: 'level', type: { t: 'number' } }],
      exits: ['done'],
    },
    interfaceHash: 'h',
    users: 1,
    createdBy: null,
    updatedAt: null,
    ...over,
  };
}

const SECRET: AutomationSecretEntry = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Weather API',
  createdAt: '2026-10-18T10:00:00+00:00',
  updatedAt: '2026-10-18T10:00:00+00:00',
};

describe('the automations routes', () => {
  it('has unique keys under the automations tab, each with search words', () => {
    const keys = ROUTES.map((route) => route.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining([
        'automations.nodes',
        'automations.templates',
        'automations.variables',
        'automations.scenes',
        'automations.schedule',
        'automations.scheduled',
        'automations.runs',
        'automations.secrets',
      ]),
    );
    for (const route of ROUTES) {
      expect(route.key.startsWith('automations.')).toBe(true);
      expect(route.tab).toBe('automations');
      expect(route.parent).toBe('automations');
      expect(route.searchable).toBe(true);
      expect(route.keywords.length).toBeGreaterThan(0);
    }
  });

  it('offers a New action where a page creates things, and only owners add secrets', () => {
    const withNew = ROUTES.filter(
      (route) => route.actions?.some((action) => action.key === 'new') === true,
    );
    expect(withNew.map((route) => route.key)).toEqual([
      'automations.nodes',
      'automations.variables',
      'automations.scenes',
      'automations.scheduled',
      'automations.secrets',
    ]);
    const secrets = ROUTES.find((route) => route.key === 'automations.secrets');
    expect(secrets?.actions?.[0]).toMatchObject({ title: 'Add a secret', ownerOnly: true });
  });

  it('gives the list the New automation and from-template actions', () => {
    expect(AUTOMATIONS_ACTIONS.map((action) => action.title)).toEqual([
      'New automation',
      'New automation from a template',
    ]);
    expect(AUTOMATIONS_ACTIONS[0]?.href).toBe('/automations/new');
  });

  it('builds editor links that carry only the params given', () => {
    expect(links.edit('a1')).toEqual({
      pathname: '/automations/[automationId]/edit',
      params: { automationId: 'a1' },
    });
    expect(links.edit('a1', 'node:n1')).toEqual({
      pathname: '/automations/[automationId]/edit',
      params: { automationId: 'a1', focus: 'node:n1' },
    });
    expect(links.create('tpl')).toEqual({
      pathname: '/automations/new',
      params: { template: 'tpl' },
    });
    expect(links.secrets()).toBe('/automations/secrets');
  });
});

describe('the automation search pages', () => {
  const definition = program(
    [buttonTrigger(KITCHEN, 'single_press')],
    [setPower(1, KITCHEN, true)],
    [{ name: 'level', type: { t: 'number' }, required: true }],
  );
  const automation = row('a1', 'Press lights', definition);
  const pages = automationSearchPages({
    automations: [automation],
    functions: [summary(), summary({ id: 'fn-2', name: 'Built in', editable: false })],
    secrets: [SECRET],
    kinds,
  });
  const byPath = (path: string): (typeof pages)[number] | undefined =>
    pages.find((page) => page.path === path);

  it('has unique paths', () => {
    const paths = pages.map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('adds the flowchart and in-page actions under every automation', () => {
    for (const key of ['flowchart', 'test', 'publish', 'make-reusable']) {
      expect(byPath(`automation-editor:a1:${key}`)?.parent).toBe('automation:a1');
    }
    expect(byPath('automation-editor:a1:test')?.to).toEqual({
      pathname: '/automations/[automationId]/edit',
      params: { automationId: 'a1', focus: 'action:test' },
    });
    expect(byPath('automation-editor:a1:flowchart')?.keywords).toContain('flowchart');
  });

  it('opens the editor at each input and node through the focus parameter', () => {
    const nodes = pages.filter((page) => page.path.startsWith('automation-editor:a1:node:'));
    expect(nodes).toHaveLength(2);
    for (const page of nodes) {
      const focus = page.path.slice('automation-editor:a1:'.length);
      expect(page.to).toEqual({
        pathname: '/automations/[automationId]/edit',
        params: { automationId: 'a1', focus },
      });
      expect(page.parent).toBe('automation:a1');
    }
    expect(byPath('automation-editor:a1:input:level')?.title).toBe('level');
  });

  it('lists Custom Nodes with interface words and an edit action only when editable', () => {
    const node = byPath('automation-node:fn-1');
    expect(node).toMatchObject({ title: 'Fade lights', parent: 'page:automations.nodes' });
    expect(node?.keywords).toEqual(
      expect.arrayContaining(['Lighting', 'lights', 'Which lights', 'level', 'done', 'step']),
    );
    expect(byPath('automation-node:fn-1:edit')?.parent).toBe('page:automation-node:fn-1');
    expect(byPath('automation-node:fn-2')).toBeDefined();
    expect(byPath('automation-node:fn-2:edit')).toBeUndefined();
  });

  it('lists secret names under the Secrets page and never their values', () => {
    const page = byPath(`automation-secret:${SECRET.id}`);
    expect(page).toMatchObject({ title: 'Weather API', parent: 'page:automations.secrets' });
    expect(JSON.stringify(pages)).not.toContain('value');
  });
});
