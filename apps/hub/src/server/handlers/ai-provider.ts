import {
  API_ENDPOINTS as E,
  ApiError,
  JSON_VALUE,
  ENGINE_WRITE,
  CODEX_PROVIDER_CONTROL,
  CODEX_PROVIDER_READ_QUERY,
  CODEX_ANSWER,
  type AiChatRow,
  type ProviderControl,
} from '@smarteverything/domain';
import type { ServerContext } from '../context';
import { roleOfCaller, profileIdOf, type Caller } from '../auth';
import { bound, DONE_REPLY } from '../router';
import type { ComputerRunner } from '../../assistant/engines/computer/runner';
import { runtimeValue } from '../../assistant/engines/computer/request';
import type { EngineSelections } from '../../assistant/engine-selections';
import { admitChatExecution, admitNativeEngine } from '../../assistant/native-helpers';
import { computerEngine } from '../../assistant/engine-kind';

const MODEL_PARAMS = 'modelId';
function selections(context: ServerContext): EngineSelections {
  if (context.assistant.selections === null)
    throw new ApiError('conflict', 'Computer AI engines are starting.');
  return context.assistant.selections;
}

async function owned(
  context: ServerContext,
  caller: Caller,
  chatId: string,
): Promise<{ readonly chat: AiChatRow; readonly runner: ComputerRunner }> {
  const chat = await context.assistant.chats.own(
    { profileId: profileIdOf(caller), role: roleOfCaller(caller) },
    chatId,
  );
  admitChatExecution(chat);
  const computer = computerEngine(chat.engine);
  const runner =
    computer === null ? undefined : context.assistant.computerProviders.get(computer.kind);
  if (runner === undefined)
    throw new ApiError('invalid_request', 'This chat has no connected subscription provider.');
  return { chat, runner };
}

const engineRoutes = (context: ServerContext) =>
  ({
    ...runtimePreferenceRoute(context),
    readAiEngineCatalogue: bound(E.readAiEngineCatalogue, ({ caller }) =>
      selections(context).catalogue(profileIdOf(caller), roleOfCaller(caller)),
    ),
    readAiEngineDefault: bound(E.readAiEngineDefault, ({ caller }) => {
      const engine = context.store.live.engineDefaults.read();
      return { engine: roleOfCaller(caller) === 'owner' && engine?.kind === 'dsh' ? engine : null };
    }),
    updateAiEngineDefault: bound(E.updateAiEngineDefault, async ({ body, caller }) => {
      const engine =
        body.engine === null ? null : selections(context).select(profileIdOf(caller), body.engine);
      if (engine !== null) {
        admitNativeEngine(engine, false);
        selections(context).validate(engine, {
          role: roleOfCaller(caller),
          profileId: profileIdOf(caller),
        });
      }
      return { engine: await context.store.live.engineDefaults.update(engine) };
    }),
    updateAiEnginePreference: bound(E.updateAiEnginePreference, async ({ params, body }) => {
      const model = params[MODEL_PARAMS];
      const settings = context.store.live.computers
        .aiModels(body.device_id)
        .find((entry) => entry.id === model);
      if (settings === undefined)
        throw new ApiError(
          'invalid_request',
          'This model has not been discovered on the chosen computer.',
        );
      return await context.store.host.call('aiProvider', 'prefer', model, body.device_id);
    }),
  }) as const;

const runtimePreferenceRoute = (context: ServerContext) =>
  ({
    updateAiRuntimeEnginePreference: bound(
      E.updateAiRuntimeEnginePreference,
      async ({ params, body }) => {
        const model = context.store.live.computers
          .runtimeModels({ device_id: body.device_id, runtime: params.runtime })
          .find((entry) => entry.id === params.modelId);
        if (model === undefined)
          throw new ApiError(
            'invalid_request',
            'This model has not been discovered on that computer and runtime.',
          );
        return await context.store.host.call(
          'aiRuntimeProvider',
          'prefer',
          params.runtime,
          params.modelId,
          body.device_id,
        );
      },
    ),
  }) as const;

export const aiProviderRoutes = (context: ServerContext) =>
  ({
    ...engineRoutes(context),
    readAiChatProvider: bound(E.readAiChatProvider, async ({ params, caller }) => {
      const { chat, runner } = await owned(context, caller, params.chatId);
      return runner.state.metadata(chat);
    }),
    ...providerReadRoute(context),
    ...providerControlRoute(context),
    answerAiChatProvider: bound(E.answerAiChatProvider, async ({ params, body, caller }) => {
      const { chat, runner } = await owned(context, caller, params.chatId);
      if ('runtime' in body) {
        if (chat.engine.kind !== 'codex')
          throw new ApiError('conflict', 'Prompt answer runtime disagrees with this chat.');
        await runner.state.answer(chat, params.promptId, CODEX_ANSWER.parse(body.answer));
      } else {
        if (chat.engine.kind !== 'claude')
          throw new ApiError('conflict', 'Codex prompt answers require an explicit runtime.');
        await runner.state.answer(chat, params.promptId, body);
      }
      return DONE_REPLY;
    }),
  }) as const;

