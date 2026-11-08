import {
  JSON_VALUE,
  PHONE_ACTION,
  PHONE_ACTION_RESULT,
  type JsonValue,
  type PhoneAction,
} from '@smarteverything/domain';
import type { Checked } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import type { ToolHub } from '../../ai-tools/tool-hub';
import { currentExecutionAuthority } from '../../assistant/turn-authority';
import type { Store } from '../../store/store';
import { effectFailure } from '../effect-failure';
import { invalid, outputs, parsed } from '../engine-v3-effects';
import { PERSON_REF } from '../world-v3/refs';
import { modeOf } from './action-mode';
import { deliver } from './deliver';
import type { EffectHandler, EffectHandlers } from './effect-run';
import { IntegrationError } from './integration-error';
import { runDeviceOperation } from './device-operation';

export interface PhoneEffectPorts {
  readonly store: Store;
  readonly tools: Pick<ToolHub, 'check' | 'call'>;
  readonly ownerProfileId: () => string;
}

const ID = z.string().min(1);

const PHONE = z.union([ID, z.strictObject({ phone: ID }).transform((ref) => ref.phone)]);

const PERSON = z.union([ID, PERSON_REF]);

const RING_PARAMS = z.object({
  phone: PHONE.optional(),
  person: PERSON.optional(),
  on: z.boolean().default(true),
});

const SOUND_PARAMS = z.object({
  phone: PHONE,
  ringer: z.enum(['normal', 'vibrate', 'silent']).optional(),
  dnd: z.boolean().optional(),
  stream: z.enum(['media', 'ring', 'alarm', 'notification']).optional(),
  volume: z.number().optional(),
});

const MEDIA_PARAMS = z.object({
  phone: PHONE,
  key: z.enum(['play', 'pause', 'next', 'previous', 'seek']),
  position: z.number().optional(),
});

const OPEN_PARAMS = z.object({
  phone: PHONE,
  what: z.enum(['url', 'app', 'settings']),
  url: ID.optional(),
  label: ID.optional(),
  app: ID.optional(),
  page: ID.optional(),
});

const FLASHLIGHT_PARAMS = z.object({
  phone: PHONE,
  mode: z.enum(['on', 'off', 'toggle']),
  level: z.number().optional(),
});

const SCREEN_PARAMS = z.object({
  phone: PHONE,
  action: z.enum(['lock', 'show_unlock', 'brightness', 'auto_brightness', 'timeout']),
  brightness: z.number().optional(),
  auto: z.boolean().optional(),
  timeout: z.coerce.number().optional(),
});

const TOGGLE_PARAMS = z.object({
  phone: PHONE,
  setting: ID,
  on: z.boolean().default(true),
});

type Candidate = Readonly<Record<string, JsonValue>>;

type Wanted = readonly Candidate[] | string;

interface Targets {
  readonly phone?: string | undefined;
  readonly person?: string | undefined;
}

interface Spec<T extends Targets> {
  readonly schema: z.ZodType<T>;
  readonly actions: (ask: T) => Wanted;
}

function ringActions(ask: z.infer<typeof RING_PARAMS>): Wanted {
  if ((ask.phone === undefined) === (ask.person === undefined)) {
    return 'Give a phone or a person to ring, not both and not neither.';
  }
  return [{ type: 'ring', on: ask.on }];
}

function soundActions(ask: z.infer<typeof SOUND_PARAMS>): Wanted {
  const wanted: Candidate[] = [];
  if (ask.ringer !== undefined) wanted.push({ type: 'set_ringer', mode: ask.ringer });
  if (ask.dnd !== undefined) wanted.push({ type: 'set_dnd', on: ask.dnd });
  if ((ask.stream === undefined) !== (ask.volume === undefined)) {
    return 'Choose both the sound and the volume to change it.';
  }
  if (ask.stream !== undefined && ask.volume !== undefined) {
    wanted.push({ type: 'set_volume', stream: ask.stream, percent: ask.volume });
  }
  return wanted.length === 0 ? 'Choose a ringer mode, do not disturb or a volume.' : wanted;
}

function mediaActions(ask: z.infer<typeof MEDIA_PARAMS>): Wanted {
  if (ask.key !== 'seek') return [{ type: 'media', key: ask.key }];
  return ask.position === undefined
    ? 'Choose where to jump to.'
    : [{ type: 'seek', positionMs: ask.position }];
}

function linkLabel(url: string): string {
  const host = URL.canParse(url) ? new URL(url).hostname : '';
  return host === '' ? url : host;
}

function openActions(ask: z.infer<typeof OPEN_PARAMS>): Wanted {
  if (ask.what === 'url') {
    return ask.url === undefined
      ? 'Give the link to open.'
      : [{ type: 'open_url', url: ask.url, label: ask.label ?? linkLabel(ask.url) }];
  }
  if (ask.what === 'app') {
    return ask.app === undefined
      ? 'Choose the app to open.'
      : [{ type: 'launch_app', app: ask.app }];
  }
  return ask.page === undefined
    ? 'Choose the settings page to open.'
    : [{ type: 'open_settings', page: ask.page }];
}

