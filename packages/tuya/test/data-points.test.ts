import { describe, expect, it } from 'vitest';
import { SPECIFICATION, TUYA_JSON_MAX_LENGTH, TUYA_TEXT_MAX_LENGTH, dataPointsOf } from '../src';

function item(code: string, dpId: number, type: string, values: string): object {
  return { code, dp_id: dpId, type, values };
}

describe('data point specifications', () => {
  it('uses the documented text limits', () => {
    expect(TUYA_TEXT_MAX_LENGTH).toBe(255);
    expect(TUYA_JSON_MAX_LENGTH).toBe(4096);
  });

  it('reads every Tuya data point type with its exact range', () => {
    const spec = SPECIFICATION.parse({
      functions: [
        item('switch_1', 1, 'Boolean', '{}'),
        item('temp_set', 2, 'Integer', '{"unit":"℃","min":50,"max":350,"scale":1,"step":5}'),
        item('mode', 3, 'Enum', '{"range":["auto","cool"]}'),
        item('label', 4, 'String', '{"maxlen":20}'),
        item('note', 5, 'String', '{}'),
        item('blob', 6, 'Raw', '{"maxlen":12}'),
        item('raw_default', 7, 'Raw', '{}'),
        item('colour_data_v2', 8, 'Json', '{"h":{"min":0}}'),
        item('level', 10, 'Integer', '{"min":0,"max":3,"step":1}'),
        item('fixed', 12, 'Integer', '{"min":5,"max":5,"step":1}'),
      ],
      status: [
        item('switch_1', 1, 'Boolean', '{}'),
        item('fault', 9, 'Bitmap', '{"label":["e1","e2"],"maxlen":2}'),
        item('fault_plain', 11, 'Bitmap', '{"maxlen":3}'),
      ],
    });
    expect(dataPointsOf(spec)).toStrictEqual({
      points: [
        {
          code: 'switch_1',
          dpId: 1,
          name: null,
          readable: true,
          writable: true,
          shape: { type: 'Boolean' },
        },
        {
          code: 'temp_set',
          dpId: 2,
          name: null,
          readable: false,
          writable: true,
          shape: { type: 'Integer', min: 50, max: 350, step: 5, scale: 1, unit: '℃' },
        },
        {
          code: 'mode',
          dpId: 3,
          name: null,
          readable: false,
          writable: true,
          shape: { type: 'Enum', range: ['auto', 'cool'] },
        },
        {
          code: 'label',
          dpId: 4,
          name: null,
          readable: false,
          writable: true,
          shape: { type: 'String', maxLength: 20 },
        },
        {
          code: 'note',
          dpId: 5,
          name: null,
          readable: false,
          writable: true,
          shape: { type: 'String', maxLength: 255 },
        },
        {
          code: 'blob',
          dpId: 6,
          name: null,
          readable: false,
          writable: true,
          shape: { type: 'Raw', maxLength: 12 },
        },
        {
          code: 'raw_default',
          dpId: 7,
          name: null,
          readable: false,
          writable: true,
          shape: { type: 'Raw', maxLength: 255 },
        },
        {
          code: 'colour_data_v2',
          dpId: 8,
          name: null,
          readable: false,
          writable: true,
          shape: { type: 'Json', definition: '{"h":{"min":0}}' },
        },
        {
          code: 'level',
          dpId: 10,
          name: null,
          readable: false,
          writable: true,
          shape: { type: 'Integer', min: 0, max: 3, step: 1, scale: 0, unit: null },
        },
        {
          code: 'fixed',
          dpId: 12,
          name: null,
          readable: false,
          writable: true,
          shape: { type: 'Integer', min: 5, max: 5, step: 1, scale: 0, unit: null },
        },
        {
          code: 'fault',
          dpId: 9,
          name: null,
          readable: true,
          writable: false,
          shape: { type: 'Bitmap', labels: ['e1', 'e2'], bits: 2 },
        },
        {
          code: 'fault_plain',
          dpId: 11,
          name: null,
          readable: true,
          writable: false,
          shape: { type: 'Bitmap', labels: [], bits: 3 },
        },
      ],
      rejected: [],
    });
  });

  it('keeps the name the cloud gives a data point', () => {
    const spec = SPECIFICATION.parse({
      status: [{ ...item('x', 1, 'Boolean', '{}'), name: 'Child lock' }],
    });
    expect(dataPointsOf(spec).points[0]?.name).toBe('Child lock');
  });

  it('rejects data points it cannot read and says why, keeping the rest', () => {
    const spec = SPECIFICATION.parse({
      functions: [
        item('a', 1, 'Integer', 'not json'),
        item('b', 2, 'Integer', '{"min":5,"max":1,"step":1}'),
        item('c', 3, 'Integer', '{"min":0,"max":1,"step":0}'),
        item('d', 4, 'Enum', '{"range":[]}'),
        item('e', 5, 'Float', '{}'),
        item('f', 6, 'Bitmap', '{"maxlen":40}'),
        item('g', 7, 'Integer', '{"min":0,"max":1,"step":1,"scale":10}'),
        item('h', 8, 'Boolean', '{}'),
      ],
    });
    const result = dataPointsOf(spec);
    expect(result.points.map((point) => point.code)).toStrictEqual(['h']);
    expect(result.rejected).toStrictEqual([
      {
        code: 'a',
        reason: `its values are not JSON (SyntaxError: Unexpected token 'o', "not json" is not valid JSON)`,
      },
      { code: 'b', reason: 'min exceeds max' },
      { code: 'c', reason: 'step: Too small: expected number to be >0' },
      { code: 'd', reason: 'range: Too small: expected array to have >=1 items' },
      { code: 'e', reason: 'its type "Float" is not a Tuya data point type' },
      { code: 'f', reason: 'maxlen: Too big: expected number to be <=32' },
      { code: 'g', reason: 'scale: Too big: expected number to be <=9' },
    ]);
  });
});