const providerReadRoute = (context: ServerContext) =>
  ({
    readAiChatProviderState: bound(E.readAiChatProviderState, async ({ params, body, caller }) => {
      const { chat, runner } = await owned(context, caller, params.chatId);
      const state = await runner.state.bound(chat);
      if ('runtime' in body) {
        if (chat.engine.kind !== 'codex')
          throw new ApiError('conflict', 'Provider read runtime disagrees with this chat.');
        const query = CODEX_PROVIDER_READ_QUERY.parse(body.query);
        await runner.state.assertSession(
          chat,
          'session_id' in query ? query.session_id : undefined,
        );
        return runtimeValue(
          context.computerAi,
          { device_id: state.device_id, runtime: 'codex' },
          {
            runtime: 'codex',
            request: { operation: 'provider_read', job_id: state.job_id, query },
          },
          JSON_VALUE,
        );
      }
      if (chat.engine.kind !== 'claude')
        throw new ApiError('conflict', 'The Codex provider requires a runtime-tagged read.');
      await runner.state.assertSession(chat, 'session_id' in body ? body.session_id : undefined);
      return context.computerAi.request(
        state.device_id,
        { operation: 'provider_read', job_id: state.job_id, query: body },
        JSON_VALUE,
      );
    }),
  }) as const;

const providerControlRoute = (context: ServerContext) =>
  ({
    controlAiChatProvider: bound(E.controlAiChatProvider, async ({ params, body, caller }) => {
      const { chat, runner } = await owned(context, caller, params.chatId);
      if ('runtime' in body) {
        if (chat.engine.kind !== 'codex')
          throw new ApiError('conflict', 'Provider control runtime disagrees with this chat.');
        const control = CODEX_PROVIDER_CONTROL.parse(body.control);
        if (control.action === 'set_model' || control.action === 'set_options') {
          const engine =
            control.action === 'set_model'
              ? { ...chat.engine, model: control.model, effort: control.effort }
              : { ...chat.engine, settings: control.options };
          await context.assistant.updateChat(
            { profileId: chat.profile_id, role: 'owner' },
            chat.id,
            { engine },
          );
          return { updated: true };
        }
        return runner.control(chat, control);
      }
      if (chat.engine.kind !== 'claude')
        throw new ApiError('conflict', 'The Codex provider requires a runtime-tagged control.');
      validateControl(context, chat, body);
      const result = await runner.control(chat, body);
      await persistControl(context, chat, body);
      return result;
    }),
  }) as const;

function validateControl(context: ServerContext, chat: AiChatRow, control: ProviderControl): void {
  if (chat.engine.kind !== 'claude')
    throw new ApiError('conflict', 'This chat has a different engine.');
  const engine = changedEngine(context, chat, control);
  if (engine !== null) {
    selections(context).validate(engine, { role: 'owner', profileId: chat.profile_id });
  }
}

async function persistControl(
  context: ServerContext,
  chat: AiChatRow,
  control: ProviderControl,
): Promise<void> {
  if (chat.engine.kind !== 'claude') return;
  const engine = changedEngine(context, chat, control);
  if (engine !== null) await context.store.host.call('aiChats', 'update', chat.id, { engine });
}

function changedEngine(
  context: ServerContext,
  chat: AiChatRow,
  control: ProviderControl,
): AiChatRow['engine'] | null {
  if (chat.engine.kind !== 'claude') return null;
  if (control.action === 'set_model') return { ...chat.engine, model: control.model };
  if (control.action === 'set_permission_mode')
    return { ...chat.engine, settings: { ...chat.engine.settings, permission_mode: control.mode } };
  if (control.action === 'set_mcp_servers')
    return { ...chat.engine, settings: { ...chat.engine.settings, mcp_servers: control.servers } };
  if (control.action !== 'apply_flags' && control.action !== 'update_settings') return null;
  return flagEngine(context, chat.engine, control);
}

function flagEngine(
  context: ServerContext,
  engine: Extract<AiChatRow['engine'], { kind: 'claude' }>,
  control: Extract<ProviderControl, { action: 'apply_flags' | 'update_settings' }>,
): AiChatRow['engine'] {
  const effort = control.values['effortLevel'];
  const fast = control.values['fastMode'];
  const { fast: previousFast, ...settings } = engine.settings;
  const mirroredFast = typeof fast === 'boolean' ? fast : previousFast;
  const fastSettings = fast === null || mirroredFast === undefined ? {} : { fast: mirroredFast };
  return ENGINE_WRITE.parse({
    ...engine,
    ...(typeof effort === 'string' || effort === null ? { effort } : {}),
    settings: {
      ...settings,
      ...fastSettings,
      ...(control.action === 'apply_flags'
        ? {
            flag_settings: {
              ...context.computerAi.status(engine.device_id).settings.provider.options
                .flag_settings,
              ...engine.settings.flag_settings,
              ...control.values,
            },
          }
        : {}),
    },
  });
}