function flashlightActions(ask: z.infer<typeof FLASHLIGHT_PARAMS>): Wanted {
  if (ask.mode === 'on' && ask.level !== undefined) {
    return [{ type: 'set_flashlight_level', percent: ask.level }];
  }
  return [{ type: 'flashlight', mode: ask.mode }];
}

function screenActions(ask: z.infer<typeof SCREEN_PARAMS>): Wanted {
  switch (ask.action) {
    case 'lock':
      return [{ type: 'lock' }];
    case 'show_unlock':
      return [{ type: 'show_unlock' }];
    case 'brightness':
      return ask.brightness === undefined
        ? 'Give the brightness to set.'
        : [{ type: 'set_brightness', percent: ask.brightness }];
    case 'auto_brightness':
      return ask.auto === undefined
        ? 'Choose whether auto brightness is on.'
        : [{ type: 'set_auto_brightness', on: ask.auto }];
    case 'timeout':
      return ask.timeout === undefined
        ? 'Choose how long the screen stays on.'
        : [{ type: 'set_timeout', seconds: ask.timeout }];
  }
}

function toggleActions(ask: z.infer<typeof TOGGLE_PARAMS>): Wanted {
  return [{ type: 'set_system_toggle', setting: ask.setting, on: ask.on }];
}

function phoneOf(store: Store, id: string): string {
  const device = store.devices.find(id);
  if (device === undefined)
    throw new IntegrationError('NotFound', 'That phone is not in the home.');
  if (device.kind !== 'phone')
    throw new IntegrationError('Invalid', `${device.name} is not a phone.`);
  return device.id;
}

function phonesOf(store: Store, targets: Targets): readonly string[] {
  if (targets.phone !== undefined) return [phoneOf(store, targets.phone)];
  const person = targets.person;
  const owned = store.devices
    .list()
    .filter((device) => device.kind === 'phone' && device.details['profileId'] === person);
  if (owned.length === 0) throw new IntegrationError('NotFound', 'That person has no phone.');
  return owned.map((device) => device.id);
}

function refusalOf(answer: JsonValue): string | null {
  const reply = PHONE_ACTION_RESULT.safeParse(answer);
  return reply.success && !reply.data.ok ? reply.data.detail : null;
}

export async function sendPhoneAction(
  ports: Pick<PhoneEffectPorts, 'tools' | 'ownerProfileId'>,
  phone: string,
  action: PhoneAction,
): Promise<void> {
  const profileId = currentExecutionAuthority()?.profile_id ?? ports.ownerProfileId();
  const answer = await runDeviceOperation(
    ports.tools,
    {
      operation: 'runPhoneAction',
      args: { deviceId: phone, body: JSON_VALUE.parse(action) },
      profileId,
    },
    { plugin: null },
  );
  const refusal = refusalOf(answer);
  if (refusal !== null) throw new IntegrationError('Refused', refusal, 'phone_refused');
}

function actionsOf(wanted: readonly Candidate[]): Checked<readonly PhoneAction[]> {
  const actions: PhoneAction[] = [];
  for (const candidate of wanted) {
    const checked = parsed(PHONE_ACTION, candidate);
    if (!checked.ok) return checked;
    actions.push(checked.value);
  }
  return { ok: true, value: actions };
}

function phoneNode<T extends Targets>(ports: PhoneEffectPorts, spec: Spec<T>): EffectHandler {
  return async (params, request, run) => {
    const checked = parsed(spec.schema, params);
    if (!checked.ok) return checked;
    const wanted = spec.actions(checked.value);
    if (typeof wanted === 'string') return invalid(wanted);
    const planned = actionsOf(wanted);
    if (!planned.ok) return planned;
    try {
      const phones = phonesOf(ports.store, checked.value);
      await deliver({
        kind: request.kind,
        mode: modeOf(request),
        run,
        work: () =>
          Promise.all(
            phones.flatMap((phone) =>
              planned.value.map((action) => sendPhoneAction(ports, phone, action)),
            ),
          ),
      });
      return { ok: true, value: outputs({ ok: true }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function phoneEffects(ports: PhoneEffectPorts): EffectHandlers {
  return {
    'phone.ring': phoneNode(ports, { schema: RING_PARAMS, actions: ringActions }),
    'phone.sound': phoneNode(ports, { schema: SOUND_PARAMS, actions: soundActions }),
    'phone.media': phoneNode(ports, { schema: MEDIA_PARAMS, actions: mediaActions }),
    'phone.open': phoneNode(ports, { schema: OPEN_PARAMS, actions: openActions }),
    'phone.flashlight': phoneNode(ports, { schema: FLASHLIGHT_PARAMS, actions: flashlightActions }),
    'phone.screen': phoneNode(ports, { schema: SCREEN_PARAMS, actions: screenActions }),
    'phone.toggle': phoneNode(ports, { schema: TOGGLE_PARAMS, actions: toggleActions }),
  };
}
