import { defineNodeKind } from '@smarteverything/domain';
import type { Finding, LintContext } from '../../src/check/lint';
import { lint } from '../../src/check/lint';
import type { Program } from '../../src/program/walk';
import type { ContextOptions } from './c23-support';
import { context } from './c23-support';

const FOREVER = defineNodeKind({
  id: 'flow.forever',
  name: 'Forever',
  category: 'flow',
  icon: 'infinity',
  class: 'control',
  description: 'Runs the body again and again.',
  inputs: [],
  outputs: [],
  exits: [],
  scopes: { required: ['body'], optional: [] },
  summary: 'Forever',
  keywords: ['loop'],
  access: 'member',
  tier: 'v1',
});

export function lintContext(options: ContextOptions = {}): LintContext {
  const base = context(options);
  return {
    ...base,
    kinds: (id) => (id === FOREVER.id ? FOREVER : base.kinds(id)),
  };
}

export function findings(program: Program, options: ContextOptions = {}): readonly Finding[] {
  return lint(program, lintContext(options));
}

export function only(found: readonly Finding[], code: string): readonly Finding[] {
  return found.filter((item) => item.code === code);
}

export function keysOf(found: readonly Finding[], code: string): readonly (string | undefined)[] {
  return only(found, code).map((item) => item.key);
}
