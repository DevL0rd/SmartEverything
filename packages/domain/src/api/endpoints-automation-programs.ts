import { z } from 'zod';
import { AUTOMATION_REVISION_ROW, AUTOMATION_V3, LAYOUT, PROGRAM_V3 } from '../automation-v3';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, FLAG, ID, JSON_OBJECT, MOMENT, NOTHING } from './primitives';
import { AUTOMATION_AUTHOR, AUTOMATION_NAME } from './rows-media';

const REVISION = z.int().positive();

export const AUTOMATION_PROGRAM_PROBLEM = z.strictObject({
  severity: z.enum(['error', 'warning', 'hint']),
  code: z.string().min(1),
  nodeId: z.string().min(1).optional(),
  key: z.string().min(1).optional(),
  port: z.string().min(1).optional(),
  message: z.string().min(1),
  expected: z.string().min(1).optional(),
  received: z.string().min(1).optional(),
  fix: z.strictObject({ summary: z.string().min(1), action: JSON_OBJECT.optional() }).optional(),
});

export type AutomationProgramProblem = z.infer<typeof AUTOMATION_PROGRAM_PROBLEM>;

export const AUTOMATION_PROGRAM_REPLY = z.strictObject({
  ok: FLAG,
  summary: z.string().min(1),
  id: ID.nullable(),
  revision: REVISION.nullable(),
  problems: z.array(AUTOMATION_PROGRAM_PROBLEM),
});

export type AutomationProgramReply = z.infer<typeof AUTOMATION_PROGRAM_REPLY>;

export const AUTOMATION_PROGRAM_PATCH_REPLY = AUTOMATION_PROGRAM_REPLY.extend({
  created: z.array(z.strictObject({ key: z.string().min(1), id: ID })),
  detached: z.array(
    z.strictObject({
      owner: z.string().min(1),
      where: z.literal('port'),
      port: z.string().min(1).optional(),
      reads: z.string().min(1),
    }),
  ),
});

export type AutomationProgramPatchReply = z.infer<typeof AUTOMATION_PROGRAM_PATCH_REPLY>;

const PATCH_OPS = z
  .array(JSON_OBJECT)
  .min(1)
  .describe('Patch operations applied in order as one change; the hub validates each one');

export const AUTOMATION_PROGRAM_CHECK_REQUEST = z.union([
  z.strictObject({ definition: PROGRAM_V3 }),
  z.strictObject({ automationId: ID, ops: PATCH_OPS }),
]);

export type AutomationProgramCheckRequest = z.output<typeof AUTOMATION_PROGRAM_CHECK_REQUEST>;

export const AUTOMATION_PROGRAM_DRAFT_VIEW = z.strictObject({
  id: ID,
  name: AUTOMATION_NAME,
  revision: REVISION,
  drafted: FLAG,
  program: AUTOMATION_V3,
  layout: LAYOUT,
});

export const AUTOMATION_PROGRAM_VIEW = z.strictObject({
  id: ID,
  name: AUTOMATION_NAME,
  revision: REVISION,
  enabled: FLAG,
  program: AUTOMATION_V3,
});

export type AutomationProgramView = z.infer<typeof AUTOMATION_PROGRAM_VIEW>;

export const AUTOMATION_PROGRAM_OUTLINE = z.strictObject({
  id: ID,
  name: AUTOMATION_NAME,
  revision: REVISION,
  outline: z.string(),
});

export type AutomationProgramOutline = z.infer<typeof AUTOMATION_PROGRAM_OUTLINE>;

export const AUTOMATION_CATALOG_ENTRY = z.strictObject({
  kind: z.string().min(1),
  group: z.string().min(1),
  meaning: z.string().min(1),
  inputs: z.array(JSON_OBJECT),
  outputs: z.array(JSON_OBJECT),
  example: JSON_OBJECT.optional(),
});

export const AUTOMATION_CATALOG_REPLY = z.strictObject({
  nodes: z.array(AUTOMATION_CATALOG_ENTRY),
  functions: z.array(AUTOMATION_CATALOG_ENTRY),
});

export type AutomationCatalogReply = z.infer<typeof AUTOMATION_CATALOG_REPLY>;

