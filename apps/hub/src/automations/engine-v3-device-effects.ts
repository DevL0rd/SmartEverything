import { JSON_VALUE, SCENE_ACTIONS } from '@smarteverything/domain';
import type { CommandAction } from '@smarteverything/domain';
import type { Outputs } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import { StoreNotFoundError } from '../store/context';
import type { Store } from '../store/store';
import { stampOf } from './effects/command-metadata';
import type { DeviceToggler } from './effects/device-toggle';
import type { EffectHandler } from './effects/effect-run';
import { runScene } from './effects/scene';
import type { CommandIssuer } from './issue-commands';
import { TARGET_VALUE } from './world-v3/refs';
import { effectFailure } from './effect-failure';

const TOGGLE_PARAMS = z.object({ target: TARGET_VALUE, control: z.string().min(1) });
const SCENE_PARAMS = z.object({ scene: z.string().min(1) });

function outputs(value: unknown): Outputs {
  return z.record(z.string(), JSON_VALUE).parse(JSON.parse(JSON.stringify(value)));
}

function sceneActions(
  store: Pick<Store, 'scenes'>,
  id: string,
): readonly CommandAction[] | undefined {
  try {
    return SCENE_ACTIONS.parse(store.scenes.byId(id).actions);
  } catch (cause) {
    if (cause instanceof StoreNotFoundError) return undefined;
    throw cause;
  }
}

export function toggleHandler(toggler: Pick<DeviceToggler, 'toggle'>): EffectHandler {
  return async (params, request, run) => {
    const checked = TOGGLE_PARAMS.safeParse(params);
    if (!checked.success) {
      return { ok: false, class: 'Invalid', message: z.prettifyError(checked.error) };
    }
    try {
      const { values, sent, skipped, note } = await toggler.toggle(
        { ...checked.data, at: stampOf(request.path) },
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

export function sceneHandler(
  store: Pick<Store, 'scenes'>,
  issuer: Pick<CommandIssuer, 'issue'>,
): EffectHandler {
  return async (params, request, run) => {
    const checked = SCENE_PARAMS.safeParse(params);
    if (!checked.success) {
      return { ok: false, class: 'Invalid', message: z.prettifyError(checked.error) };
    }
    try {
      await runScene(
        issuer,
        {
          sceneId: checked.data.scene,
          actions: sceneActions(store, checked.data.scene),
          at: stampOf(request.path),
        },
        run,
      );
      return { ok: true, value: { ok: true } };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}
