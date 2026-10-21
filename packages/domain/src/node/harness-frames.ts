import { AI_NATIVE_REFERENCE_ACTION, AI_NATIVE_REFERENCE_RESULT } from '../ai-reference-runtime';
import { AI_MESSAGE_REFERENCES } from '../ai-references';
import {
  SUBSCRIPTION_INFERENCE_REQUEST,
  SUBSCRIPTION_INFERENCE_RESULT,
} from '../ai-subscription-inference';
import {
  AI_HARNESS_COMMAND_DESCRIPTORS,
  AI_HARNESS_COMMAND_OUTCOME,
  AI_HARNESS_COMMAND_WRITE,
} from '../ai-harness-commands';
import {
  AI_HARNESS_CONFIGURATION_REPORT,
  HARNESS_DESIRED_CONFIGURATION,
} from '../ai-harness-configuration';
import { JSON_VALUE } from '../values';
import { HARNESS_PLATFORM, HARNESS_SANDBOX_ENFORCEMENT } from '../harness-platform';
import {
  AI_SUBSCRIPTION_HOST_STATUS,
  HARNESS_SUBSCRIPTION_REQUEST,
  HARNESS_SUBSCRIPTION_USE,
} from '../ai-subscription-host';
import { ASSISTANT_ATTACHMENT_BYTES_MAX, ASSISTANT_MESSAGE_ROW } from '../assistant';
import { z } from 'zod';
import { API_ERROR } from '../api/errors';
import {
  AI_HARNESS_MANIFEST,
  AI_HARNESS_FAILURE,
  AI_HARNESS_PERMISSION_WRITE,
  AI_HARNESS_WORKSPACE_CHOICE,
  AI_HARNESS_STORAGE_BINDING,
} from '../ai-harness';
import { AI_HARNESS_ANSWER, AI_HARNESS_INTERACTION } from '../ai-harness-session';
import { HARNESS_NATIVE_FRAME } from '../harness-native-frame';
import { AI_MODEL_ROUTE, AI_MODEL_ROUTE_SELECTION_WRITE } from '../ai-model-route';
import {
  DSH_SESSION_ID,
  DSH_WRITER_CLAIM_WRITE,
  DSH_SESSION_APPEND,
  DSH_SESSION_FLUSH,
  DSH_SESSION_READ,
} from '../dsh-sessions';

export const HARNESS_CONFIGURATION_CAPABILITY = 'harness-configuration-v1';
const CONFIGURATION_CAPABILITIES = z.array(z.string().min(1).max(200)).max(20);
export const NODE_HARNESS_PROTOCOL = 'smarteverything-node-harness.v1';
export const NODE_HARNESS_PATH = '/api/nodes/harness';
export const NODE_HARNESS_CONNECT = z.strictObject({
  type: z.literal('harness_connect'),
  protocol: z.literal(1),
  device_id: z.uuid(),
  runtime_instance: z.uuid(),
  machine_id: z.string().min(1).max(200),
  capabilities: CONFIGURATION_CAPABILITIES.optional(),
});
const BOUND = {
  device_id: z.uuid(),
  generation: z.uuid(),
  runtime_instance: z.uuid(),
};
const SESSION = { session_id: DSH_SESSION_ID, expected_epoch: z.int().positive() };
export const HARNESS_HOST_DESCRIPTION = z.object({
  name: z.string().min(1).max(200),
  platform: HARNESS_PLATFORM,
  sandbox: HARNESS_SANDBOX_ENFORCEMENT.optional(),
  home_directory: z.string().min(1).max(4096),
});
export const HARNESS_RUNTIME_REQUEST = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('open'),
    chat_id: z.uuid(),
    claim: DSH_WRITER_CLAIM_WRITE,
    route: AI_MODEL_ROUTE_SELECTION_WRITE,
    permission: AI_HARNESS_PERMISSION_WRITE,
    cwd: z.string().min(1).max(4096),
    storage_binding: AI_HARNESS_STORAGE_BINDING.optional(),
    mode: z.enum(['create', 'resume']),
    history_import: z.array(ASSISTANT_MESSAGE_ROW).optional(),
    interactions: z.array(AI_HARNESS_INTERACTION).optional(),
    plugin_agent_policy: z
      .strictObject({
        persona: z.string().min(1).max(100_000),
        tools: z.array(z.string().min(1).max(200)).max(2000).optional(),
      })
      .optional(),
  }),
  z.strictObject({
    ...SESSION,
    kind: z.literal('prompt'),
    references: AI_MESSAGE_REFERENCES.optional(),
    delivery_id: z.uuid(),
    text: z.string().max(200_000),
    attachments: z.array(z.uuid()).max(20),
  }),
  z.strictObject({ ...SESSION, kind: z.literal('steer'), text: z.string().max(200_000) }),
  z.strictObject({ ...SESSION, kind: z.literal('note'), text: z.string().max(200_000) }),
  z.strictObject({
    ...SESSION,
    kind: z.literal('auxiliary'),
    messages: z
      .array(
        z.strictObject({
          role: z.enum(['system', 'user', 'assistant']),
          text: z.string().max(200_000),
        }),
      )
      .min(1)
      .max(100),
    max_tokens: z.int().positive().max(32_768),
  }),
  z.strictObject({ ...SESSION, kind: z.literal('reference'), input: AI_NATIVE_REFERENCE_ACTION }),
  z.strictObject({ ...SESSION, kind: z.literal('interrupt') }),
  z.strictObject({ ...SESSION, kind: z.literal('compact') }),
  z.strictObject({ ...SESSION, kind: z.literal('command_list') }),
  z.strictObject({
    ...SESSION,
    kind: z.literal('command'),
    line: AI_HARNESS_COMMAND_WRITE.shape.line,
    attachments: AI_HARNESS_COMMAND_WRITE.shape.attachments,
  }),
  z.strictObject({ ...SESSION, kind: z.literal('answer'), answer: AI_HARNESS_ANSWER }),
  z.strictObject({ ...SESSION, kind: z.literal('close') }),
  z.strictObject({ ...SESSION, kind: z.literal('workspace'), choice: AI_HARNESS_WORKSPACE_CHOICE }),
  z.strictObject({
    ...SESSION,
    kind: z.literal('permission'),
    operation_id: z.uuid(),
    permission: AI_HARNESS_PERMISSION_WRITE,
  }),
]);
export type HarnessRuntimeRequest = z.infer<typeof HARNESS_RUNTIME_REQUEST>;

