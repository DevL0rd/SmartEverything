import { createHash } from 'node:crypto';
import { AI_NATIVE_COMMAND_DESCRIPTOR, AI_NATIVE_SKILL_METADATA } from '@smarteverything/domain';
import type { z } from 'zod';
import type { SKILL_METADATA } from './skills-protocol';

export function codexSkillDescriptor(
  skill: z.infer<typeof SKILL_METADATA>,
  invocation = false,
): z.infer<typeof AI_NATIVE_COMMAND_DESCRIPTOR> {
  const identity = JSON.stringify([skill.scope, skill.pluginId, skill.name, skill.path]);
  return AI_NATIVE_COMMAND_DESCRIPTOR.parse({
    definition_id: `codex:skill:${createHash('sha256').update(identity).digest('hex')}`,
    name: skill.name,
    description:
      skill.description.length === 0
        ? 'Native Codex skill (no description provided).'
        : skill.description,
    aliases: [],
    builtin: false,
    source: 'skill',
    native_name: skill.name,
    path: skill.path,
    enabled: invocation && skill.enabled,
    argument_hint: null,
    arguments: invocation,
    attachments: invocation,
    unavailable_reason: unavailableReason(skill.enabled, invocation),
    native_skill: AI_NATIVE_SKILL_METADATA.parse(skill),
  });
}

function unavailableReason(enabled: boolean, invocation: boolean): string | null {
  if (!enabled) return 'This native Codex skill is disabled.';
  if (!invocation) return 'Native Codex skill invocation is not implemented on this host.';
  return null;
}
