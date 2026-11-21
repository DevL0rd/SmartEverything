import { imageOperationIdOfCall } from '../image/call-operation';
import { z } from 'zod';
import { IMAGE_OPERATION_RECEIPT } from '@smarteverything/domain';
import { payloadOf } from '@smarteverything/logging';
import type { ChatTimelineTool } from '@smarteverything/domain';

export interface ToolTimelineDetails {
  readonly input?: unknown;
  readonly output?: unknown;
  readonly state?: ChatTimelineTool['state'];
}
const RECEIPT_KEYS = ['id', 'profile_id', 'chat_id'] as const;
function decoded(value: unknown): unknown {
  if (typeof value !== 'string' || !/^\s*[[{]/.test(value)) return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    if (error instanceof SyntaxError) return value;
    throw error;
  }
}
function mayHoldReceipt(value: unknown): boolean {
  return typeof value !== 'string' || value.includes(RECEIPT_KEYS[2]);
}
function receiptShaped(value: object): boolean {
  return RECEIPT_KEYS.every((key) => typeof Reflect.get(value, key) === 'string');
}
function receiptIdOf(value: object): string | null {
  if (Array.isArray(value) || !receiptShaped(value)) return null;
  const receipt = IMAGE_OPERATION_RECEIPT.safeParse(value);
  return receipt.success ? receipt.data.id : null;
}
function imageOperationId(value: unknown, depth = 0): string | null {
  if (depth > 5 || !mayHoldReceipt(value)) return null;
  const source = decoded(value);
  if (typeof source !== 'object' || source === null) return null;
  const own = receiptIdOf(source);
  if (own !== null) return own;
  const values: readonly unknown[] = Array.isArray(source) ? source : Object.values(source);
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
  return JSON.stringify(payloadOf({ value: source })['value'], null, 2);
}

export function toolTimelineDetails(
  name: string,
  details: ToolTimelineDetails,
  callId: string,
): Pick<ChatTimelineTool, 'input' | 'output' | 'redacted' | 'image_operation_id'> {
  const input = reported(details.input);
  const output = returnedOutput(details.output);
  return {
    input,
    output,
    redacted: false,
    image_operation_id: initiatingImageId(name, details, callId),
  };
}

const IMAGE_MAKING = z.looseObject({ action: z.enum(['generate', 'edit']) });

function initiatingImageId(
  name: string,
  details: ToolTimelineDetails,
  callId: string,
): string | null {
  const returned = imageOperationId(details.output);
  if (returned !== null) return returned;
  return name === 'image_gen' && IMAGE_MAKING.safeParse(decoded(details.input)).success
    ? imageOperationIdOfCall(callId)
    : null;
}

function returnedOutput(value: unknown): string | null {
  if (value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}
