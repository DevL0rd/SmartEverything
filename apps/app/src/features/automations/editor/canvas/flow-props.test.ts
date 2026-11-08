import { describe, expect, it } from 'vitest';
import { GRAPH_EDGE_TYPES } from './edges/edge-types';
import { FLOW_PROPS } from './flow-props';
import { GRAPH_NODE_TYPES } from './node-registry';

describe('graph canvas flow props', () => {
  it('turns the built-in keyboard moves off so wire navigation owns the arrow keys', () => {
    expect(FLOW_PROPS.disableKeyboardA11y).toBe(true);
    expect(FLOW_PROPS.nodesFocusable).toBe(true);
  });

  it('hands connecting and deleting to the canvas itself', () => {
    expect(FLOW_PROPS.connectOnClick).toBe(false);
    expect(FLOW_PROPS.deleteKeyCode).toBeNull();
  });

  it('hides the attribution link so it is no tab stop and no small text', () => {
    expect(FLOW_PROPS.proOptions).toEqual({ hideAttribution: true });
  });

  it('keeps one stable map of node types and edge types', () => {
    expect(FLOW_PROPS.nodeTypes).toBe(GRAPH_NODE_TYPES);
    expect(FLOW_PROPS.edgeTypes).toBe(GRAPH_EDGE_TYPES);
    expect(Object.keys(GRAPH_EDGE_TYPES).sort()).toEqual(['exec', 'value']);
  });
});
