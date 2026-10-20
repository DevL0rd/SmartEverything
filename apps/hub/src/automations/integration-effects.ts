import { z } from 'zod';
import {
  AUTOMATION_EVENT_SOURCE,
  JSON_VALUE,
  PHONE_ACTION_RESULT,
  type JsonValue,
} from '@smarteverything/domain';
import type { SignalBus } from '../signals/bus';
import type { ToolHub } from '../ai-tools/tool-hub';
import { currentExecutionAuthority, executionRole } from '../assistant/turn-authority';
import type { Clock } from '../clock';
import type { ComputerViewer } from '../computers/computer-access';
import type { AutomationComputersSlot } from './automation-computers';
import type { EffectHandler, EffectHandlers } from './engine-v3-effects';
import { outputs, parsed } from './engine-v3-effects';
import { effectFailure } from './effect-failure';
import type { CameraPictures } from './effects/camera-pictures';
import { runViewer } from './effects/computer';
import { runDeviceOperation } from './effects/device-operation';
import { IntegrationError } from './effects/integration-error';
import type { OneShotModel, OneShotPicture } from './effects/one-shot-model';
import { sendIrButton } from './effects/ir-send';
import { callTool } from './effects/tool';
import type { WebhookReplies } from './effects/webhook-replies';
import { awaitRun } from './effects/run-abort';
import {
  ASK_PARAMS,
  VISION_PARAMS,
  DECIDE_PARAMS,
  SNAPSHOT_PARAMS,
  POWER_PARAMS,
  PHONE_PARAMS,
  HEALTH_PARAMS,
  EMIT_PARAMS,
  RESPOND_PARAMS,
  HEALTH_ANSWER,
  COMPUTER_ANSWER,
} from './integration-params';

export interface IntegrationPorts {
  readonly model: Pick<OneShotModel, 'ask' | 'decide'>;
  readonly pictures: CameraPictures;
  readonly computers: Pick<AutomationComputersSlot, 'current'>;
  readonly tools: Pick<ToolHub, 'check' | 'call'>;
  readonly signals: Pick<SignalBus, 'emit'>;
  readonly replies: Pick<WebhookReplies, 'respond'>;
  readonly clock: Pick<Clock, 'now'>;
  readonly ownerProfileId: () => string;
}

interface Identity {
  readonly profileId: string;
  readonly role: 'owner' | 'member';
}

function identityOf(ports: IntegrationPorts, person: string | undefined): Identity {
  const authority = currentExecutionAuthority();
  const role = authority === undefined ? 'owner' : executionRole(authority);
  const own = authority?.profile_id ?? ports.ownerProfileId();
  if (person !== undefined && person !== own && role !== 'owner') {
    throw new IntegrationError('Forbidden', 'Members can only run AI calls as themselves.');
  }
  return { profileId: person ?? own, role };
}

function viewerOf(): ComputerViewer {
  return runViewer();
}

function aiOutputs(answer: {
  readonly tokens: number;
  readonly costUsd: number;
}): Record<string, JsonValue> {
  return { tokens: answer.tokens, cost: answer.costUsd };
}

function pictures(
  ports: IntegrationPorts,
  ids: readonly string[],
): Promise<readonly OneShotPicture[]> {
  return Promise.all(ids.map((id) => ports.pictures.load(id)));
}

