import { describe, expect, it } from 'vitest';
import { sendClearing } from './composer-state';

function effects(): { readonly log: string[]; readonly value: Parameters<typeof sendClearing>[1] } {
  const log: string[] = [];
  return {
    log,
    value: {
      clear: () => log.push('clear'),
      restore: () => log.push('restore'),
      sent: () => log.push('sent'),
    },
  };
}

describe('sendClearing', () => {
  it('clears the input before the delivery settles', async () => {
    const seen = effects();
    let finish: (delivered: boolean) => void = () => undefined;
    const done = sendClearing(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
      seen.value,
    );
    expect(seen.log).toEqual(['clear']);
    finish(true);
    await done;
    expect(seen.log).toEqual(['clear', 'sent']);
  });

  it('puts the text back when the delivery fails', async () => {
    const seen = effects();
    await sendClearing(() => Promise.resolve(false), seen.value);
    expect(seen.log).toEqual(['clear', 'restore']);
  });
});
