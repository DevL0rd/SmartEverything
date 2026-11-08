import { PLUGIN_MANIFEST } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { routerPlugin } from '../../../src/plugins/builtin/router';
import {
  PERSON_ARRIVED_EVENT,
  PERSON_FIELDS,
  PERSON_LEFT_EVENT,
} from '../../../src/plugins/builtin/router/people-events';

describe('the router person events', () => {
  it('live in the router plugin and keep their names', () => {
    expect([PERSON_ARRIVED_EVENT, PERSON_LEFT_EVENT]).toEqual(['person_arrived', 'person_left']);
  });

  it('are declared by the router manifest with the person fields', () => {
    const manifest = PLUGIN_MANIFEST.parse(routerPlugin.manifest);
    const declared = manifest.contributes.events.filter((event) =>
      [PERSON_ARRIVED_EVENT, PERSON_LEFT_EVENT].includes(event.kind),
    );
    expect(declared.map((event) => event.kind)).toEqual([PERSON_ARRIVED_EVENT, PERSON_LEFT_EVENT]);
    expect(
      declared.every(
        (event) => Object.keys(event.fields).join() === Object.keys(PERSON_FIELDS).join(),
      ),
    ).toBe(true);
  });
});
