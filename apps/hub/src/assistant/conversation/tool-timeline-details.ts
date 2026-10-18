import { z } from 'zod';
import { IMAGE_OPERATION_REQUEST, IMAGE_OPERATION_RECEIPT } from '@smarteverything/domain';
import { redact, REDACTED } from '@smarteverything/logging';
import type { ChatTimelineTool } from '@smarteverything/domain';

export interface ToolTimelineDetails {
  readonly input?: unknown;
  readonly output?: unknown;
  readonly state?: ChatTimelineTool['state'];
}
const RECORD = z.record(z.string(), z.unknown());
function decoded(value: unknown): unknown {
  if (typeof value !== 'string' || !/^\s*[[{]/.test(value)) return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    if (error instanceof SyntaxError) return value;
    throw error;
  }
}
function imageOperationId(value: unknown, depth = 0): string | null {
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
function reported(value: unknown): string | null {
  if (value === undefined) return null;
  const source = decoded(value);
  if (typeof source === 'string') return source;
  return JSON.stringify(redact({ value: source })['value'], null, 2);
}

export function toolTimelineDetails(
  name: string,
  details: ToolTimelineDetails,
): Pick<ChatTimelineTool, 'input' | 'output' | 'redacted' | 'image_operation_id'> {
  const input = reported(details.input);
  const output = returnedOutput(details.output);
  return {
    input,
    output,
    redacted: input?.includes(REDACTED) === true,
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
