import {
  HARNESS_DISCOVERY_REQUEST,
  HARNESS_DISCOVERY_PAGE,
  HARNESS_SKILL_UPDATES,
  HARNESS_SKILL_UPDATES_WRITE,
  HARNESS_SKILL_UPDATE_RESULT,
} from '../ai-harness-discovery';
import {
  AI_HARNESS_EXTENSIONS,
  HARNESS_EXTENSION_ITEM,
  HARNESS_SKILL_RESOLVE,
} from '../ai-harness-extensions';
import { endpoint, NO_BODY } from './endpoint';
import { NOTHING } from './primitives';

export const AI_HARNESS_EXTENSION_ENDPOINTS = {
  discoverAiHarnessExtensions: endpoint({
    method: 'POST',
    path: '/api/ai/harness/extensions/discover',
    access: 'member',
    summary:
      'Search bounded online skill or independent community extension metadata without installing code',
    params: NOTHING,
    query: NOTHING,
    body: HARNESS_DISCOVERY_REQUEST,
    response: HARNESS_DISCOVERY_PAGE,
  }),
  readAiHarnessSkillUpdates: endpoint({
    method: 'GET',
    path: '/api/ai/harness/skills/updates',
    access: 'member',
    summary: 'Read the shared automatic Anthropic skill update setting',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: HARNESS_SKILL_UPDATES,
  }),
  replaceAiHarnessSkillUpdates: endpoint({
    method: 'PUT',
    path: '/api/ai/harness/skills/updates',
    access: 'owner',
    summary: 'Save whether unchanged Apache Anthropic skills update automatically',
    params: NOTHING,
    query: NOTHING,
    body: HARNESS_SKILL_UPDATES_WRITE,
    response: HARNESS_SKILL_UPDATES,
  }),
  updateAiHarnessSkills: endpoint({
    method: 'POST',
    path: '/api/ai/harness/skills/updates/run',
    access: 'owner',
    summary:
      'Update Apache Anthropic skills centrally now, retaining unchanged upstream bytes and resources',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: HARNESS_SKILL_UPDATE_RESULT,
  }),
  readAiHarnessExtensions: endpoint({
    method: 'GET',
    path: '/api/ai/harness/extensions',
    access: 'member',
    summary:
      'Browse supported workspace extensions, included task instructions and shared immutable skills',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: AI_HARNESS_EXTENSIONS,
  }),
  resolveAiHarnessSkill: endpoint({
    method: 'POST',
    path: '/api/ai/harness/extensions/resolve',
    access: 'owner',
    summary:
      'Inspect and pin a public immutable GitHub skill or bounded JSON skill bundle without changing the selection',
    params: NOTHING,
    query: NOTHING,
    body: HARNESS_SKILL_RESOLVE,
    response: HARNESS_EXTENSION_ITEM,
  }),
} as const;
