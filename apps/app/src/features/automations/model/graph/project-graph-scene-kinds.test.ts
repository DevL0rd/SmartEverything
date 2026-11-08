import { describe, expect, it } from 'vitest';
import { STATIC_KIND_LOOKUP, type NodeKindLookup } from '@smarteverything/domain';
import { automation, gnode, start, stop, wire } from './graph-scene-fixtures';
import { kindLookupOf } from '../../data/kind-lookup';
import { PING_KIND_ID, kindRow } from '../../../../test-support/plugin-kinds';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import { deleteEffectOf } from '../../editor/host/delete-intent';
import { nodeView } from '../../editor/inspector/sections/node-view';
import { treeFor } from '../editor/structured';
import { projectGraphScene } from './project-graph-scene';

const PROGRAM = automation([
  start('ping'),
  gnode('ping', PING_KIND_ID, { ports: { target: { lit: 'kitchen' } }, to: { next: 'say' } }),
  gnode('say', 'notify.feed', { ports: { message: wire('ping', 'reply') }, to: { next: 'end' } }),
  stop('end'),
]);

function pingNode(kinds: NodeKindLookup): {
  readonly icon: string;
  readonly category: string;
  readonly title: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
} {
  const scene = projectGraphScene(PROGRAM, { direction: 'ltr', kinds });
  const found = scene.nodes.find((node) => node.key === 'ping');
  if (found === undefined) throw new Error('the plugin step is not in the scene');
  return {
    icon: found.icon,
    category: found.category,
    title: found.title,
    inputs: found.inputs.map((pin) => pin.name),
    outputs: found.outputs.map((pin) => pin.name),
  };
}

describe('the graph scene with plugin kinds', () => {
  it('draws a plugin step from its declaration, whatever its status', () => {
    for (const status of ['active', 'off', 'retired'] as const) {
      const found = pingNode(kindLookupOf([kindRow(status)]));
      expect(found.icon).toBe('plug');
      expect(found.category).toBe('plugins');
      expect(found.title).toBe('Ping the demo');
      expect(found.inputs).toEqual(['target']);
      expect(found.outputs).toEqual(['reply']);
    }
  });

  it('shows the plugin step as unknown when its kind is not in the lookup', () => {
    const found = pingNode(STATIC_KIND_LOOKUP);
    expect(found.icon).toBe('circle-help');
    expect(found.inputs).toEqual(['target']);
    expect(found.outputs).toEqual([]);
  });

  it('wires a plugin output into the next step', () => {
    const scene = projectGraphScene(PROGRAM, {
      direction: 'ltr',
      kinds: kindLookupOf([kindRow()]),
    });
    const edge = scene.edges.find((item) => item.source.handle.includes('reply'));
    expect(edge).toBeDefined();
  });

  it('names the kind of a card from the lookup', () => {
    const lookup = kindLookupOf([kindRow()]);
    const scene = projectGraphScene(PROGRAM, { direction: 'ltr', kinds: lookup });
    const found = scene.nodes.find((node) => node.key === 'ping');
    if (found === undefined) throw new Error('the plugin step is not in the scene');
    expect(found.kindName).toBe('Ping the demo');
    expect(pingNode(STATIC_KIND_LOOKUP).title).toBe(PING_KIND_ID);
  });

  it('draws a plugin action as a step card with its exec rows, not as a value card', () => {
    const scene = projectGraphScene(PROGRAM, {
      direction: 'ltr',
      kinds: kindLookupOf([kindRow()]),
    });
    const found = scene.nodes.find((node) => node.key === 'ping');
    if (found === undefined) throw new Error('the plugin step is not in the scene');
    expect(found.family).toBe('step');
    expect(found.execIn).not.toBeNull();
    expect(found.rows.map((row) => row.port)).toContain('next');
    expect(
      scene.edges.some((edge) => edge.kind === 'exec' && edge.source.nodeId === found.id),
    ).toBe(true);
  });

  it('opens the inspector of a plugin action as a step with its inputs', () => {
    const lookup = kindLookupOf([kindRow()]);
    const tree = treeFor(PROGRAM, lookup);
    if (tree === null) throw new Error('the program with a plugin step does not read as steps');
    const ping = PROGRAM.nodes.find((node) => node.key === 'ping');
    if (ping === undefined) throw new Error('no plugin step');
    const view = nodeView(indexProgram(tree), ping.id, lookup);
    expect(view?.badge).toBe('Step');
    expect(view?.kind?.inputs.map((port) => port.name)).toEqual(['target']);
    expect(deleteEffectOf(PROGRAM, ping.id, lookup)).not.toBe('loose');
  });
});
