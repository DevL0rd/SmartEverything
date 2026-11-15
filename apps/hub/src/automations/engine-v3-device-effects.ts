import { JSON_VALUE } from '@smarteverything/domain';
import type { Outputs } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import { stampOf } from './effects/command-metadata';
import type { DeviceToggler } from './effects/device-toggle';
import type { EffectHandler } from './effects/effect-run';
import { TARGET_VALUE } from './world-v3/refs';
import { effectFailure } from './effect-failure';
import { modeOf } from './effects/action-mode';

const TOGGLE_PARAMS = z.object({ target: TARGET_VALUE, control: z.string().min(1) });

function outputs(value: unknown): Outputs {
  return z.record(z.string(), JSON_VALUE).parse(JSON.parse(JSON.stringify(value)));
}

export function toggleHandler(toggler: Pick<DeviceToggler, 'toggle'>): EffectHandler {
  return async (params, request, run) => {
    const checked = TOGGLE_PARAMS.safeParse(params);
    if (!checked.success) {
      return { ok: false, class: 'Invalid', message: z.prettifyError(checked.error) };
    }
    try {
      const { values, sent, skipped, note } = await toggler.toggle(
        { ...checked.data, mode: modeOf(request), at: stampOf(request.path) },
        run,
      );
      const value = values[0]?.value;
      return {
        ok: true,
        value: outputs({
          ok: true,
          sent,
          skipped,
          note,
          ...(value === undefined ? {} : { value }),
        }),
      };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}
