import { describe, expect, it } from 'vitest';
import GraphCanvas from './graph-canvas';
import { GRAPH_NODE_TYPES } from './node-registry';

describe('graph canvas module', () => {
  it('loads as a component without a native view', () => {
    expect(typeof GraphCanvas).toBe('function');
  });

  it('keeps one stable node type map', async () => {
    const again = await import('./node-registry');
    expect(again.GRAPH_NODE_TYPES).toBe(GRAPH_NODE_TYPES);
  });
});
