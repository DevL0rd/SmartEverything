import type { NodeKind } from '@smarteverything/domain';
import { PORT_VALUE } from '@smarteverything/domain';
import { z } from 'zod';
import type { ProgramIndex } from '../program/lookup';
import type { Program } from '../program/walk';
import { PROBLEM_CODES } from './problems';
import type { Subject } from './problems';
import type { CheckContext, CheckKind, TypedProgram } from './shapes';

export const LINT_ERROR_CODES = [
  'disabled_node_consumed',
  'parallel_variable_write',
  'retry_not_idempotent',
  'loop_control_outside_loop',
  'unknown_loop_target',
  'forever_without_exit',
  'duplicate_switch_literal',
  'input_needs_default',
  'trigger_in_reusable',
  'kept_data_in_function',
  'stateful_in_reusable',
  'read_in_function',
  'unit_mismatch',
] as const;

export const LINT_WARNING_CODES = [
  'storm_protection_off',
  'loop_spins',
  'loop_commands_without_wait',
  'event_wait_without_timeout',
  'feedback_trigger',
  'unreachable_node',
  'unreachable_exit',
  'variable_never_read',
  'list_of_any',
  'switch_not_exhaustive',
  'polling_loop',
  'long_delay_single',
  'if_chain_over_variable',
  'ai_tools_untrusted',
] as const;

export const LINT_HINT_CODES = ['notify_feed_upgrade'] as const;

export const FINDING_CODES = [
  ...PROBLEM_CODES,
  ...LINT_ERROR_CODES,
  ...LINT_WARNING_CODES,
  ...LINT_HINT_CODES,
] as const;

export const FINDING_SEVERITIES = ['error', 'warning', 'hint'] as const;

export const LINT_ACTION = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('turn_on_storm_protection') }),
  z.strictObject({
    action: z.literal('set_port'),
    key: z.string().min(1),
    port: z.string().min(1),
    value: PORT_VALUE,
  }),
  z.strictObject({
    action: z.literal('wait_until'),
    key: z.string().min(1),
    condition: PORT_VALUE,
  }),
  z.strictObject({
    action: z.literal('cycle_variable'),
    key: z.string().min(1),
    variable: z.string().min(1),
  }),
  z.strictObject({
    action: z.literal('lookup_table'),
    key: z.string().min(1),
    variable: z.string().min(1),
  }),
]);

export type LintAction = z.infer<typeof LINT_ACTION>;

export const LINT_FIX = z.strictObject({
  summary: z.string().min(1),
  action: LINT_ACTION.optional(),
});

export type LintFix = z.infer<typeof LINT_FIX>;

export const FINDING = z.strictObject({
  severity: z.enum(FINDING_SEVERITIES),
  code: z.enum(FINDING_CODES),
  nodeId: z.string().min(1).optional(),
  key: z.string().min(1).optional(),
  port: z.string().min(1).optional(),
  message: z.string().min(1),
  expected: z.string().min(1).optional(),
  received: z.string().min(1).optional(),
  fix: LINT_FIX.optional(),
});

export type Finding = z.infer<typeof FINDING>;

export type FindingSeverity = Finding['severity'];

export type FindingCode = Finding['code'];

export type LintKind = CheckKind &
  Partial<Pick<NodeKind, 'effect' | 'stateful' | 'exits' | 'scopes'>>;

export interface LintContext extends CheckContext {
  readonly kinds: (id: string) => LintKind | undefined;
}

export interface LintInput {
  readonly program: Program;
  readonly index: ProgramIndex;
  readonly ctx: LintContext;
  readonly typed: TypedProgram;
}

export type LintRule = (input: LintInput) => readonly Finding[];

export interface FindingDetail {
  readonly port?: string | undefined;
  readonly expected?: string | undefined;
  readonly received?: string | undefined;
  readonly fix?: LintFix | undefined;
}

const SEVERITY_OF_CODE: ReadonlyMap<FindingCode, FindingSeverity> = new Map<
  FindingCode,
  FindingSeverity
>([
  ...LINT_WARNING_CODES.map((code): [FindingCode, FindingSeverity] => [code, 'warning']),
  ...LINT_HINT_CODES.map((code): [FindingCode, FindingSeverity] => [code, 'hint']),
]);

export function severityOf(code: FindingCode): FindingSeverity {
  return SEVERITY_OF_CODE.get(code) ?? 'error';
}

export function finding(
  code: FindingCode,
  subject: Subject,
  message: string,
  detail: FindingDetail = {},
): Finding {
  return {
    severity: severityOf(code),
    code,
    ...(subject.nodeId === undefined ? {} : { nodeId: subject.nodeId }),
    ...(subject.key === undefined ? {} : { key: subject.key }),
    ...(detail.port === undefined ? {} : { port: detail.port }),
    message,
    ...(detail.expected === undefined ? {} : { expected: detail.expected }),
    ...(detail.received === undefined ? {} : { received: detail.received }),
    ...(detail.fix === undefined ? {} : { fix: detail.fix }),
  };
}

export function fixText(summary: string): LintFix {
  return { summary };
}
