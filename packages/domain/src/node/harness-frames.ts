import {
  SUBSCRIPTION_INFERENCE_REQUEST,
  SUBSCRIPTION_INFERENCE_RESULT,
} from '../ai-subscription-inference';
import { AI_PREVIEW_NATIVE_REQUEST, HUB_PREVIEW_OPEN } from '../ai-previews';
import { HUB_PREVIEW_FILE_CLOSE } from '../ai-preview-files';
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
import { AI_PROJECT_REQUEST } from '../ai-project-files';
import {
  AI_SUBSCRIPTION_HOST_STATUS,
  HARNESS_SUBSCRIPTION_REQUEST,
  HARNESS_SUBSCRIPTION_USE,
} from '../ai-subscription-host';
import { ASSISTANT_ATTACHMENT_BYTES_MAX, ASSISTANT_MESSAGE_ROW } from '../assistant';
import { z } from 'zod';
import {
  AI_HARNESS_MANIFEST,
  AI_HARNESS_FAILURE,
  AI_HARNESS_PERMISSION_WRITE,
  AI_HARNESS_WORKSPACE_CHOICE,
  AI_HARNESS_STORAGE_BINDING,
} from '../ai-harness';
import {
  AI_HARNESS_EVENT,
  AI_HARNESS_ANSWER,
  AI_HARNESS_HANDOFF_REQUEST,
} from '../ai-harness-session';
import { AI_MODEL_ROUTE, AI_MODEL_ROUTE_SELECTION_WRITE } from '../ai-model-route';
import {
  DSH_SESSION_ID,
  DSH_WRITER_CLAIM_WRITE,
  DSH_SESSION_APPEND,
  DSH_SESSION_FLUSH,
  DSH_SESSION_RELEASE,
  DSH_SESSION_RENEW,
  DSH_SESSION_READ,
} from '../dsh-sessions';

export const HARNESS_CONFIGURATION_CAPABILITY = 'harness-configuration-v1';
const CONFIGURATION_CAPABILITIES = z.array(z.string().min(1).max(200)).max(20);
export const NODE_HARNESS_PROTOCOL = 'smarteverything-node-harness.v1';
export const NODE_HARNESS_PATH = '/api/node/harness';
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
  platform: z.enum(['linux', 'windows', 'macos']),
  home_directory: z.string().min(1).max(4096),
  inbound_execution: z.boolean(),
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
  }),
  z.strictObject({
    ...SESSION,
    kind: z.literal('prompt'),
    delivery_id: z.uuid(),
    text: z.string().max(200_000),
    attachments: z.array(z.uuid()).max(20),
  }),
  z.strictObject({ ...SESSION, kind: z.literal('steer'), text: z.string().max(200_000) }),
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
  z.strictObject({
    ...SESSION,
    kind: z.literal('preflight'),
    native_attachments: z.array(JSON_VALUE).max(1000).optional(),
    route: AI_MODEL_ROUTE_SELECTION_WRITE,
    permission: AI_HARNESS_PERMISSION_WRITE,
    cwd: z.string().min(1).max(4096),
    storage_binding: AI_HARNESS_STORAGE_BINDING.optional(),
  }),
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
  z.strictObject({ ...SESSION, kind: z.literal('drain'), handoff: AI_HARNESS_HANDOFF_REQUEST }),
  z.strictObject({
    ...SESSION,
    kind: z.literal('close'),
    claim: DSH_WRITER_CLAIM_WRITE.optional(),
  }),
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
  commands: AI_HARNESS_COMMAND_DESCRIPTORS.optional(),
  command_outcome: AI_HARNESS_COMMAND_OUTCOME.optional(),
  operation_id: z.uuid(),
  session_id: DSH_SESSION_ID,
  epoch: z.int().positive(),
  state: z.enum(['accepted', 'ready', 'drained', 'closed', 'completed', 'preflighted']),
  durable_seq: z.int().min(-1),
  text: z.string().max(200_000).optional(),
});
export type HarnessRuntimeReceipt = z.infer<typeof HARNESS_RUNTIME_RECEIPT>;

export const NODE_HARNESS_FRAME = z.discriminatedUnion('type', [
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_hello'),
    protocol: z.literal(1),
    manifest: AI_HARNESS_MANIFEST,
    host: HARNESS_HOST_DESCRIPTION,
    capabilities: CONFIGURATION_CAPABILITIES.optional(),
  }),
  z.strictObject({ ...BOUND, type: z.literal('harness_event'), event: AI_HARNESS_EVENT }),
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
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_subscription_status'),
    id: z.uuid().optional(),
    status: AI_SUBSCRIPTION_HOST_STATUS,
  }),
  z.strictObject({
    ...BOUND,
    type: z.literal('harness_subscription_failure'),
    id: z.uuid(),
    failure: AI_HARNESS_FAILURE,
  }),
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
  HUB_PREVIEW_OPEN,
  HUB_PREVIEW_FILE_CLOSE,
]);
export type HubHarnessControl = z.infer<typeof HUB_HARNESS_CONTROL>;