function aiAsk(ports: IntegrationPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(ASK_PARAMS, params);
    if (!checked.ok) return checked;
    const call = checked.value;
    try {
      const identity = identityOf(ports, call.person);
      const answer = await ports.model.ask({
        ...identity,
        automationId: run.automationId,
        system: call.system ?? null,
        prompt: call.prompt,
        pictures: await pictures(ports, call.images ?? []),
        shape: call.shape ?? null,
        tools: call.tools,
        model: call.model ?? null,
        capUsd: call.budget ?? null,
        signal: run.signal,
      });
      return {
        ok: true,
        value: outputs({ text: answer.text, result: answer.result, ...aiOutputs(answer) }),
      };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

async function takeFrom(
  ports: IntegrationPorts,
  camera: string | undefined,
): Promise<{ readonly id: string }> {
  if (camera === undefined)
    throw new IntegrationError('Invalid', 'Give either a picture or a camera.');
  return await ports.pictures.take(camera, 'full');
}

function aiVision(ports: IntegrationPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(VISION_PARAMS, params);
    if (!checked.ok) return checked;
    const call = checked.value;
    try {
      const identity = identityOf(ports, call.person);
      const pictureId = call.image ?? (await takeFrom(ports, call.camera)).id;
      const answer = await ports.model.ask({
        ...identity,
        automationId: run.automationId,
        system: null,
        prompt: call.question,
        pictures: [await ports.pictures.load(pictureId)],
        shape: call.shape ?? null,
        tools: [],
        model: call.model ?? null,
        capUsd: call.budget ?? null,
        signal: run.signal,
      });
      return {
        ok: true,
        value: outputs({ answer: answer.text, result: answer.result, ...aiOutputs(answer) }),
      };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function aiDecide(ports: IntegrationPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(DECIDE_PARAMS, params);
    if (!checked.ok) return checked;
    const call = checked.value;
    try {
      const decision = await ports.model.decide({
        ...identityOf(ports, call.person),
        automationId: run.automationId,
        system: 'Decide the question. Be strict: answer true only when the facts support it.',
        prompt: call.context === undefined ? call.question : `${call.context}\n\n${call.question}`,
        pictures: [],
        model: call.model ?? null,
        capUsd: call.budget ?? null,
        signal: run.signal,
      });
      return {
        ok: true,
        value: outputs({
          answer: decision.answer,
          reason: decision.reason,
          ...aiOutputs(decision),
        }),
      };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function cameraSnapshot(ports: IntegrationPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(SNAPSHOT_PARAMS, params);
    if (!checked.ok) return checked;
    try {
      const taken = await awaitRun(
        ports.pictures.take(checked.value.camera, checked.value.size),
        run,
      );
      return { ok: true, value: outputs({ image: taken.id, at: taken.at }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function computerPower(ports: IntegrationPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(POWER_PARAMS, params);
    if (!checked.ok) return checked;
    try {
      await awaitRun(
        ports.computers
          .current()
          .ask(
            viewerOf(),
            checked.value.computer,
            { verb: 'power', action: checked.value.action },
            COMPUTER_ANSWER,
          ),
        run,
      );
      return { ok: true, value: outputs({ ok: true }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function phoneAction(ports: IntegrationPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(PHONE_PARAMS, params);
    if (!checked.ok) return checked;
    try {
      const identity = identityOf(ports, undefined);
      const answer = await awaitRun(
        runDeviceOperation(
          ports.tools,
          {
            operation: 'runPhoneAction',
            args: { deviceId: checked.value.phone, body: JSON_VALUE.parse(checked.value.action) },
            profileId: identity.profileId,
          },
          { plugin: null },
        ),
        run,
      );
      const refusal = phoneRefusal(answer);
      if (refusal !== null) throw new IntegrationError('Refused', refusal);
      return { ok: true, value: outputs({ ok: true }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function phoneRefusal(answer: JsonValue): string | null {
  const reply = PHONE_ACTION_RESULT.safeParse(answer);
  return reply.success && !reply.data.ok ? reply.data.detail : null;
}

function healthRead(ports: IntegrationPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(HEALTH_PARAMS, params);
    if (!checked.ok) return checked;
    const call = checked.value;
    try {
      const identity = identityOf(ports, undefined);
      const answer = HEALTH_ANSWER.parse(
        await awaitRun(
          callTool(
            ports.tools,
            {
              profileId: identity.profileId,
              tool: 'get_health_latest',
              args: {
                metrics: [call.metric],
                withinDays: call.withinDays,
                personId: call.person,
              },
            },
            { plugin: null },
          ),
          run,
        ),
      );
      const newest = answer.daily
        .filter((row) => row.metric === call.metric)
        .toSorted((left, right) => right.day.localeCompare(left.day))[0];
      return {
        ok: true,
        value: outputs(
          newest === undefined
            ? { found: false }
            : { found: true, value: newest.value, unit: newest.unit, day: newest.day },
        ),
      };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function signalEmit(ports: IntegrationPorts): EffectHandler {
  return (params, _request, run) => {
    const checked = parsed(EMIT_PARAMS, params);
    if (!checked.ok) return Promise.resolve(checked);
    ports.signals.emit({
      source: AUTOMATION_EVENT_SOURCE,
      kind: 'sent',
      subject: null,
      field: checked.value.name,
      value: true,
      previous: null,
      at: ports.clock.now().toISOString(),
      profileId: null,
      data: { ...checked.value.payload, automationId: run.automationId },
    });
    return Promise.resolve({ ok: true, value: outputs({}) });
  };
}

function httpRespond(ports: IntegrationPorts): EffectHandler {
  return (params, _request, run) => {
    const checked = parsed(RESPOND_PARAMS, params);
    if (!checked.ok) return Promise.resolve(checked);
    try {
      const { status, body, headers } = checked.value;
      ports.replies.respond(run.runId, { status, body, headers });
      return Promise.resolve({ ok: true, value: outputs({}) });
    } catch (cause) {
      return Promise.resolve(effectFailure(cause));
    }
  };
}

const IR_PARAMS = z.object({ remote: z.string().min(1), button: z.string().min(1) });

function irSend(ports: IntegrationPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(IR_PARAMS, params);
    if (!checked.ok) return checked;
    try {
      const identity = identityOf(ports, undefined);
      await awaitRun(
        sendIrButton(
          ports.tools,
          { ...checked.value, profileId: identity.profileId },
          { plugin: null },
        ),
        run,
      );
      return { ok: true, value: outputs({ ok: true }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

export function integrationEffects(ports: IntegrationPorts): EffectHandlers {
  return {
    'ai.ask': aiAsk(ports),
    'ai.vision': aiVision(ports),
    'ai.decide': aiDecide(ports),
    'camera.snapshot': cameraSnapshot(ports),
    'computer.power': computerPower(ports),
    'phone.action': phoneAction(ports),
    'health.read': healthRead(ports),
    'device.ir_send': irSend(ports),
    'signal.emit': signalEmit(ports),
    'http.respond': httpRespond(ports),
  };
}
