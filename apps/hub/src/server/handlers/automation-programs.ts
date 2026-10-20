import { AUTOMATION_PROGRAM_ENDPOINTS as E } from '@smarteverything/domain';
import type { AutomationPrograms } from '../../automations/service-programs';
import { DONE_REPLY, bound } from '../router';

export const automationProgramRoutes = (programs: AutomationPrograms) =>
  ({
    createAutomationProgram: bound(E.createAutomationProgram, ({ body, caller }) =>
      programs.create(caller, body),
    ),
    updateAutomationProgram: bound(E.updateAutomationProgram, ({ params, body, caller }) =>
      programs.update(caller, params.automationId, body),
    ),
    patchAutomationProgram: bound(E.patchAutomationProgram, ({ params, body, caller }) =>
      programs.patch(caller, params.automationId, body),
    ),
    setAutomationProgramEnabled: bound(E.setAutomationProgramEnabled, ({ params, body }) =>
      programs.setEnabled(params.automationId, body.enabled),
    ),
    checkAutomationProgram: bound(E.checkAutomationProgram, ({ body, caller }) =>
      programs.check(caller, body),
    ),
    removeAutomationProgram: bound(E.removeAutomationProgram, ({ params }) => {
      programs.remove(params.automationId);
      return DONE_REPLY;
    }),
    getAutomationProgramDraft: bound(E.getAutomationProgramDraft, ({ params }) =>
      programs.draft(params.automationId),
    ),
    saveAutomationProgramDraft: bound(E.saveAutomationProgramDraft, ({ params, body }) =>
      programs.saveDraft(params.automationId, body),
    ),
    discardAutomationProgramDraft: bound(E.discardAutomationProgramDraft, ({ params, query }) =>
      programs.discardDraft(params.automationId, query.expectedRevision),
    ),
    publishAutomationProgram: bound(E.publishAutomationProgram, ({ params, body, caller }) =>
      programs.publish(caller, params.automationId, body.expectedRevision),
    ),
    listAutomationProgramRevisions: bound(E.listAutomationProgramRevisions, ({ params }) =>
      programs.revisions(params.automationId),
    ),
    getAutomationProgramRevision: bound(E.getAutomationProgramRevision, ({ params }) =>
      programs.revision(params.automationId, params.revision),
    ),
    compareAutomationProgramRevisions: bound(
      E.compareAutomationProgramRevisions,
      ({ params, query }) => programs.compare(params.automationId, query.from, query.to),
    ),
  }) as const;
