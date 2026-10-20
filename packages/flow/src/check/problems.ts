import { z } from 'zod';
import type { ReferenceSite } from './references';
import type { VisibilityReason } from './visibility-types';

export const PROBLEM_CODES = [
  'unknown_kind',
  'wrong_node_class',
  'unknown_port',
  'missing_port',
  'static_not_literal',
  'invalid_literal',
  'unknown_reference',
  'invisible_reference',
  'unknown_target',
  'unknown_secret',
  'unknown_function',
  'type_mismatch',
  'generic_mismatch',
  'structured_output_mismatch',
  'forbidden_header',
] as const;

export const PROBLEM_CODE = z.enum(PROBLEM_CODES);

export type ProblemCode = z.infer<typeof PROBLEM_CODE>;

export const PROBLEM = z.strictObject({
  nodeId: z.string().min(1).optional(),
  key: z.string().min(1).optional(),
  port: z.string().min(1).optional(),
  code: PROBLEM_CODE,
  message: z.string().min(1),
  expected: z.string().min(1).optional(),
  received: z.string().min(1).optional(),
  fix: z.string().min(1).optional(),
});

export type Problem = z.infer<typeof PROBLEM>;

export interface Subject {
  readonly nodeId?: string | undefined;
  readonly key?: string | undefined;
}

export interface ProblemDetail {
  readonly port?: string | undefined;
  readonly expected?: string | undefined;
  readonly received?: string | undefined;
  readonly fix?: string | undefined;
}

export const PROGRAM_SUBJECT: Subject = {};

export function problem(
  subject: Subject,
  code: ProblemCode,
  message: string,
  detail: ProblemDetail = {},
): Problem {
  return {
    ...(subject.nodeId === undefined ? {} : { nodeId: subject.nodeId }),
    ...(subject.key === undefined ? {} : { key: subject.key }),
    ...(detail.port === undefined ? {} : { port: detail.port }),
    code,
    message,
    ...(detail.expected === undefined ? {} : { expected: detail.expected }),
    ...(detail.received === undefined ? {} : { received: detail.received }),
    ...(detail.fix === undefined ? {} : { fix: detail.fix }),
  };
}

export function siteName(site: ReferenceSite): string {
  switch (site.kind) {
    case 'port':
      return site.port;
    case 'branch':
      return `branch:${site.id}`;
    case 'case':
      return `case:${site.id}`;
    case 'output':
      return `outputs.${site.name}.${site.scope}`;
    case 'admit':
      return 'admit';
    case 'variable':
      return `variables.${site.name}`;
  }
}

const VISIBILITY_FIXES: Readonly<Record<VisibilityReason, string>> = {
  unknown_key: 'name a step or trigger that exists in this program',
  self: 'read the value from an earlier step instead',
  cycle: 'break the loop between these pure steps',
  comes_later: 'move the step that gives the value above this one',
  inside_finished_container: 'give the value out of its container with an output',
  not_in_scope: 'move the step into a scope this one can see, or give the value out with an output',
  not_a_scope_output: 'use one of the values the container gives inside itself',
  not_an_output: 'declare an output on the container and read that',
  pure_not_visible: 'make everything the pure step reads visible here',
};

export function visibilityFix(reason: VisibilityReason): string {
  return VISIBILITY_FIXES[reason];
}
