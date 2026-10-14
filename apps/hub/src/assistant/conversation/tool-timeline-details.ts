import { z } from 'zod';
import { IMAGE_OPERATION_REQUEST, IMAGE_OPERATION_RECEIPT } from '@smarteverything/domain';
import { redact, redactText, REDACTED } from '@smarteverything/logging';
import type { ChatTimelineTool } from '@smarteverything/domain';

export interface ToolTimelineDetails {
  readonly input?: unknown;
  readonly output?: unknown;
  readonly state?: ChatTimelineTool['state'];
}
const RECORD = z.record(z.string(), z.unknown());
const SENSITIVE_TOOL =
  /secret|credential|password|token|sign.?in|auth|setting|(?:api|gemini|openrouter)[_-]?key/i;
const TOOL_NAME_FIELDS = new Set(['name', 'tool', 'tool_name', 'operation', 'key']);
const CREDENTIAL_ASSIGNMENT =
  /(["'`]?[\w$.-]*(?:password|passwd|pwd|secret(?:[_-]?access)?[_-]?key|secret|token|(?:api|gemini|local|service[_-]?role)[_-]?key|private[_-]?key|one[_-]?time[_-]?code|authorization|ssecurity)["'`]?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[^\r\n,;[\]{}#"'`]+)/gi;
function timelineText(value: string): string {
  const sanitized = value.replace(
    CREDENTIAL_ASSIGNMENT,
    (_match: string, prefix: string, assigned: string): string => {
      const delimiter = /^["'`]/.test(assigned) ? assigned.charAt(0) : '';
      return `${prefix}${delimiter}${REDACTED}${delimiter}`;
    },
  );
  return redactText(sanitized, sanitized.length);
}
function decoded(value: unknown): unknown {
  if (typeof value !== 'string' || !/^\s*[[{]/.test(value)) return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    if (error instanceof SyntaxError) return value;
    throw error;
  }
}
export function imageOperationId(value: unknown, depth = 0): string | null {
  if (depth > 5) return null;
  const source = decoded(value);
  const request = IMAGE_OPERATION_REQUEST.safeParse(source);
  if (request.success) return request.data.operation_id;
  const receipt = IMAGE_OPERATION_RECEIPT.safeParse(source);
  if (receipt.success) return receipt.data.id;
  const record = RECORD.safeParse(source);
  const values = record.success ? Object.values(record.data) : Array.isArray(source) ? source : [];
  for (const child of values) {
    const id = imageOperationId(child, depth + 1);
    if (id !== null) return id;
  }
  return null;
}
function sensitiveEnvelope(value: unknown, depth = 0): boolean {
  if (depth > 8) return true;
  const source = decoded(value);
  const record = RECORD.safeParse(source);
  if (record.success) {
    return Object.entries(record.data).some(
      ([key, child]) =>
        (TOOL_NAME_FIELDS.has(key) && typeof child === 'string' && SENSITIVE_TOOL.test(child)) ||
        sensitiveEnvelope(child, depth + 1),
    );
  }
  return Array.isArray(source) && source.some((child) => sensitiveEnvelope(child, depth + 1));
}

function redactedTextValues(value: unknown): unknown {
  if (typeof value === 'string') return timelineText(value);
  if (Array.isArray(value)) return value.map((entry: unknown) => redactedTextValues(entry));
  const record = RECORD.safeParse(value);
  if (!record.success) return value;
  return Object.fromEntries(
    Object.entries(record.data).map(([key, child]) => [key, redactedTextValues(child)]),
  );
}
function reported(value: unknown, sensitive: boolean): string | null {
  if (value === undefined) return null;
  if (sensitive) return REDACTED;
  const source = decoded(value);
  if (typeof source === 'string') return timelineText(source);
  const sanitized = redactedTextValues(redact({ value: source })['value']);
  return JSON.stringify(sanitized, null, 2);
}

export function toolTimelineDetails(
  name: string,
  details: ToolTimelineDetails,
  previouslySensitive = false,
): Pick<ChatTimelineTool, 'input' | 'output' | 'redacted' | 'image_operation_id'> {
  const sensitive =
    previouslySensitive || SENSITIVE_TOOL.test(name) || sensitiveEnvelope(details.input);
  const input = reported(details.input, sensitive);
  const output = returnedOutput(details.output);
  return {
    input,
    output,
    redacted: sensitive || input?.includes(REDACTED) === true,
    image_operation_id: initiatingImageId(name, details),
  };
}

function initiatingImageId(name: string, details: ToolTimelineDetails): string | null {
  const input = imageOperationId(details.input);
  if (input !== null) return input;
  return /(?:^|__)start_?image_?operation$/i.test(name) ? imageOperationId(details.output) : null;
}

function returnedOutput(value: unknown): string | null {
  if (value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}
