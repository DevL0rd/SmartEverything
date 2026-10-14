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
import { bound, DONE_REPLY, type Bound } from '../router';
import type { ComputerRunner } from '../../assistant/engines/computer/runner';
import { runtimeValue } from '../../assistant/engines/computer/request';
import type { EngineSelections } from '../../assistant/engine-selections';

const MODEL_PARAMS = 'modelId';
type ProviderRoutes = Record<
  | 'readAiEngineCatalogue'
  | 'readAiEngineDefault'
  | 'updateAiEngineDefault'
  | 'updateAiEnginePreference'
  | 'updateAiRuntimeEnginePreference'
  | 'readAiChatProvider'
  | 'readAiChatProviderState'
  | 'controlAiChatProvider'
  | 'answerAiChatProvider',
  Bound
>;

function assertOwner(caller: Caller): void {
  if (roleOfCaller(caller) !== 'owner')
    throw new ApiError(
      'forbidden',
      'Only the owner may configure computer AI defaults and supplying machines.',
    );
}

function selections(context: ServerContext): EngineSelections {
  if (context.assistant.selections === null)
    throw new ApiError('conflict', 'Computer AI engines are starting.');
  return context.assistant.selections;
}

function owned(
  context: ServerContext,
  caller: Caller,
  chatId: string,
): { readonly chat: AiChatRow; readonly runner: ComputerRunner } {
  const chat = context.assistant.chats.own(
    { profileId: profileIdOf(context.store, caller), role: roleOfCaller(caller) },
    chatId,
  );
  if (roleOfCaller(caller) !== 'owner')
    throw new ApiError('forbidden', 'Only the owner may read or control native computer work.');
  const runner =
    chat.engine.kind === 'openrouter' || chat.engine.kind === 'dsh'
      ? undefined
      : context.assistant.computerProviders.get(chat.engine.kind);
  if (runner === undefined)
    throw new ApiError('invalid_request', 'This chat has no connected subscription provider.');
  return { chat, runner };
}

function engineRoutes(
  context: ServerContext,
): Pick<
  ProviderRoutes,
  | 'readAiEngineCatalogue'
  | 'readAiEngineDefault'
  | 'updateAiEngineDefault'
  | 'updateAiEnginePreference'
  | 'updateAiRuntimeEnginePreference'
> {
  return {
    ...runtimePreferenceRoute(context),
    readAiEngineCatalogue: bound(E.readAiEngineCatalogue, ({ caller }) =>
      selections(context).catalogue(roleOfCaller(caller)),
    ),
    readAiEngineDefault: bound(E.readAiEngineDefault, ({ caller }) => ({
      engine: roleOfCaller(caller) === 'owner' ? context.store.aiEngineDefaults.read() : null,
    })),
    updateAiEngineDefault: bound(E.updateAiEngineDefault, ({ body, caller }) => {
      assertOwner(caller);
      const engine =
        body.engine === null
          ? null
          : selections(context).select(profileIdOf(context.store, caller), body.engine);
      if (engine !== null) selections(context).validate(engine, roleOfCaller(caller));
      return { engine: context.store.aiEngineDefaults.update(engine) };
    }),
    updateAiEnginePreference: bound(E.updateAiEnginePreference, ({ params, body, caller }) => {
      assertOwner(caller);
      const model = params[MODEL_PARAMS];
      const settings = context.store.computerAi
        .models(body.device_id)
        .find((entry) => entry.id === model);
      if (settings === undefined)
        throw new ApiError(
          'invalid_request',
          'This model has not been discovered on the chosen computer.',
        );
      return context.store.aiProvider.prefer(model, body.device_id);
    }),
  };
}

function runtimePreferenceRoute(
  context: ServerContext,
): Pick<ProviderRoutes, 'updateAiRuntimeEnginePreference'> {
  return {
    updateAiRuntimeEnginePreference: bound(
      E.updateAiRuntimeEnginePreference,
      ({ params, body, caller }) => {
        assertOwner(caller);
        const model = context.store.computerRuntimes
          .models({ device_id: body.device_id, runtime: params.runtime })
          .find((entry) => entry.id === params.modelId);
        if (model === undefined)
          throw new ApiError(
            'invalid_request',
            'This model has not been discovered on that computer and runtime.',
          );
        return context.store.aiRuntimeProvider.prefer(
          params.runtime,
          params.modelId,
          body.device_id,
        );
      },
    ),
  };
}

export function aiProviderRoutes(context: ServerContext): ProviderRoutes {
  return {
    ...engineRoutes(context),
    readAiChatProvider: bound(E.readAiChatProvider, ({ params, caller }) => {
      const { chat, runner } = owned(context, caller, params.chatId);
      return runner.state.metadata(chat);
    }),
    ...providerReadRoute(context),
    ...providerControlRoute(context),
    answerAiChatProvider: bound(E.answerAiChatProvider, async ({ params, body, caller }) => {
      const { chat, runner } = owned(context, caller, params.chatId);
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
  };
}

function providerReadRoute(
  context: ServerContext,
): Pick<ProviderRoutes, 'readAiChatProviderState'> {
  return {
    readAiChatProviderState: bound(E.readAiChatProviderState, ({ params, body, caller }) => {
      const { chat, runner } = owned(context, caller, params.chatId);
      const state = runner.state.bound(chat);
      if ('runtime' in body) {
        if (chat.engine.kind !== 'codex')
          throw new ApiError('conflict', 'Provider read runtime disagrees with this chat.');
        const query = CODEX_PROVIDER_READ_QUERY.parse(body.query);
        runner.state.assertSession(chat, 'session_id' in query ? query.session_id : undefined);
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
      runner.state.assertSession(chat, 'session_id' in body ? body.session_id : undefined);
      return context.computerAi.request(
        state.device_id,
        { operation: 'provider_read', job_id: state.job_id, query: body },
        JSON_VALUE,
      );
    }),
  };
}

function providerControlRoute(
  context: ServerContext,
): Pick<ProviderRoutes, 'controlAiChatProvider'> {
  return {
    controlAiChatProvider: bound(E.controlAiChatProvider, async ({ params, body, caller }) => {
      const { chat, runner } = owned(context, caller, params.chatId);
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
      persistControl(context, chat, body);
      return result;
    }),
  };
}

function validateControl(context: ServerContext, chat: AiChatRow, control: ProviderControl): void {
  if (chat.engine.kind !== 'claude')
    throw new ApiError('conflict', 'This chat has a different engine.');
  const engine = changedEngine(context, chat, control);
  if (engine !== null) selections(context).validate(engine, 'owner');
}

function persistControl(context: ServerContext, chat: AiChatRow, control: ProviderControl): void {
  if (chat.engine.kind !== 'claude') return;
  const engine = changedEngine(context, chat, control);
  if (engine !== null) context.store.aiChats.update(chat.id, { engine });
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
