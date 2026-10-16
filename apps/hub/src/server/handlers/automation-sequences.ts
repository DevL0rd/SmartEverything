import { validateSequenceConsumers } from '../../automations/program';
import { API_ENDPOINTS as E, type AutomationSequenceDefinition } from '@smarteverything/domain';
import type { ToolHub } from '../../ai-tools/tool-hub';
import { validateAutomationProgram } from '../../automations/validate-program';
import type { ServerContext } from '../context';
import { bound, DONE_REPLY, type Bound } from '../router';
import { requireOwnerForAiActions } from './signals';
import { authoredActions, reauthorizationProfile, requireRunnableActions } from './automation';
import type { Caller } from '../auth';

export function automationSequenceRoutes(
  context: ServerContext,
  tools: ToolHub,
): Record<
  | 'listAutomationSequences'
  | 'readAutomationSequence'
  | 'createAutomationSequence'
  | 'updateAutomationSequence'
  | 'removeAutomationSequence'
  | 'startAutomationSequence'
  | 'stopAutomationSequence',
  Bound
> {
  const { store, hub } = context;
  const checked = sequenceValidator(context, tools);
  return {
    listAutomationSequences: bound(E.listAutomationSequences, () =>
      store.automationSequences.list(),
    ),
    readAutomationSequence: bound(E.readAutomationSequence, ({ params }) =>
      store.automationSequences.byId(params.sequenceId),
    ),
    createAutomationSequence: bound(E.createAutomationSequence, ({ body, caller }) =>
      store.automationSequences.create(body.name, checked(body.definition, caller)),
    ),
    updateAutomationSequence: bound(E.updateAutomationSequence, ({ params, body, caller }) =>
      store.automationSequences.update(
        params.sequenceId,
        {
          name: body.name,
          definition: checked(body.definition, caller, params.sequenceId),
          expectedRevision: body.expectedRevision,
        },
        reauthorizationProfile(store, caller),
      ),
    ),
    removeAutomationSequence: bound(E.removeAutomationSequence, ({ params, body }) => {
      store.automationSequences.remove(params.sequenceId, body.expectedRevision);
      return DONE_REPLY;
    }),
    startAutomationSequence: bound(E.startAutomationSequence, ({ params, body }) =>
      hub.startSequence(params.sequenceId, body.parameters),
    ),
    stopAutomationSequence: bound(E.stopAutomationSequence, ({ params, body }) => {
      store.automationSequences.byId(params.sequenceId);
      hub.stopAutomationRuns(params.sequenceId, body.controlKey);
      return DONE_REPLY;
    }),
  };
}

function sequenceValidator(
  context: ServerContext,
  tools: ToolHub,
): (
  definition: AutomationSequenceDefinition,
  caller: Caller,
  id?: string,
) => AutomationSequenceDefinition {
  const { store } = context;
  return (definition, caller, id): AutomationSequenceDefinition => {
    if (id !== undefined) validateSequenceConsumers(store, id, definition);
    const actions = validateAutomationProgram(store, definition.actions, {
      definition,
      ...(id === undefined ? {} : { id }),
    });
    requireOwnerForAiActions(caller, { actions: [...actions] });
    requireRunnableActions(store, tools, { actions: [...actions] });
    return { ...definition, origin: authoredActions(tools, caller, actions) };
  };
}
