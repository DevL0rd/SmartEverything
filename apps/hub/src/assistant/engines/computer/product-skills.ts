import { bundledHarnessSkills } from '@smarteverything/harness';
import type { HubToolResult } from '../../../ai-tools/hub-tool';
import { TOOL_DETAILS_INPUT } from '../../../ai-tools/tool-discovery';
import { META_TOOL_NAMES } from '../../../ai-tools/tool-sets';

const CATALOGUE = 'smarteverything-skills';
const skills = bundledHarnessSkills();
const descriptions = skills.map(({ id, description }) => ({ name: id, description }));
const skillsByName = new Map(skills.map((skill) => [skill.id, skill]));

export const PRODUCT_SKILL_GUIDE = `For SmartEverything workflows, discover bundled product skills with ${META_TOOL_NAMES.details} (name: "${CATALOGUE}"). Load the relevant skill with ${META_TOOL_NAMES.details} using its exact name. Apply its workflow within the available tools and native permissions.`;

export function readProductSkill(
  tool: string,
  input: Readonly<Record<string, unknown>>,
): HubToolResult | undefined {
  if (tool !== META_TOOL_NAMES.details) return undefined;
  const parsed = TOOL_DETAILS_INPUT.safeParse(input);
  if (!parsed.success || parsed.data.variant !== undefined || parsed.data.responses)
    return undefined;
  const { name } = parsed.data;
  if (name === CATALOGUE) return { response: { skills: descriptions }, line: '', pictures: [] };
  const skill = skillsByName.get(name);
  if (skill === undefined) return undefined;
  return {
    response: { skill: { name, description: skill.description, content: skill.content } },
    line: '',
    pictures: [],
  };
}
