import { describe, expect, it, vi } from 'vitest';
import { Context, Service } from '@deepseek-ai/cordis';

declare module '@deepseek-ai/cordis' {
  interface Events {
    'contract/custom': (value: unknown) => void;
  }
}

class Greeter extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter');
  }

  hello(): string {
    return 'hi';
  }
}

describe('@deepseek-ai/cordis contract', () => {
  it('provides a service plugin to the context that loaded it', async () => {
    const ctx = new Context();
    ctx.plugin(Greeter);

    await vi.waitFor(() => {
      expect(ctx.get('greeter')).toBeInstanceOf(Greeter);
    });
  });

  it('delivers an emitted event to every listener of the context', async () => {
    const ctx = new Context();
    const seen: unknown[] = [];
    ctx.on('contract/custom', (value: unknown) => {
      seen.push(value);
    });

    ctx.emit('contract/custom', 1);
    await ctx.parallel('contract/custom', 2);

    expect(seen).toStrictEqual([1, 2]);
  });
});
