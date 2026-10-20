import type { PortValue } from '@smarteverything/domain';
import type { NodeEntry } from '../program/lookup';
import type { Finding, LintInput, LintRule } from './lint-types';
import { finding, fixText } from './lint-types';
import {
  WAIT_KINDS,
  descendantsOf,
  entriesOfKind,
  hasPort,
  isActive,
  issuesCommands,
  loopsAbove,
  numberOf,
  subjectOf,
  textOf,
} from './lint-scan';

const ENDLESS_KINDS: readonly string[] = ['flow.while', 'flow.do_until', 'flow.forever'];
const COMMAND_LOOP_KINDS: readonly string[] = [...ENDLESS_KINDS, 'flow.repeat'];
const LEAVING_KINDS: ReadonlySet<string> = new Set(['flow.return', 'flow.stop']);

function breakTarget(input: LintInput, entry: NodeEntry): string | undefined {
  return textOf(entry.node, 'target') ?? loopsAbove(input.index, entry).at(-1);
}

function controlFindings(input: LintInput): readonly Finding[] {
  return entriesOfKind(input.index, 'flow.break', 'flow.continue').flatMap((entry) => {
    const subject = subjectOf(entry.node);
    const loops = loopsAbove(input.index, entry);
    if (loops.length === 0) {
      return [
        finding(
          'loop_control_outside_loop',
          subject,
          `${entry.node.kind} only works inside a loop.`,
          {
            fix: fixText('move it into the body of a loop, or remove it'),
          },
        ),
      ];
    }
    const target = textOf(entry.node, 'target');
    if (target === undefined || loops.includes(target)) return [];
    return [
      finding('unknown_loop_target', subject, `${target} is not a loop around this step.`, {
        port: 'target',
        received: target,
        fix: fixText(`use one of ${loops.join(', ')} or leave the target empty`),
      }),
    ];
  });
}

function leavesLoop(input: LintInput, loopKey: string, entry: NodeEntry): boolean {
  if (LEAVING_KINDS.has(entry.node.kind)) return true;
  return entry.node.kind === 'flow.break' && breakTarget(input, entry) === loopKey;
}

function foreverFindings(input: LintInput): readonly Finding[] {
  return entriesOfKind(input.index, 'flow.forever').flatMap((entry) => {
    const exits =
      hasPort(entry.node, 'limit') ||
      descendantsOf(input.index, entry.node.key).some((inner) =>
        leavesLoop(input, entry.node.key, inner),
      );
    return exits
      ? []
      : [
          finding('forever_without_exit', subjectOf(entry.node), 'This loop never ends.', {
            fix: fixText(
              'add a Break, Return or Stop step that runs under some condition, or a limit',
            ),
          }),
        ];
  });
}

function hasGap(entry: NodeEntry): boolean {
  return hasPort(entry.node, 'gap') && numberOf(entry.node, 'gap') !== 0;
}

function bodyOf(input: LintInput, entry: NodeEntry): readonly NodeEntry[] {
  return descendantsOf(input.index, entry.node.key);
}

function spinFindings(input: LintInput): readonly Finding[] {
  return entriesOfKind(input.index, ...ENDLESS_KINDS).flatMap((entry) => {
    const body = bodyOf(input, entry);
    const pauses =
      hasGap(entry) ||
      body.some((inner) => WAIT_KINDS.has(inner.node.kind) || isActive(inner, input.ctx));
    return pauses
      ? []
      : [
          finding(
            'loop_spins',
            subjectOf(entry.node),
            'This loop runs again at once and changes nothing.',
            {
              fix: fixText('add a gap, a wait, or use Wait until true'),
            },
          ),
        ];
  });
}

function commandFindings(input: LintInput): readonly Finding[] {
  return entriesOfKind(input.index, ...COMMAND_LOOP_KINDS).flatMap((entry) => {
    const body = bodyOf(input, entry);
    const commands = body.some((inner) => issuesCommands(inner, input.ctx));
    const pauses = hasGap(entry) || body.some((inner) => WAIT_KINDS.has(inner.node.kind));
    return commands && !pauses
      ? [
          finding(
            'loop_commands_without_wait',
            subjectOf(entry.node),
            'This loop sends device commands without any pause.',
            {
              fix: fixText('add a gap to the loop or a Wait step in its body'),
            },
          ),
        ]
      : [];
  });
}

function pollCondition(entry: NodeEntry): PortValue | undefined {
  const condition = entry.node.ports?.['condition'];
  if (condition === undefined || !('wire' in condition)) return undefined;
  return entry.node.kind === 'flow.do_until' ? condition : undefined;
}

function pollingFindings(input: LintInput): readonly Finding[] {
  return entriesOfKind(input.index, 'flow.while', 'flow.do_until').flatMap((entry) => {
    const polls =
      hasGap(entry) && !bodyOf(input, entry).some((inner) => isActive(inner, input.ctx));
    if (!polls) return [];
    const condition = pollCondition(entry);
    const summary = 'replace the loop with Wait until true';
    return [
      finding(
        'polling_loop',
        subjectOf(entry.node),
        'This loop only checks something again and again.',
        {
          fix:
            condition === undefined
              ? fixText(summary)
              : { summary, action: { action: 'wait_until', key: entry.node.key, condition } },
        },
      ),
    ];
  });
}

export const loopRules: readonly LintRule[] = [
  controlFindings,
  foreverFindings,
  spinFindings,
  commandFindings,
  pollingFindings,
];
