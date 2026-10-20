import { z } from 'zod';
import type { WaitSpec } from '../compile/plan-parts';
import type { Wait } from '../state/run-state';
import { requestOf } from './core-ops';
import type { Checked, Env, NodeResult, OpOf, Outputs, StepResult } from './frames';
import { present, raise, stay, text } from './frames';
import { evaluate } from './step';
import { resolutionOf } from './wait-resume';
import type { WaitResume } from './wait-resume';
import { TIMED_OUT, pass } from './wait-pass';

type AskSpec = Extract<WaitSpec, { kind: 'answer' }>;

export const ASK_EFFECT = 'notify.ask';

const ASKED = z.object({ notificationId: z.string().min(1) });

function asked(result: NodeResult): string | undefined {
  if (!result.ok) return undefined;
  const parsed = ASKED.safeParse(result.value);
  return parsed.success && !('wait' in result.value) ? parsed.data.notificationId : undefined;
}

function questionOf(env: Env, op: OpOf['wait'], spec: AskSpec): Checked<Outputs> {
  const person = present(evaluate(env, spec.person), `the person of ${op.at.key}`);
  if (!person.ok) return person;
  const question = text(evaluate(env, spec.question), `the question of ${op.at.key}`);
  if (!question.ok) return question;
  return {
    ok: true,
    value: {
      person: person.value,
      question: question.value,
      options: spec.options,
      ...(spec.timeoutMs === undefined ? {} : { timeout: spec.timeoutMs }),
    },
  };
}

export function enterAsk(env: Env, op: OpOf['wait'], spec: AskSpec): StepResult {
  const params = questionOf(env, op, spec);
  if (!params.ok) return raise(env, params);
  return requestOf(env, { at: op.at, retry: 'external', budget: 'effects_person' }, ASK_EFFECT, {
    ...params.value,
  });
}

function parkAnswer(env: Env, op: OpOf['wait'], spec: AskSpec, notificationId: string): StepResult {
  const wait: Wait = {
    kind: 'answer',
    nodePath: env.path,
    durable: op.durable,
    notificationId,
    options: spec.options,
    ...(spec.timeoutMs === undefined ? {} : { deadlineAt: env.now + spec.timeoutMs }),
  };
  return stay(env, { ...env.state, wait }, { kind: 'park', wait });
}

function timedOutOutputs(spec: AskSpec): Outputs {
  return {
    [TIMED_OUT]: true,
    ...(spec.defaultAnswer === undefined ? {} : { answer: spec.defaultAnswer }),
  };
}

function settleResume(env: Env, op: OpOf['wait'], spec: AskSpec, resume: WaitResume): StepResult {
  if (resume.kind === 'timeout') return pass(env, op, timedOutOutputs(spec));
  if (resume.kind !== 'answer') {
    return raise(env, {
      class: 'Invalid',
      message: `${op.at.key} cannot be resumed by ${resume.kind}`,
    });
  }
  if (!spec.options.includes(resume.answer)) {
    return raise(env, {
      class: 'Invalid',
      message: `${op.at.key} was answered with ${resume.answer}, which is not one of its buttons`,
    });
  }
  return pass(env, op, {
    answer: resume.answer,
    [TIMED_OUT]: false,
    ...(resume.by === undefined ? {} : { by: resume.by }),
  });
}

function resumeOf(env: Env, op: OpOf['wait'], result: NodeResult): Checked<WaitResume> {
  const resolution = resolutionOf(env, op, result);
  if (!resolution.ok) return resolution;
  const { wait, resume } = resolution.value;
  if (wait.kind !== 'answer') {
    return {
      ok: false,
      class: 'Invalid',
      message: `${op.at.key} was resumed with a ${wait.kind} wait`,
    };
  }
  return { ok: true, value: resume };
}

export function settleAsk(
  env: Env,
  op: OpOf['wait'],
  spec: AskSpec,
  result: NodeResult,
): StepResult {
  const notificationId = asked(result);
  if (notificationId !== undefined) return parkAnswer(env, op, spec, notificationId);
  const resume = resumeOf(env, op, result);
  return resume.ok ? settleResume(env, op, spec, resume.value) : raise(env, resume);
}
