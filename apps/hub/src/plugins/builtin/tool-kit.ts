import { z } from 'zod';
import { failure, type HubToolResult, type ToolCaller } from '../../ai-tools/hub-tool';
import { messageOf } from '@smarteverything/logging';

export const READ_HINTS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;
export const WRITE_HINTS = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;
export const DANGER_HINTS = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
} as const;
export const NO_INPUT = z.strictObject({});

export function toolResult(response: Readonly<Record<string, unknown>>): HubToolResult {
  return { response, line: '', pictures: [] };
}

export async function attemptTool(
  work: () => Promise<Readonly<Record<string, unknown>>>,
): Promise<HubToolResult> {
  try {
    return toolResult(await work());
  } catch (error) {
    return failure(messageOf(error));
  }
}

export function ownerOnly(
  caller: ToolCaller,
  refusal: string,
  work: () => Promise<HubToolResult>,
): Promise<HubToolResult> {
  return caller.role === 'owner' ? work() : Promise.resolve(failure(refusal));
}