export const HARNESS_RUNTIME_RECEIPT = z.object({
  references: AI_NATIVE_REFERENCE_RESULT.optional(),
  commands: AI_HARNESS_COMMAND_DESCRIPTORS.optional(),
  command_outcome: AI_HARNESS_COMMAND_OUTCOME.optional(),
  compacted: z.boolean().optional(),
  interactions: z.array(AI_HARNESS_INTERACTION).optional(),
  operation_id: z.uuid(),
  session_id: DSH_SESSION_ID,
  epoch: z.int().positive(),
  state: z.enum(['accepted', 'ready', 'closed', 'completed']),
  durable_seq: z.int().min(-1),
  text: z.string().max(200_000).optional(),
});
export type HarnessRuntimeReceipt = z.infer<typeof HARNESS_RUNTIME_RECEIPT>;

export const HARNESS_ATTACHMENT_TRANSFER = z.object({
  name: z.string().min(1).max(200),
  mime: z.string().min(1).max(200),
  bytes: z.int().positive().max(ASSISTANT_ATTACHMENT_BYTES_MAX),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  transcript: z.string().max(200_000).nullable(),
});
export const HARNESS_NATIVE_MEDIA_NOTE_INPUT = z.strictObject({
  seq: z.int().nonnegative(),
  image_index: z.int().nonnegative(),
  attachment_id: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  data: z.base64().max(Math.ceil(ASSISTANT_ATTACHMENT_BYTES_MAX / 3) * 4),
});
export const HARNESS_NATIVE_MEDIA_NOTE = z.object({ text: z.string().min(1) });
const HARNESS_NATIVE_PUBLICATION = z.strictObject({
  ...BOUND,
  type: z.literal('harness_native'),
  frame: HARNESS_NATIVE_FRAME,
});
const HARNESS_SUBSCRIPTION_STATUS_FRAME = z.strictObject({
  ...BOUND,
  type: z.literal('harness_subscription_status'),
  id: z.uuid().optional(),
  status: AI_SUBSCRIPTION_HOST_STATUS,
});
export const HARNESS_PUBLICATION = z.discriminatedUnion('type', [
  HARNESS_NATIVE_PUBLICATION,
  HARNESS_SUBSCRIPTION_STATUS_FRAME,
]);
export const HARNESS_CALL_REQUEST = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('stat'), session_id: DSH_SESSION_ID }),
  z.strictObject({ operation: z.literal('read'), input: DSH_SESSION_READ }),
  z.strictObject({ operation: z.literal('append'), input: DSH_SESSION_APPEND }),
  z.strictObject({ operation: z.literal('flush'), input: DSH_SESSION_FLUSH }),
  z.strictObject({
    operation: z.literal('verify'),
    claim: DSH_WRITER_CLAIM_WRITE,
    subscription: HARNESS_SUBSCRIPTION_USE.optional(),
  }),
  z.strictObject({ operation: z.literal('publish'), frame: HARNESS_PUBLICATION }),
  z.strictObject({
    operation: z.literal('attachment'),
    claim: DSH_WRITER_CLAIM_WRITE,
    attachment_id: z.uuid(),
  }),
  z.strictObject({
    operation: z.literal('native_media_note'),
    claim: DSH_WRITER_CLAIM_WRITE,
    input: HARNESS_NATIVE_MEDIA_NOTE_INPUT,
  }),
  z.strictObject({
    operation: z.literal('configuration_report'),
    report: AI_HARNESS_CONFIGURATION_REPORT,
    manifest: AI_HARNESS_MANIFEST,
  }),
  z.strictObject({ operation: z.literal('tools') }),
  z.strictObject({
    operation: z.literal('extension_tree'),
    kind: z.enum(['skill', 'plugin']),
    id: z.string().min(1),
    version: z.string().min(1),
  }),
  z.strictObject({ operation: z.literal('context'), claim: DSH_WRITER_CLAIM_WRITE }),
  z.strictObject({
    operation: z.literal('plugin_agent'),
    claim: DSH_WRITER_CLAIM_WRITE,
    arguments: z.record(z.string(), JSON_VALUE),
    configuration_revision: z.string().min(1).max(200),
    asset_id: z.string().min(1),
    helper: z.string().min(1).max(200),
  }),
  z.strictObject({
    operation: z.literal('plugin_agent_control'),
    claim: DSH_WRITER_CLAIM_WRITE,
    action: z.enum(['result', 'cancel']),
    run_id: z.uuid(),
  }),
  z.strictObject({
    operation: z.literal('tool'),
    claim: DSH_WRITER_CLAIM_WRITE,
    name: z.string().min(1).max(200),
    arguments: z.record(z.string(), JSON_VALUE),
  }),
]);
export type HarnessCallRequest = z.infer<typeof HARNESS_CALL_REQUEST>;
export const HARNESS_TRANSPORT_REQUEST = z.strictObject({
  ...BOUND,
  request: HARNESS_CALL_REQUEST,
});
export type HarnessTransportRequest = z.infer<typeof HARNESS_TRANSPORT_REQUEST>;