export type AutomationProgramDraftView = z.infer<typeof AUTOMATION_PROGRAM_DRAFT_VIEW>;

export const AUTOMATION_PROGRAM_REVISION_SUMMARY = z.strictObject({
  revision: REVISION,
  saved_at: MOMENT,
  author: AUTOMATION_AUTHOR.nullable(),
  plan_hash: AUTOMATION_REVISION_ROW.shape.plan_hash,
});

export type AutomationProgramRevisionSummary = z.infer<typeof AUTOMATION_PROGRAM_REVISION_SUMMARY>;

export const AUTOMATION_PROGRAM_COMPARE_END = z.union([
  z.literal('draft'),
  z.coerce.number().int().min(1),
]);

export const AUTOMATION_PROGRAM_CHANGE = z.strictObject({
  id: z.string().min(1),
  key: z.string().min(1).nullable(),
  change: z.enum(['added', 'removed', 'changed']),
  summary: z.string().min(1),
});

export type AutomationProgramChange = z.infer<typeof AUTOMATION_PROGRAM_CHANGE>;

export const AUTOMATION_PROGRAM_COMPARISON = z.strictObject({
  from: REVISION,
  to: z.union([z.literal('draft'), REVISION]),
  changes: z.array(AUTOMATION_PROGRAM_CHANGE),
});

export type AutomationProgramComparison = z.infer<typeof AUTOMATION_PROGRAM_COMPARISON>;

const PROGRAM_PARAMS = z.strictObject({ automationId: ID });
const REVISION_PARAMS = z.strictObject({
  automationId: ID,
  revision: z.coerce.number().int().min(1),
});
const EXPECTED = z.strictObject({ expectedRevision: REVISION });

