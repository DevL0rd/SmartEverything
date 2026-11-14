import {
  COMPUTER_AI_SETTINGS,
  DEFAULT_COMPUTER_AI_SETTINGS,
  type ComputerAiSettings,
} from '@smarteverything/domain';
import { expect, it } from 'vitest';

import { linkWanted } from '../../src/claude/link-policy';

function settings(enabled: boolean, autoLink: boolean): ComputerAiSettings {
  return COMPUTER_AI_SETTINGS.parse({
    ...DEFAULT_COMPUTER_AI_SETTINGS,
    control: { enabled, auto_link: autoLink, mcp_areas: null },
  });
}

it('keeps the link reconciled on every applied setting while control and auto link are on', () => {
  expect(linkWanted(settings(true, true))).toBe(true);
});

it('leaves the link alone when control or auto link is off', () => {
  expect(linkWanted(settings(true, false))).toBe(false);
  expect(linkWanted(settings(false, true))).toBe(false);
  expect(linkWanted(settings(false, false))).toBe(false);
});
