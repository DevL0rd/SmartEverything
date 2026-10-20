import { z } from 'zod';
import { FUNCTION_V3, IDENT, INPUT_PORT, LAYOUT, OUTPUT_PORT, PORT_VALUE } from '../automation-v3';
import { AUTOMATION_PROGRAM_PROBLEM } from './endpoints-automation-programs';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, FLAG, ID, MOMENT, NOTHING } from './primitives';
import { AUTOMATION_NAME } from './rows-media';

const REVISION = z.int().positive();
const TEXT = z.string().min(1);

export const AUTOMATION_FUNCTION_INTERFACE = z.strictObject({
  flavour: z.enum(['pure', 'action']),
  inputs: z.array(INPUT_PORT),
  outputs: z.array(OUTPUT_PORT),
  exits: z.array(IDENT).min(1),
});

export type AutomationFunctionInterface = z.infer<typeof AUTOMATION_FUNCTION_INTERFACE>;

export const AUTOMATION_FUNCTION_SUMMARY = z.strictObject({
  id: TEXT,
  name: AUTOMATION_NAME,
  description: z.string().nullable(),
  category: z.string().nullable(),
  icon: z.string().nullable(),
  builtin: FLAG,
  editable: FLAG,
  revision: REVISION,
  interface: AUTOMATION_FUNCTION_INTERFACE,
  interfaceHash: TEXT,
  users: z.int().min(0),
  createdBy: ID.nullable(),
  updatedAt: MOMENT.nullable(),
});

export type AutomationFunctionSummary = z.infer<typeof AUTOMATION_FUNCTION_SUMMARY>;

export const AUTOMATION_FUNCTION_USER = z.strictObject({
  kind: z.enum(['automation', 'function']),
  id: ID,
  name: z.string(),
});

export type AutomationFunctionUser = z.infer<typeof AUTOMATION_FUNCTION_USER>;

export const AUTOMATION_FUNCTION_DETAIL = AUTOMATION_FUNCTION_SUMMARY.extend({
  program: FUNCTION_V3,
  layout: LAYOUT,
  usedBy: z.array(AUTOMATION_FUNCTION_USER),
});

export type AutomationFunctionDetail = z.infer<typeof AUTOMATION_FUNCTION_DETAIL>;

export const AUTOMATION_FUNCTION_CHANGE = z.strictObject({
  part: z.enum(['input', 'output', 'exit', 'flavour']),
  name: z.string(),
  code: TEXT,
  compat: z.enum(['compatible', 'breaking']),
  reason: TEXT,
});

export type AutomationFunctionChange = z.infer<typeof AUTOMATION_FUNCTION_CHANGE>;

export const AUTOMATION_FUNCTION_REPLY = z.strictObject({
  ok: FLAG,
  summary: TEXT,
  id: TEXT.nullable(),
  revision: REVISION.nullable(),
  compat: z.enum(['compatible', 'breaking']).nullable(),
  changes: z.array(AUTOMATION_FUNCTION_CHANGE),
  affected: z.array(AUTOMATION_FUNCTION_USER),
  problems: z.array(AUTOMATION_PROGRAM_PROBLEM),
});

export type AutomationFunctionReply = z.infer<typeof AUTOMATION_FUNCTION_REPLY>;

export const AUTOMATION_FUNCTION_MAPPING = z.strictObject({
  inputs: z.record(z.string(), z.string()).optional(),
  outputs: z.record(z.string(), z.string()).optional(),
  inputValues: z.record(z.string(), PORT_VALUE).optional(),
  exits: z.record(z.string(), z.string()).optional(),
});

export type AutomationFunctionMapping = z.infer<typeof AUTOMATION_FUNCTION_MAPPING>;

export const AUTOMATION_FUNCTION_CALLERS_REPLY = z.strictObject({
  ok: FLAG,
  summary: TEXT,
  updated: z.array(
    AUTOMATION_FUNCTION_USER.extend({ revision: REVISION, calls: z.array(z.string()) }),
  ),
  problems: z.array(AUTOMATION_PROGRAM_PROBLEM),
});

export type AutomationFunctionCallersReply = z.infer<typeof AUTOMATION_FUNCTION_CALLERS_REPLY>;

