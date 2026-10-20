import { describe, expect, it } from 'vitest';
import {
  NODE_CATEGORIES,
  NODE_CATEGORY_COLOUR,
  ORB_SHINE_CATEGORIES,
  TYPE_COLOUR,
  TYPE_SHAPE,
  VALUE_TYPES,
  categoryColour,
  colourVariable,
  parseValueType,
  typeColour,
  typeShape,
} from './node-colours';

describe('node colours', () => {
  it('covers every category and type', () => {
    expect(Object.keys(NODE_CATEGORY_COLOUR).sort()).toEqual([...NODE_CATEGORIES].sort());
    expect(Object.keys(TYPE_COLOUR).sort()).toEqual([...VALUE_TYPES].sort());
    expect(Object.keys(TYPE_SHAPE).sort()).toEqual([...VALUE_TYPES].sort());
  });

  it('falls back for an unknown category', () => {
    expect(categoryColour('Triggers')).toBe('primary');
    expect(categoryColour('Nothing')).toBe('viz-6');
    expect([...ORB_SHINE_CATEGORIES]).toEqual(['AI and tools']);
  });

  it('reads generic, optional and record types', () => {
    expect(parseValueType('optional<list<number>>')).toEqual({ type: 'list', optional: true });
    expect(parseValueType('device<light>')).toEqual({ type: 'device', optional: false });
    expect(parseValueType('record{a: text}').type).toBe('record');
    expect(parseValueType('mystery').type).toBe('any');
    expect(typeColour('boolean')).toBe('viz-violet');
    expect(typeShape('list<text>')).toBe('diamond');
  });

  it('names the canvas variable of a role', () => {
    expect(colourVariable('viz-blue')).toBe('--se-viz-blue');
  });
});
