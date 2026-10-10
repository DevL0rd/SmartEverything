import type { JsonValue } from '@smarteverything/domain';
import type { HookOutput } from './hook-events';

export type HookEvent = 'PermissionRequest' | 'PreToolUse';

export type PromptVerdict =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny'; readonly reason: string | null }
  | { readonly kind: 'answer'; readonly answers: Readonly<Record<string, string>> };

const DENIED_TEXT = 'Denied from SmartEverything';

function permissionOutput(verdict: PromptVerdict): HookOutput {
  const decision: JsonValue =
    verdict.kind === 'deny'
      ? { behavior: 'deny', message: verdict.reason ?? DENIED_TEXT }
      : { behavior: 'allow' };
  return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } };
}

function toolOutput(
  verdict: PromptVerdict,
  input: Readonly<Record<string, JsonValue>>,
): HookOutput {
  if (verdict.kind === 'deny') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: verdict.reason ?? DENIED_TEXT,
      },
    };
  }
  const updated: Record<string, JsonValue> =
    verdict.kind === 'answer' ? { ...input, answers: { ...verdict.answers } } : { ...input };
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: updated,
    },
  };
}

export function outputFor(
  event: HookEvent,
  verdict: PromptVerdict,
  input: Readonly<Record<string, JsonValue>>,
): HookOutput {
  return event === 'PermissionRequest' ? permissionOutput(verdict) : toolOutput(verdict, input);
}

const FLOOR_TEXT =
  'The SmartEverything controller session may only make the one Claude Desktop session call it was asked for.';

export function floorDenied(): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: FLOOR_TEXT,
    },
  };
}