const PORT_EDIT = z.strictObject({
  name: IDENT,
  label: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

const EXPOSED_PORT = z.strictObject({ key: z.string().min(1), port: IDENT });

export const AUTOMATION_FUNCTION_EXTRACT_REQUEST = z.strictObject({
  automationId: ID,
  expectedRevision: REVISION,
  keys: z.array(z.string().min(1)).min(1),
  name: AUTOMATION_NAME,
  inputs: z.array(PORT_EDIT).optional(),
  outputs: z.array(PORT_EDIT).optional(),
  expose: z.array(EXPOSED_PORT).optional(),
});

export type AutomationFunctionExtractRequest = z.infer<typeof AUTOMATION_FUNCTION_EXTRACT_REQUEST>;

export const AUTOMATION_FUNCTION_EXTRACT_REPLY = AUTOMATION_FUNCTION_REPLY.extend({
  automationId: ID,
  callerRevision: REVISION.nullable(),
  instanceKey: z.string().nullable(),
  suggestion: z.array(z.string()),
});

export type AutomationFunctionExtractReply = z.infer<typeof AUTOMATION_FUNCTION_EXTRACT_REPLY>;

const FUNCTION_PARAMS = z.strictObject({ functionId: TEXT });

export const AUTOMATION_FUNCTION_ENDPOINTS = {
  listAutomationFunctions: endpoint({
    method: 'GET',
    path: '/api/automation-functions',
    access: 'member',
    summary:
      'Every Custom Node with its interface and how many automations and Custom Nodes use it, built-ins included; built-ins are read only',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(AUTOMATION_FUNCTION_SUMMARY),
  }),
  getAutomationFunction: endpoint({
    method: 'GET',
    path: '/api/automation-functions/:functionId',
    access: 'member',
    summary: 'One Custom Node with its body, layout and the places that use it',
    params: FUNCTION_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: AUTOMATION_FUNCTION_DETAIL,
  }),
  createAutomationFunction: endpoint({
    method: 'POST',
    path: '/api/automation-functions',
    access: 'member',
    summary: 'Add a Custom Node as revision 1; errors from the check refuse the save',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({
      name: AUTOMATION_NAME,
      definition: FUNCTION_V3,
      layout: LAYOUT.optional(),
    }),
    response: AUTOMATION_FUNCTION_REPLY,
  }),
  saveAutomationFunction: endpoint({
    method: 'PUT',
    path: '/api/automation-functions/:functionId',
    access: 'member',
    summary:
      'Save the next revision of a Custom Node you created (an owner may save any). The reply classifies the change against the previous revision; a breaking change is refused with the affected automations and Custom Nodes until confirmBreaking is true, and callers keep following the last compatible revision',
    params: FUNCTION_PARAMS,
    query: NOTHING,
    body: z.strictObject({
      definition: FUNCTION_V3,
      layout: LAYOUT.optional(),
      name: AUTOMATION_NAME.optional(),
      expectedRevision: REVISION,
      confirmBreaking: FLAG.default(false),
    }),
    response: AUTOMATION_FUNCTION_REPLY,
  }),
  updateAutomationFunctionCallers: endpoint({
    method: 'POST',
    path: '/api/automation-functions/:functionId/update-callers',
    access: 'member',
    summary:
      'Move every caller that follows this Custom Node onto its latest revision with a mapping for renamed inputs, outputs and exits, new input values and routed exits; each caller is saved as a new revision in one change, or nothing is saved',
    params: FUNCTION_PARAMS,
    query: NOTHING,
    body: z.strictObject({ mapping: AUTOMATION_FUNCTION_MAPPING }),
    response: AUTOMATION_FUNCTION_CALLERS_REPLY,
  }),
  extractAutomationFunction: endpoint({
    method: 'POST',
    path: '/api/automation-functions/extract',
    access: 'member',
    summary:
      'Turn selected steps of an automation into a new Custom Node (revision 1) and replace them with one call (next automation revision), both in one change',
    params: NOTHING,
    query: NOTHING,
    body: AUTOMATION_FUNCTION_EXTRACT_REQUEST,
    response: AUTOMATION_FUNCTION_EXTRACT_REPLY,
  }),
  removeAutomationFunction: endpoint({
    method: 'DELETE',
    path: '/api/automation-functions/:functionId',
    access: 'member',
    summary:
      'Delete a Custom Node you created (an owner may delete any); refused while an automation or Custom Node uses it, and built-ins cannot be deleted',
    params: FUNCTION_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;
