import { ApiError } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { effectFailure } from '../../../src/automations/effect-failure';
import { IntegrationError } from '../../../src/automations/effects/integration-error';
import { AutomationRunCancelledError } from '../../../src/automations/effects/run-abort';
import { UnknownSceneError } from '../../../src/automations/effects/scene';
import { CommandNotConfirmedError } from '../../../src/automations/effects/command-confirm';
import { EffectBudgetExceededError } from '../../../src/automations/effects/effect-budget';
import { ToolActionError } from '../../../src/automations/effects/tool';
import {
  ComputerOfflineError,
  ComputerScopeOffError,
} from '../../../src/computers/computer-errors';
import { NodeCallError } from '../../../src/computers/node-calls';

describe('effect failures', () => {
  it('keeps the error class in the text, as the old engine recorded it', () => {
    expect(effectFailure(new ToolActionError('say something: no speaker'))).toStrictEqual({
      ok: false,
      class: 'Failed',
      message: 'ToolActionError: say something: no speaker',
    });
    expect(effectFailure(new ApiError('command_refused', 'skipped members: lamp'))).toStrictEqual({
      ok: false,
      class: 'Refused',
      message: 'ApiError: skipped members: lamp',
      code: 'command_refused',
    });
    expect(effectFailure(new UnknownSceneError('s1'))).toStrictEqual({
      ok: false,
      class: 'NotFound',
      message: 'UnknownSceneError: Scene s1 does not exist in this home.',
      code: 'unknown_scene',
    });
  });

  it('takes the class of an integration error and lets a cancellation through', () => {
    expect(effectFailure(new IntegrationError('Refused', 'switched off'))).toStrictEqual({
      ok: false,
      class: 'Refused',
      message: 'switched off',
    });
    expect(() => effectFailure(new AutomationRunCancelledError('r1'))).toThrow(
      AutomationRunCancelledError,
    );
  });

  it('gives every failure a reason, the real message and the code the source gave', () => {
    expect(
      effectFailure(new IntegrationError('Refused', 'phone said no', 'phone_refused')),
    ).toStrictEqual({
      ok: false,
      class: 'Refused',
      message: 'phone said no',
      code: 'phone_refused',
    });
    expect(effectFailure(new ComputerOfflineError())).toStrictEqual({
      ok: false,
      class: 'Unreachable',
      message: 'ComputerOfflineError: This computer is offline.',
      code: 'offline',
    });
    expect(effectFailure(new ComputerScopeOffError('files'))).toMatchObject({
      class: 'Forbidden',
      code: 'scope_off',
    });
    expect(effectFailure(new NodeCallError('not_supported', 'no such verb'))).toMatchObject({
      class: 'Refused',
      code: 'not_supported',
    });
    expect(effectFailure(new EffectBudgetExceededError(5))).toMatchObject({
      class: 'LimitExceeded',
      code: 'effect_budget',
    });
    expect(effectFailure(new ApiError('camera_privacy_on', 'privacy is on'))).toMatchObject({
      class: 'Refused',
      code: 'camera_privacy_on',
    });
  });

  it('gives a missing confirmation and a timed out call the reason Timeout', () => {
    expect(effectFailure(new CommandNotConfirmedError(['Lamp power']))).toMatchObject({
      class: 'Timeout',
      code: 'not_confirmed',
    });
    expect(effectFailure(new DOMException('took too long', 'TimeoutError'))).toMatchObject({
      class: 'Timeout',
      message: 'TimeoutError: took too long',
    });
  });

  it('keeps an unknown failure as Failed with its real message and no invented code', () => {
    expect(effectFailure(new TypeError('x is not a function'))).toStrictEqual({
      ok: false,
      class: 'Failed',
      message: 'TypeError: x is not a function',
    });
    expect(effectFailure('plain text')).toMatchObject({ class: 'Failed', message: 'plain text' });
  });
});