export const NODE_HARNESS_FRAME = z.discriminatedUnion('type', [
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_hello'),
    protocol: z.literal(1),
    manifest: AI_HARNESS_MANIFEST,
    host: HARNESS_HOST_DESCRIPTION,
    capabilities: CONFIGURATION_CAPABILITIES.optional(),
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_reply'),
    id: z.uuid(),
    result: z.discriminatedUnion('ok', [
      z.object({ ok: z.literal(true), receipt: HARNESS_RUNTIME_RECEIPT }),
      z.object({ ok: z.literal(false), failure: AI_HARNESS_FAILURE }),
    ]),
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_configuration_report'),
    report: AI_HARNESS_CONFIGURATION_REPORT,
    manifest: AI_HARNESS_MANIFEST,
  }),
  HARNESS_SUBSCRIPTION_STATUS_FRAME,
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_subscription_failure'),
    id: z.uuid(),
    failure: AI_HARNESS_FAILURE,
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_call'),
    id: z.uuid(),
    request: HARNESS_CALL_REQUEST,
  }),
  z.strictObject({ ...BOUND, type: z.literal('harness_call_cancel'), id: z.uuid() }),
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_subscription_inference_result'),
    id: z.uuid(),
    result: SUBSCRIPTION_INFERENCE_RESULT,
  }),
]);
export type NodeHarnessFrame = z.infer<typeof NODE_HARNESS_FRAME>;
export const HUB_HARNESS_CONTROL = z.discriminatedUnion('type', [
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_welcome'),
    protocol: z.literal(1),
    configuration: HARNESS_DESIRED_CONFIGURATION.optional(),
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_request'),
    id: z.uuid(),
    request: HARNESS_RUNTIME_REQUEST,
    model_route: AI_MODEL_ROUTE.optional(),
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_ownership_lost'),
    session_id: DSH_SESSION_ID,
    epoch: z.int().positive(),
    failure: AI_HARNESS_FAILURE,
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_configuration'),
    configuration: HARNESS_DESIRED_CONFIGURATION,
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_subscription_control'),
    id: z.uuid(),
    request: HARNESS_SUBSCRIPTION_REQUEST,
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_subscription_inference'),
    id: z.uuid(),
    request: SUBSCRIPTION_INFERENCE_REQUEST,
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_subscription_inference_credit'),
    id: z.uuid(),
    sequence: z.int().nonnegative(),
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_subscription_inference_cancel'),
    id: z.uuid(),
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_call_result'),
    id: z.uuid(),
    result: z.discriminatedUnion('ok', [
      z.strictObject({ ok: z.literal(true), value: z.unknown() }),
      z.strictObject({ ok: z.literal(false), error: API_ERROR.shape.error }),
    ]),
  }),
]);
export type HubHarnessControl = z.infer<typeof HUB_HARNESS_CONTROL>;
