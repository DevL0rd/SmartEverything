import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readProductSkill } from '../../src/assistant/engines/computer/product-skills';
import { stablePrompt } from '../../src/assistant/conversation/prompt';

const SKILL_SUMMARY = z.strictObject({ name: z.string(), description: z.string().min(1) });
const SKILL_CATALOGUE = z.strictObject({ skills: z.array(SKILL_SUMMARY) });
const SKILL_BODY = z.strictObject({ skill: SKILL_SUMMARY.extend({ content: z.string().min(1) }) });

describe('SmartEverything context in native chats', () => {
  it.each(['claude', 'codex'] as const)(
    'keeps the home personality and native approvals for %s',
    (runtime) => {
      const prompt = stablePrompt(
        {
          name: 'Nori',
          aliases: ['Noor'],
          homeName: 'House',
          instructions: 'Use Celsius.',
          toolIndex: '',
          catalogue: '',
          executionHost: 'the selected computer',
        },
        runtime,
      );
      expect(prompt).toContain('Nori (also called Noor)');
      expect(prompt).toContain('Your personality');
      expect(prompt).toContain('Use Celsius.');
      expect(prompt).toContain('native tool permissions and approval prompts');
      expect(prompt).not.toContain('never ask for permission or confirmation');
      if (runtime === 'claude') expect(prompt).toContain('next tool call');
      else expect(prompt).not.toContain('next tool call');
    },
  );

  it('returns skill descriptions first and loads only the selected skill on request', () => {
    const catalogue = readProductSkill('tool_read', { name: 'smarteverything-skills' });
    const skill = readProductSkill('tool_read', { name: 'smarteverything-home' });
    const { skill: loaded } = SKILL_BODY.parse(skill?.response);
    const { skills } = SKILL_CATALOGUE.parse(catalogue?.response);
    expect(loaded.name).toBe('smarteverything-home');
    expect(skills).toContainEqual({
      name: loaded.name,
      description: loaded.description,
    });
    expect(JSON.stringify(catalogue)).not.toContain('"content"');
  });

  it('leaves ordinary tool discovery and invalid skill reads to the standard tool path', () => {
    expect(readProductSkill('tool_read', { name: 'device_read' })).toBeUndefined();
    expect(readProductSkill('tool_read', { name: 'smarteverything-missing' })).toBeUndefined();
    expect(
      readProductSkill('tool_read', { name: 'smarteverything-home', typo: true }),
    ).toBeUndefined();
    expect(readProductSkill('tool_call', { name: 'smarteverything-home' })).toBeUndefined();
  });
});
