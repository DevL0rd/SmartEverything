import { describe, expect, it } from 'vitest';
import { chatMemoryRow } from './memory-model';

describe('chat memory row', () => {
  it('lets the chat switch memory when the person has it on', () => {
    expect(chatMemoryRow(true, true)).toMatchObject({ value: true, disabled: false });
    expect(chatMemoryRow(false, true)).toMatchObject({ value: false, disabled: false });
  });

  it('shows memory off and locked with the reason when the person has it off', () => {
    const row = chatMemoryRow(true, false);
    expect(row).toMatchObject({ value: false, disabled: true });
    expect(row.subtitle).toContain('off for you');
  });

  it('stays locked while the person setting is loading', () => {
    expect(chatMemoryRow(true, null)).toMatchObject({ value: true, disabled: true });
  });
});
