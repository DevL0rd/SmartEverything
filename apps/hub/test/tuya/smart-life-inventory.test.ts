import { Logger } from '@smarteverything/logging';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { LoadOnce } from '../../src/adapters/tuya/bounded';
import {
  loadSmartLifeInventory,
  type DescribedDevice,
} from '../../src/adapters/tuya/smart-life-inventory';

function device(id: string): Record<string, unknown> {
  return { id, name: id, category: 'dj', product_id: 'p1', sub: false, online: true };
}

class StubCloud {
  readonly calls: string[] = [];

  constructor(private readonly ids: () => readonly string[]) {}

  call<S extends z.ZodType>(
    _operation: string,
    { path }: { readonly path: string },
    result: S,
  ): Promise<z.output<S>> {
    this.calls.push(path);
    let body: unknown = {};
    if (path.endsWith('/homes')) {
      body = [{ ownerId: 'o1', name: 'Home' }];
    } else if (path.endsWith('/home/devices')) {
      body = this.ids().map(device);
    } else if (path.endsWith('/room')) {
      body = { id: 'r1', name: 'Kitchen' };
    } else if (path.endsWith('/status')) {
      body = { dpStatusRelationDTOS: [] };
    } else if (path.endsWith('/custom-type')) {
      body = false;
    }
    return Promise.resolve(result.parse(body));
  }
}

describe('Smart Life inventory', () => {
  it('reads the description of a device once across inventory loads', async () => {
    let ids = ['a', 'b'];
    const cloud = new StubCloud(() => ids);
    const descriptions = new LoadOnce<DescribedDevice>();
    const log = new Logger('tool.tuya-test');
    const descriptionCalls = (): number =>
      cloud.calls.filter((path) => path.endsWith('/specifications')).length;
    await loadSmartLifeInventory(cloud, log, descriptions);
    expect(descriptionCalls()).toBe(2);
    await loadSmartLifeInventory(cloud, log, descriptions);
    expect(descriptionCalls()).toBe(2);
    ids = ['a', 'b', 'c'];
    const grown = await loadSmartLifeInventory(cloud, log, descriptions);
    expect(descriptionCalls()).toBe(3);
    expect(grown.inventory.devices.map((entry) => entry.cloud.id)).toEqual(['a', 'b', 'c']);
  });
});
