import { describe, expect, it } from 'vitest';
import {
  FINDING,
  FINDING_CODES,
  LINT_ACTION,
  LINT_ERROR_CODES,
  LINT_HINT_CODES,
  LINT_WARNING_CODES,
  hasErrors,
  lint,
} from '../../src/check/lint';
import { finding, severityOf } from '../../src/check/lint-types';
import { PROBLEM_CODES } from '../../src/check/problems';
import { automation, wired, lit, node, scope, trigger } from './c23-support';
import { findings, lintContext, only } from './lint-support';

describe('lint', () => {
  it('returns errors first, then warnings, then hints, all well formed', () => {
    const program = automation(
      [
        node('note', 'notify.feed', { message: lit('hi') }),
        node('ghost', 'ghost.kind'),
        node(
          'loose',
          'flow.repeat',
          { times: lit(2) },
          { scopes: { body: scope(node('b', 'flow.break')) } },
        ),
        node('out', 'flow.break'),
      ],
      { budgets: { effects: 'off' } },
    );
    const found = findings(program);
    expect(found.map((item) => item.severity)).toEqual(
      [...found.map((item) => item.severity)].toSorted(
        (left, right) =>
          ['error', 'warning', 'hint'].indexOf(left) - ['error', 'warning', 'hint'].indexOf(right),
      ),
    );
    expect(new Set(found.map((item) => item.severity))).toEqual(
      new Set(['error', 'warning', 'hint']),
    );
    for (const item of found) expect(FINDING.parse(item)).toEqual(item);
    expect(hasErrors(found)).toBe(true);
    expect(hasErrors(found.filter((item) => item.severity !== 'error'))).toBe(false);
  });

  it('turns check problems into errors and keeps their fixes', () => {
    const found = findings(
      automation([node('ghost', 'ghost.kind'), node('bad', 'notify.feed', { message: lit(5) })]),
    );
    const unknown = only(found, 'unknown_kind')[0];
    expect(unknown?.severity).toBe('error');
    expect(unknown?.fix).toEqual({ summary: 'pick a kind from the catalogue' });
    const literal = only(found, 'invalid_literal')[0];
    expect(literal?.fix).toBeUndefined();
  });

  it('reports a literal authorization header through the same list', () => {
    const found = findings(
      automation([
        node('call', 'http.request', {
          url: lit('https://example.com'),
          headers: lit({ Authorization: 'x' }),
        }),
      ]),
    );
    expect(only(found, 'forbidden_header')).toHaveLength(1);
  });

  it('finds nothing wrong with a clean program', () => {
    const clean = automation([node('say', 'notify.feed', { message: wired('home.name') })], {
      triggers: [trigger('t', 'trigger.time', { at: lit('07:00') })],
    });
    expect(findings(clean).map((item) => item.code)).toEqual(['notify_feed_upgrade']);
  });

  it('works without options', () => {
    expect(lint(automation([]), lintContext())).toEqual([]);
  });
});

describe('finding codes', () => {
  it('lists every code once', () => {
    const all = [...PROBLEM_CODES, ...LINT_ERROR_CODES, ...LINT_WARNING_CODES, ...LINT_HINT_CODES];
    expect(new Set(all).size).toBe(all.length);
    expect([...FINDING_CODES]).toEqual(all);
  });

  it('gives each code its severity', () => {
    expect(LINT_ERROR_CODES.every((code) => severityOf(code) === 'error')).toBe(true);
    expect(PROBLEM_CODES.every((code) => severityOf(code) === 'error')).toBe(true);
    expect(LINT_WARNING_CODES.every((code) => severityOf(code) === 'warning')).toBe(true);
    expect(LINT_HINT_CODES.every((code) => severityOf(code) === 'hint')).toBe(true);
  });

  it('builds a finding with only the parts given', () => {
    expect(finding('loop_spins', {}, 'm')).toEqual({
      severity: 'warning',
      code: 'loop_spins',
      message: 'm',
    });
    expect(
      finding('loop_spins', { nodeId: 'i', key: 'k' }, 'm', {
        port: 'p',
        expected: 'e',
        received: 'r',
        fix: { summary: 's' },
      }),
    ).toEqual({
      severity: 'warning',
      code: 'loop_spins',
      nodeId: 'i',
      key: 'k',
      port: 'p',
      message: 'm',
      expected: 'e',
      received: 'r',
      fix: { summary: 's' },
    });
  });

  it('accepts only the known fix actions', () => {
    expect(LINT_ACTION.safeParse({ action: 'turn_on_storm_protection' }).success).toBe(true);
    expect(LINT_ACTION.safeParse({ action: 'delete_everything' }).success).toBe(false);
  });
});
