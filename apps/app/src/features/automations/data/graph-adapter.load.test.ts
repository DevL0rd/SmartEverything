import { describe, expect, it } from 'vitest';

type Load = () => Promise<object>;

const CONSUMERS: Readonly<Record<string, Load>> = {
  'runs/run-view/program-facts': () => import('../runs/run-view/program-facts'),
  'runs/run-view/use-pinned-program': () => import('../runs/run-view/use-pinned-program'),
  'functions/detail/detail-model': () => import('../functions/detail/detail-model'),
  'functions/detail/same-steps-model': () => import('../functions/detail/same-steps-model'),
  'functions/edit/instance-model': () => import('../functions/edit/instance-model'),
  'functions/edit/interface-model': () => import('../functions/edit/interface-model'),
  'functions/edit/new-node-model': () => import('../functions/edit/new-node-model'),
  'functions/library/callers-behind': () => import('../functions/library/callers-behind'),
  'functions/make-reusable/commit': () => import('../functions/make-reusable/commit'),
  'functions/make-reusable/dialog-model': () => import('../functions/make-reusable/dialog-model'),
  'functions/make-reusable/interface-rows': () =>
    import('../functions/make-reusable/interface-rows'),
  'functions/make-reusable/plain-reference': () =>
    import('../functions/make-reusable/plain-reference'),
  'functions/make-reusable/refusal-view': () => import('../functions/make-reusable/refusal-view'),
  'model/consumers/diffuser-schedule': () => import('../model/consumers/diffuser-schedule'),
  'model/consumers/automation-uses': () => import('../model/consumers/automation-uses'),
  'model/consumers/press-meaning': () => import('../model/consumers/press-meaning'),
  'model/consumers/search-entries': () => import('../model/consumers/search-entries'),
  'model/consumers/week-schedule': () => import('../model/consumers/week-schedule'),
  'editor/problems/fix-actions': () => import('../editor/problems/fix-actions'),
  'editor/problems/problem-model': () => import('../editor/problems/problem-model'),
  'editor/drafts/draft-sync-model': () => import('../editor/drafts/draft-sync-model'),
  'editor/inspector/sections/behaviour-model': () =>
    import('../editor/inspector/sections/behaviour-model'),
  'editor/inspector/sections/node-view': () => import('../editor/inspector/sections/node-view'),
  'editor/inspector/sections/edits': () => import('../editor/inspector/sections/edits'),
  'editor/inspector/sections/loop-model': () => import('../editor/inspector/sections/loop-model'),
  'editor/inspector/values/wire-model': () => import('../editor/inspector/values/wire-model'),
  'editor/header/usage': () => import('../editor/header/usage'),
  'model/templates/all-templates': () => import('../model/templates/all-templates'),
  'model/templates/preview': () => import('../model/templates/preview'),
  'model/templates/snippets': () => import('../model/templates/snippets'),
  'model/templates/structured': () => import('../model/templates/structured'),
};

const HOOKS: Readonly<Record<string, Load>> = {
  'data/api': () => import('./api'),
  'data/automation-rows': () => import('./automation-rows'),
  'data/graph-adapter': () => import('./graph-adapter'),
  'data/source': () => import('./source'),
  'data/use-automation': () => import('./use-automation'),
  'data/use-automations': () => import('./use-automations'),
  'data/use-draft-sync-source': () => import('./use-draft-sync-source'),
  'data/use-functions': () => import('./use-functions'),
};

describe('every module that reads automation programs loads', () => {
  for (const [name, load] of Object.entries({ ...CONSUMERS, ...HOOKS })) {
    it(`loads ${name}`, async () => {
      expect(Object.keys(await load()).length).toBeGreaterThan(0);
    });
  }
});
