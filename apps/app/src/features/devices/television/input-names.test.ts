import type { TvInput } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { inputRenameRequest, withInputName } from './input-names';

const CONSOLE: TvInput = { id: 'HDMI1', label: 'Console', name: 'Console' };
const SPARE: TvInput = { id: 'HDMI2', label: 'HDMI 2', name: null };
const INPUTS: readonly TvInput[] = [
  CONSOLE,
  SPARE,
  { id: 'dtv', label: 'Antenna', name: 'Antenna' },
];

describe('television input names', () => {
  it('adds a name and keeps the names already given', () => {
    expect(withInputName(INPUTS, 'HDMI2', 'Laptop')).toEqual({
      HDMI1: 'Console',
      HDMI2: 'Laptop',
      dtv: 'Antenna',
    });
  });

  it('replaces the name of the input being renamed', () => {
    expect(withInputName(INPUTS, 'HDMI1', 'PlayStation')).toEqual({
      HDMI1: 'PlayStation',
      dtv: 'Antenna',
    });
  });

  it('removes the name when it is cleared so the input shows its default', () => {
    expect(withInputName(INPUTS, 'HDMI1', '')).toEqual({ dtv: 'Antenna' });
  });

  it('leaves an unnamed input unnamed when cleared', () => {
    expect(withInputName(INPUTS, 'HDMI2', '')).toEqual({ HDMI1: 'Console', dtv: 'Antenna' });
  });
});

describe('renaming a television input', () => {
  it('starts from the given name, offers the default as the hint and allows clearing', () => {
    const named = inputRenameRequest(CONSOLE, vi.fn());
    expect(named).toMatchObject({ initial: 'Console', placeholder: 'HDMI 1', allowEmpty: true });
    const unnamed = inputRenameRequest(SPARE, vi.fn());
    expect(unnamed.initial).toBe('');
  });

  it('saves the typed name for that input', async () => {
    const rename = vi.fn().mockResolvedValue(undefined);
    await inputRenameRequest(SPARE, rename).save('Laptop');
    expect(rename).toHaveBeenCalledWith('HDMI2', 'Laptop');
  });
});
