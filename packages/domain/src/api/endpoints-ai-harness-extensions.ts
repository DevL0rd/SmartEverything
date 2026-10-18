import { z } from 'zod';
import {
  HARNESS_DISCOVERY_REQUEST,
  HARNESS_DISCOVERY_PAGE,
  HARNESS_SKILL_UPDATES,
  HARNESS_SKILL_UPDATES_WRITE,
  HARNESS_SKILL_UPDATE_RESULT,
} from '../ai-harness-discovery';
import {
  AI_HARNESS_EXTENSIONS,
  HARNESS_EXTENSION_INSTALL,
  HARNESS_EXTENSION_NAME,
  HARNESS_EXTENSION_ITEM,
  HARNESS_EXTENSION_PATCH,
  HARNESS_EXTENSION_RESOLUTION,
  HARNESS_EXTENSION_SOURCE_REQUEST,
  HARNESS_SKILL_FILES,
} from '../ai-harness-extensions';
import { endpoint, NO_BODY } from './endpoint';
import { DONE, NOTHING } from './primitives';

const EXTENSION = z.strictObject({ id: z.string().min(1) });
const SKILL = z.strictObject({ name: HARNESS_EXTENSION_NAME });

export const AI_HARNESS_EXTENSION_ENDPOINTS = {
  discoverAiHarnessExtensions: endpoint({
    method: 'POST',
    path: '/api/ai/harness/extensions/discover',
    access: 'owner',
    summary:
      'Search the skills or plugins of an online marketplace (a git URL, or the official ones) without installing anything',
    params: NOTHING,
    query: NOTHING,
    body: HARNESS_DISCOVERY_REQUEST,
    response: HARNESS_DISCOVERY_PAGE,
  }),
  readAiHarnessSkillUpdates: endpoint({
    method: 'GET',
    path: '/api/ai/harness/skills/updates',
    access: 'member',
    summary: 'Read whether installed skills and plugins update automatically',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: HARNESS_SKILL_UPDATES,
  }),
  replaceAiHarnessSkillUpdates: endpoint({
    method: 'PUT',
    path: '/api/ai/harness/skills/updates',
    access: 'owner',
    summary: 'Save whether installed skills and plugins update automatically',
    params: NOTHING,
    query: NOTHING,
    body: HARNESS_SKILL_UPDATES_WRITE,
    response: HARNESS_SKILL_UPDATES,
  }),
  updateAiHarnessSkills: endpoint({
    method: 'POST',
    path: '/api/ai/harness/skills/updates/run',
    access: 'owner',
    summary: 'Fetch the latest version of every installed git skill and plugin now',
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
      'List the built-in extensions, installed skills and plugins, and the skills included with SmartEverything',
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
      'Look inside a git URL, GitHub link or marketplace and list the skills and plugins it offers, without installing',
    params: NOTHING,
    query: NOTHING,
    body: HARNESS_EXTENSION_SOURCE_REQUEST,
    response: HARNESS_EXTENSION_RESOLUTION,
  }),
  installAiHarnessExtensions: endpoint({
    method: 'POST',
    path: '/api/ai/harness/extensions/install',
    access: 'owner',
    summary:
      'Install skills or plugins from a git URL, GitHub link or marketplace to the Home Hub store for every machine',
    params: NOTHING,
    query: NOTHING,
    body: HARNESS_EXTENSION_INSTALL,
    response: z.array(HARNESS_EXTENSION_ITEM),
  }),
  changeAiHarnessExtension: endpoint({
    method: 'PATCH',
    path: '/api/ai/harness/extensions/:id',
    access: 'owner',
    summary:
      'Switch one built-in extension, skill or plugin on or off, change its settings, or confirm a plugin that runs hooks or MCP servers',
    params: EXTENSION,
    query: NOTHING,
    body: HARNESS_EXTENSION_PATCH,
    response: HARNESS_EXTENSION_ITEM,
  }),
  removeAiHarnessExtension: endpoint({
    method: 'DELETE',
    path: '/api/ai/harness/extensions/:id',
    access: 'owner',
    summary: 'Remove an installed skill or plugin from the Home Hub store',
    params: EXTENSION,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  writeAiHarnessSkill: endpoint({
    method: 'PUT',
    path: '/api/ai/harness/skills/:name',
    access: 'owner',
    summary: 'Create or replace a skill written in the app from its SKILL.md and resource files',
    params: SKILL,
    query: NOTHING,
    body: HARNESS_SKILL_FILES,
    response: HARNESS_EXTENSION_ITEM,
  }),
} as const;
