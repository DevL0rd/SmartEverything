import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { PureRequest } from '../../../src/interpret/frames';
import { readPorts } from '../../../src/nodes/pure/support';
import { PLUGIN_LOOKUP, PLUGIN_VALUE } from '../../graph/plugin-lookup';

const request = (kind: string): PureRequest => ({
  kind,
  node: { id: '00000000-0000-4000-8000-000000000001', key: 'n' },
  ports: { names: [], get: () => undefined },
});

describe('declared defaults through a kind lookup', () => {
  it('reads the default a plugin kind declares', () => {
    expect(readPorts(request(PLUGIN_VALUE), PLUGIN_LOOKUP).number('level')).toBe(7);
  });

  it('knows no default for a plugin kind under the static lookup', () => {
    expect(readPorts(request(PLUGIN_VALUE), STATIC_KIND_LOOKUP).given('level')).toBe(false);
  });

  it('still reads the defaults of core kinds', () => {
    expect(readPorts(request('logic.not'), PLUGIN_LOOKUP).given('value')).toBe(
      readPorts(request('logic.not'), STATIC_KIND_LOOKUP).given('value'),
    );
  });
});
