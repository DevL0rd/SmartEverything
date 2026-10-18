import { describe, expect, it } from 'vitest';
import { discordAppPlugin } from '../discord';
import { CALL_TRANSCRIPTS } from '../discord/call-rows';
import { wizAppPlugin } from '.';
import { WIZ_DISCOVER, WIZ_LIGHTS } from './settings';

describe('plugin settings search focus ids', () => {
  it('match the ids of the rows that highlight', () => {
    expect(wizAppPlugin.settingsSearch?.map((item) => item.id)).toEqual([WIZ_DISCOVER, WIZ_LIGHTS]);
    expect(discordAppPlugin.settingsSearch?.map((item) => item.id)).toEqual([CALL_TRANSCRIPTS]);
  });
});
