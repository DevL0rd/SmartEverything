import type { ClaudePermissionMode } from '@smarteverything/domain';
import { z } from 'zod';

export const DESKTOP_ID = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);

export const MODEL_ID = z.string().regex(/^[A-Za-z0-9._:/[\]-]{1,200}$/);

export type ControllerJob =
  | { readonly tool: 'set_mode'; readonly desktopId: string; readonly mode: ClaudePermissionMode }
  | { readonly tool: 'set_model'; readonly desktopId: string; readonly model: string }
  | { readonly tool: 'send'; readonly desktopId: string; readonly text: string }
  | { readonly tool: 'interrupt'; readonly desktopId: string }
  | { readonly tool: 'start'; readonly folder: string; readonly text: string };

const CLOSING =
  'When the tool has answered, reply with exactly OK:{id} if it succeeded, or FAIL:{id}:one line saying why if it did not. Call no other tool and write nothing else.';

const TOOL_PREFIX = 'mcp__ccd_session_mgmt__';

const TOOL_NAMES = {
  set_mode: `${TOOL_PREFIX}set_session_permission_mode`,
  set_model: `${TOOL_PREFIX}set_session_model`,
  send: `${TOOL_PREFIX}send_message`,
  interrupt: `${TOOL_PREFIX}stop_session`,
  start: `${TOOL_PREFIX}start_session`,
} as const;

export interface ExpectedCall {
  readonly tool: string;
  readonly values: readonly string[];
}

export function callOf(job: ControllerJob): ExpectedCall {
  const tool = TOOL_NAMES[job.tool];
  switch (job.tool) {
    case 'set_mode':
      return { tool, values: [job.desktopId, job.mode] };
    case 'set_model':
      return { tool, values: [job.desktopId, job.model] };
    case 'send':
      return { tool, values: [job.desktopId, job.text] };
    case 'interrupt':
      return { tool, values: [job.desktopId] };
    case 'start':
      return { tool, values: [job.folder, job.text] };
  }
}

function stepOf(job: ControllerJob): string {
  switch (job.tool) {
    case 'set_mode':
      return `Call ${TOOL_NAMES.set_mode} with session_id ${JSON.stringify(job.desktopId)} and mode ${JSON.stringify(job.mode)}.`;
    case 'set_model':
      return `Call ${TOOL_NAMES.set_model} with session_id ${JSON.stringify(job.desktopId)} and model ${JSON.stringify(job.model)}.`;
    case 'send':
      return `Call ${TOOL_NAMES.send} with session_id ${JSON.stringify(job.desktopId)} and message ${JSON.stringify(job.text)}.`;
    case 'interrupt':
      return `Call ${TOOL_NAMES.interrupt} with session_id ${JSON.stringify(job.desktopId)}.`;
    case 'start':
      return `Use the ${TOOL_PREFIX} tool that starts a new session (${TOOL_NAMES.start}) to start one in the folder ${JSON.stringify(job.folder)} whose first prompt is ${JSON.stringify(job.text)}. If no such tool exists, do not try anything else and answer FAIL.`;
  }
}

export function instructionOf(id: string, job: ControllerJob): string {
  return `SmartEverything request ${id}. ${stepOf(job)} ${CLOSING.replaceAll('{id}', id)}`;
}
