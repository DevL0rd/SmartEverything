import { ApiError } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { effectFailure } from '../../../src/automations/effect-failure';
import { IntegrationError } from '../../../src/automations/effects/integration-error';
import { AutomationRunCancelledError } from '../../../src/automations/effects/run-abort';
import { UnknownSceneError } from '../../../src/automations/effects/scene';
import { ToolActionError } from '../../../src/automations/effects/tool';

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
    });
    expect(effectFailure(new UnknownSceneError('s1'))).toStrictEqual({
      ok: false,
      class: 'NotFound',
      message: 'UnknownSceneError: Scene s1 does not exist in this home.',
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
});
