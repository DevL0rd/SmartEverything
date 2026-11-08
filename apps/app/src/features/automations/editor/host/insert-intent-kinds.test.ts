import { describe, expect, it } from 'vitest';
import { EMPTY_LAYOUT, STATIC_KIND_LOOKUP, type NodeKindLookup } from '@smarteverything/domain';
import { kindLookupOf } from '../../data/kind-lookup';
import { PING_KIND_ID, kindRow } from '../../../../test-support/plugin-kinds';
import { automation, gnode, idOf, start, stop } from '../../model/graph/graph-scene-fixtures';
import type { GraphDocument, IntentRuntime, Planned } from './intent-env';
import { planInsert } from './insert-intent';

const LOOKUP = kindLookupOf([kindRow()]);

function runtimeOf(kinds: NodeKindLookup): IntentRuntime {
  return {
    newId: () => '00000000-0000-4000-9000-000000000001',
    density: 'touch',
    direction: 'ltr',
    check: {
      kinds: (id) => kinds.get(id),
      automations: () => undefined,
      scopeOutputs: () => [],
      references: () => false,
      functions: () => undefined,
      secrets: new Set(),
    },
    kinds,
    sizes: new Map(),
  };
}

const RT = runtimeOf(STATIC_KIND_LOOKUP);
const RT_PLUGIN = runtimeOf(LOOKUP);

const DOC: GraphDocument = {
  program: automation([
    start('ping'),
    gnode('ping', PING_KIND_ID, { ports: { target: { lit: 'kitchen' } }, to: { next: 'end' } }),
    stop('end'),
  ]),
  layout: EMPTY_LAYOUT,
};

function reasonOf(planned: Planned): string {
  if (planned.ok) throw new Error('expected a refusal');
  return planned.reason;
}

describe('planInsert with plugin kinds', () => {
  it('refuses a plugin step the lookup does not know', () => {
    expect(reasonOf(planInsert(DOC, { kind: PING_KIND_ID }, RT))).toBe(
      `There is no step called "${PING_KIND_ID}".`,
    );
  });

  it('adds a plugin step and names it from its declaration', () => {
    const planned = planInsert(DOC, { kind: PING_KIND_ID }, RT_PLUGIN);
    if (!planned.ok) throw new Error(planned.reason);
    expect(planned.ops).toHaveLength(1);
    expect(planned.message({ program: DOC.program, created: [] }).announcement).toBe(
      'Added Ping the demo.',
    );
  });

  it('adds a step after a plugin step only when the lookup gives that step its exits', () => {
    const request = { kind: 'notify.feed', after: { nodeId: idOf('ping'), port: 'next' } };
    expect(reasonOf(planInsert(DOC, request, RT))).toContain('has no exit "next"');
    expect(planInsert(DOC, request, RT_PLUGIN).ok).toBe(true);
  });
});