export const AUTOMATION_PROGRAM_ENDPOINTS = {
  createAutomationProgram: endpoint({
    method: 'POST',
    path: '/api/automation-programs',
    access: 'member',
    summary:
      'Add an automation from a program. Errors from the check refuse the save and come back as problems; a queue or parallel automation without max gets 10 and the storm budgets are switched on',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({
      name: AUTOMATION_NAME,
      enabled: FLAG.default(true),
      definition: AUTOMATION_V3,
      layout: LAYOUT.optional(),
    }),
    response: AUTOMATION_PROGRAM_REPLY,
  }),
  getAutomationProgram: endpoint({
    method: 'GET',
    path: '/api/automation-programs/:automationId',
    access: 'member',
    summary: 'One published program without its layout',
    params: PROGRAM_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: AUTOMATION_PROGRAM_VIEW,
  }),
  getAutomationProgramOutline: endpoint({
    method: 'GET',
    path: '/api/automation-programs/:automationId/outline',
    access: 'member',
    summary: 'One published program as one keyed line per node, indented by scope',
    params: PROGRAM_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: AUTOMATION_PROGRAM_OUTLINE,
  }),
  listAutomationCatalog: endpoint({
    method: 'GET',
    path: '/api/automation-catalog',
    access: 'member',
    summary:
      'Node kinds with ports, types, one-line meaning and example, and Custom Nodes; filter by query, group or kind',
    params: NOTHING,
    query: z.strictObject({
      query: z.string().min(1).optional(),
      group: z.string().min(1).optional(),
      kind: z.string().min(1).optional(),
    }),
    body: NO_BODY,
    response: AUTOMATION_CATALOG_REPLY,
  }),
  updateAutomationProgram: endpoint({
    method: 'PUT',
    path: '/api/automation-programs/:automationId',
    access: 'member',
    summary:
      'Replace the program as the next published revision; expectedRevision refuses the save when the automation moved since it was read',
    params: PROGRAM_PARAMS,
    query: NOTHING,
    body: z.strictObject({
      definition: AUTOMATION_V3,
      layout: LAYOUT.optional(),
      expectedRevision: REVISION,
    }),
    response: AUTOMATION_PROGRAM_REPLY,
  }),
  patchAutomationProgram: endpoint({
    method: 'POST',
    path: '/api/automation-programs/:automationId/patch',
    access: 'member',
    summary:
      'Apply patch operations in order as one change and publish the result as the next revision; a refused operation changes nothing',
    params: PROGRAM_PARAMS,
    query: NOTHING,
    body: z.strictObject({ expectedRevision: REVISION, ops: PATCH_OPS }),
    response: AUTOMATION_PROGRAM_PATCH_REPLY,
  }),
  setAutomationProgramEnabled: endpoint({
    method: 'PUT',
    path: '/api/automation-programs/:automationId/enabled',
    access: 'member',
    summary: 'Switch the automation on or off; the program and its revision stay as they are',
    params: PROGRAM_PARAMS,
    query: NOTHING,
    body: z.strictObject({ enabled: FLAG }),
    response: AUTOMATION_PROGRAM_REPLY,
  }),
  checkAutomationProgram: endpoint({
    method: 'POST',
    path: '/api/automation-programs/check',
    access: 'member',
    summary: 'Check a whole program or a patch preview of a stored automation; nothing is saved',
    params: NOTHING,
    query: NOTHING,
    body: AUTOMATION_PROGRAM_CHECK_REQUEST,
    response: AUTOMATION_PROGRAM_REPLY,
  }),
  removeAutomationProgram: endpoint({
    method: 'DELETE',
    path: '/api/automation-programs/:automationId',
    access: 'member',
    summary: 'Delete an automation that no other automation runs',
    params: PROGRAM_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  getAutomationProgramDraft: endpoint({
    method: 'GET',
    path: '/api/automation-programs/:automationId/draft',
    access: 'member',
    summary: 'The working copy: the saved draft when there is one, otherwise the published program',
    params: PROGRAM_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: AUTOMATION_PROGRAM_DRAFT_VIEW,
  }),
  saveAutomationProgramDraft: endpoint({
    method: 'PUT',
    path: '/api/automation-programs/:automationId/draft',
    access: 'member',
    summary: 'Save the working copy without publishing; the reply lists what the check finds in it',
    params: PROGRAM_PARAMS,
    query: NOTHING,
    body: z.strictObject({ program: AUTOMATION_V3, layout: LAYOUT, expectedRevision: REVISION }),
    response: AUTOMATION_PROGRAM_REPLY,
  }),
  discardAutomationProgramDraft: endpoint({
    method: 'DELETE',
    path: '/api/automation-programs/:automationId/draft',
    access: 'member',
    summary: 'Throw the saved draft away and go back to the published program',
    params: PROGRAM_PARAMS,
    query: z.strictObject({ expectedRevision: z.coerce.number().int().min(1) }),
    body: NO_BODY,
    response: AUTOMATION_PROGRAM_REPLY,
  }),
  publishAutomationProgram: endpoint({
    method: 'POST',
    path: '/api/automation-programs/:automationId/publish',
    access: 'member',
    summary:
      'Publish the draft as the next revision after the full check; errors block and come back as problems',
    params: PROGRAM_PARAMS,
    query: NOTHING,
    body: EXPECTED,
    response: AUTOMATION_PROGRAM_REPLY,
  }),
  listAutomationProgramRevisions: endpoint({
    method: 'GET',
    path: '/api/automation-programs/:automationId/revisions',
    access: 'member',
    summary: 'The published revisions, newest first, without their programs',
    params: PROGRAM_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(AUTOMATION_PROGRAM_REVISION_SUMMARY),
  }),
  getAutomationProgramRevision: endpoint({
    method: 'GET',
    path: '/api/automation-programs/:automationId/revisions/:revision',
    access: 'member',
    summary: 'One published revision with its program and layout',
    params: REVISION_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: AUTOMATION_REVISION_ROW,
  }),
  compareAutomationProgramRevisions: endpoint({
    method: 'GET',
    path: '/api/automation-programs/:automationId/compare',
    access: 'member',
    summary:
      'What differs between a published revision and a later revision or the draft, one row per step, trigger or header part',
    params: PROGRAM_PARAMS,
    query: z.strictObject({
      from: z.coerce.number().int().min(1),
      to: AUTOMATION_PROGRAM_COMPARE_END,
    }),
    body: NO_BODY,
    response: AUTOMATION_PROGRAM_COMPARISON,
  }),
} as const;
