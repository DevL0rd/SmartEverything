import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { childModelRoutes } from '../../../src/harness/child-routes';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

describe('the helper models the AI may pick', () => {
  it('lists the ~ latest aliases the prompt names before the dated model names', () => {
    const { profileId } = rig.owner;
    const published = rig.service.routes
      .list(profileId)
      .find((route) => route.id === rig.route.route_id);
    if (published?.state !== 'ready') throw new Error('The test route is not ready.');
    const [model] = published.models;
    if (model === undefined) throw new Error('The test route has no model.');
    const id = randomUUID();
    rig.service.routes.publish({
      ...published,
      id,
      models: [
        { ...model, id: 'moonshotai/kimi-k3.1-pro' },
        { ...model, id: '~moonshotai/kimi-latest' },
        { ...model, id: 'deepseek/deepseek-v4.1-flash-1017' },
        { ...model, id: '~deepseek/deepseek-flash-latest' },
      ],
    });

    const offered = childModelRoutes(rig.service, profileId)
      .filter((route) => route.provider === id)
      .map((route) => route.model);

    expect(offered).toStrictEqual([
      '~moonshotai/kimi-latest',
      '~deepseek/deepseek-flash-latest',
      'moonshotai/kimi-k3.1-pro',
      'deepseek/deepseek-v4.1-flash-1017',
    ]);
  });
});