export const HARNESS_ATTACHMENT_TRANSFER = z.object({
  name: z.string().min(1).max(200),
  mime: z.string().min(1).max(200),
  bytes: z.int().positive().max(ASSISTANT_ATTACHMENT_BYTES_MAX),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  data: z.base64().max(Math.ceil(ASSISTANT_ATTACHMENT_BYTES_MAX / 3) * 4),
  transcript: z.string().max(200_000).nullable(),
});
export const HARNESS_NATIVE_MEDIA_NOTE_INPUT = z.strictObject({
  seq: z.int().nonnegative(),
  image_index: z.int().nonnegative(),
  attachment_id: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  data: z.base64().max(Math.ceil(ASSISTANT_ATTACHMENT_BYTES_MAX / 3) * 4),
});
export const HARNESS_NATIVE_MEDIA_NOTE = z.object({ text: z.string().min(1).max(200_000) });
export const HARNESS_CENTRAL_TOOL = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1),
  parameters: z.record(z.string(), JSON_VALUE),
});
export const HARNESS_CENTRAL_CATALOGUE = z.array(HARNESS_CENTRAL_TOOL).max(2000);
export const HARNESS_CENTRAL_CONTEXT = z.object({
  text: z.string().max(200_000),
  tools: HARNESS_CENTRAL_CATALOGUE,
  compact_at_percent: z.number().int().min(50).max(95).optional(),
});
export const HARNESS_CENTRAL_RESULT = z.object({
  response: z.record(z.string(), JSON_VALUE),
  pictures: z
    .array(
      z.object({
        data: z.base64(),
        mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
      }),
    )
    .max(100),
});
export const HARNESS_TRANSPORT_REQUEST = z.strictObject({
  ...BOUND,
  request: z.discriminatedUnion('operation', [
    z.strictObject({ operation: z.literal('register'), hello: NODE_HARNESS_FRAME.options[0] }),
    z.strictObject({ operation: z.literal('stat'), session_id: DSH_SESSION_ID }),
    z.strictObject({ operation: z.literal('read'), input: DSH_SESSION_READ }),
    z.strictObject({ operation: z.literal('append'), input: DSH_SESSION_APPEND }),
    z.strictObject({ operation: z.literal('flush'), input: DSH_SESSION_FLUSH }),
    z.strictObject({ operation: z.literal('release'), input: DSH_SESSION_RELEASE }),
    z.strictObject({ operation: z.literal('renew'), input: DSH_SESSION_RENEW }),
    z.strictObject({
      operation: z.literal('verify'),
      claim: DSH_WRITER_CLAIM_WRITE,
      subscription: HARNESS_SUBSCRIPTION_USE.optional(),
    }),
    z.strictObject({ operation: z.literal('publish'), frame: NODE_HARNESS_FRAME }),
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
    ...AI_PREVIEW_NATIVE_REQUEST.options,
    z.strictObject({ operation: z.literal('configuration') }),
    z.strictObject({
      operation: z.literal('configuration_report'),
      report: AI_HARNESS_CONFIGURATION_REPORT,
      manifest: AI_HARNESS_MANIFEST,
    }),
    z.strictObject({ operation: z.literal('unregister') }),
    z.strictObject({ operation: z.literal('catalogue') }),
    z.strictObject({ operation: z.literal('tools') }),
    z.strictObject({ operation: z.literal('context'), claim: DSH_WRITER_CLAIM_WRITE }),
    z.strictObject({
      operation: z.literal('project_file'),
      claim: DSH_WRITER_CLAIM_WRITE,
      call_id: z.string().min(1).max(200),
      call_seq: z.int().nonnegative(),
      name: z.enum(['read', 'read_image', 'write', 'edit']),
      arguments_hash: z.string().regex(/^[a-f0-9]{64}$/u),
      file: AI_PROJECT_REQUEST,
    }),
    z.strictObject({
      operation: z.literal('tool'),
      claim: DSH_WRITER_CLAIM_WRITE,
      call_id: z.string().min(1).max(200),
      call_seq: z.int().nonnegative(),
      name: z.string().min(1).max(200),
      arguments: z.record(z.string(), JSON_VALUE),
    }),
  ]),
});
export type HarnessTransportRequest = z.infer<typeof HARNESS_TRANSPORT_REQUEST>;
