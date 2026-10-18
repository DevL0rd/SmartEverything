import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const HERE = import.meta.dirname;
const PIN = z.object({ patches: z.array(z.string()) });

describe('go2rtc pin', () => {
  const pinned = PIN.parse(JSON.parse(readFileSync(join(HERE, 'pin.json'), 'utf8'))).patches;
  const onDisk = readdirSync(join(HERE, 'patches')).map((file) => `patches/${file}`);

  it('applies every patch file in the patches folder', () => {
    expect([...pinned].sort()).toEqual([...onDisk].sort());
  });

  it('keeps the internal producer patch last so it applies on the stream code the others leave', () => {
    expect(pinned).toContain('patches/internal-producer-lifetime.patch');
  });

  it('keeps play producers alive when a consumer leaves', () => {
    const patch = readFileSync(join(HERE, 'patches', 'internal-producer-lifetime.patch'), 'utf8');
    expect(patch).toContain('case stateInternal:');
    expect(patch).toContain('TestStopProducersKeepsInternalProducer');
  });
});
