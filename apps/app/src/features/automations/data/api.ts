import type { z } from 'zod';
import {
  AUTOMATION_FUNCTION_ENDPOINTS as F,
  type AUTOMATION_REVISION_ROW,
  AUTOMATION_PROGRAM_ENDPOINTS as P,
  AUTOMATION_QUESTION_ENDPOINTS as Q,
  AUTOMATION_RUN_ENDPOINTS as R,
  AUTOMATION_SECRET_ENDPOINTS as S,
  type AutomationDecision,
  type AutomationFunctionCallersReply,
  type AutomationFunctionDetail,
  type AutomationFunctionExtractReply,
  type AutomationFunctionReply,
  type AutomationFunctionSummary,
  type AutomationProgramComparison,
  type AutomationProgramDraftView,
  type AutomationProgramPatchReply,
  type AutomationProgramReply,
  type AutomationProgramRevisionSummary,
  type AutomationQuestion,
  type AutomationRunNodesPage,
  type AutomationRunStartReply,
  type AutomationRunSummary,
  type AutomationRunView,
  type AutomationSecretEntry,
  type AutomationTestsRunReply,
  type StoredTest,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';

type BodyOf<T extends { readonly body: z.ZodType }> = z.input<T['body']>;

export type ProgramCreateBody = BodyOf<typeof P.createAutomationProgram>;
export type PatchOps = BodyOf<typeof P.patchAutomationProgram>['ops'];
export type ProgramUpdateBody = BodyOf<typeof P.updateAutomationProgram>;
export type ProgramCheckBody = BodyOf<typeof P.checkAutomationProgram>;
export type DraftSaveBody = BodyOf<typeof P.saveAutomationProgramDraft>;
export type FunctionCreateBody = BodyOf<typeof F.createAutomationFunction>;
export type FunctionSaveBody = BodyOf<typeof F.saveAutomationFunction>;
export type FunctionCallersBody = BodyOf<typeof F.updateAutomationFunctionCallers>;
export type FunctionExtractBody = BodyOf<typeof F.extractAutomationFunction>;
export type RunStartBody = BodyOf<typeof R.startProgramRun>;
export interface RunNodesQuery {
  readonly after?: number;
  readonly limit?: number;
  readonly nodeId?: string;
  readonly iteration?: number;
}
export type TestBody = BodyOf<typeof R.createProgramTest>;
export type SecretBody = BodyOf<typeof S.setAutomationSecret>;
export type RevisionRow = z.infer<typeof AUTOMATION_REVISION_ROW>;

export function createProgram(body: ProgramCreateBody): Promise<AutomationProgramReply> {
  return api().call(P.createAutomationProgram, { body });
}

export function updateProgram(
  automationId: string,
  body: ProgramUpdateBody,
): Promise<AutomationProgramReply> {
  return api().call(P.updateAutomationProgram, { params: { automationId }, body });
}

export function patchProgram(
  automationId: string,
  expectedRevision: number,
  ops: PatchOps,
): Promise<AutomationProgramPatchReply> {
  return api().call(P.patchAutomationProgram, {
    params: { automationId },
    body: { expectedRevision, ops },
  });
}

export function setProgramEnabled(
  automationId: string,
  enabled: boolean,
): Promise<AutomationProgramReply> {
  return api().call(P.setAutomationProgramEnabled, { params: { automationId }, body: { enabled } });
}

export function checkProgram(body: ProgramCheckBody): Promise<AutomationProgramReply> {
  return api().call(P.checkAutomationProgram, { body });
}

export async function removeProgram(automationId: string): Promise<void> {
  await api().call(P.removeAutomationProgram, { params: { automationId } });
}

export function getDraft(automationId: string): Promise<AutomationProgramDraftView> {
  return api().call(P.getAutomationProgramDraft, { params: { automationId } });
}

export function saveDraft(
  automationId: string,
  body: DraftSaveBody,
): Promise<AutomationProgramReply> {
  return api().call(P.saveAutomationProgramDraft, { params: { automationId }, body });
}

export function discardDraft(
  automationId: string,
  expectedRevision: number,
): Promise<AutomationProgramReply> {
  return api().call(P.discardAutomationProgramDraft, {
    params: { automationId },
    query: { expectedRevision },
  });
}

export function publishDraft(
  automationId: string,
  expectedRevision: number,
): Promise<AutomationProgramReply> {
  return api().call(P.publishAutomationProgram, {
    params: { automationId },
    body: { expectedRevision },
  });
}

export function listRevisions(automationId: string): Promise<AutomationProgramRevisionSummary[]> {
  return api().call(P.listAutomationProgramRevisions, { params: { automationId } });
}

export function getRevision(automationId: string, revision: number): Promise<RevisionRow> {
  return api().call(P.getAutomationProgramRevision, {
    params: { automationId, revision: String(revision) },
  });
}

export function compareRevisions(
  automationId: string,
  from: number,
  to: number | 'draft',
): Promise<AutomationProgramComparison> {
  return api().call(P.compareAutomationProgramRevisions, {
    params: { automationId },
    query: { from, to },
  });
}

export function listFunctions(): Promise<AutomationFunctionSummary[]> {
  return api().call(F.listAutomationFunctions, {});
}

export function getFunction(functionId: string): Promise<AutomationFunctionDetail> {
  return api().call(F.getAutomationFunction, { params: { functionId } });
}

export function createFunction(body: FunctionCreateBody): Promise<AutomationFunctionReply> {
  return api().call(F.createAutomationFunction, { body });
}

export function saveFunction(
  functionId: string,
  body: FunctionSaveBody,
): Promise<AutomationFunctionReply> {
  return api().call(F.saveAutomationFunction, { params: { functionId }, body });
}

export function updateFunctionCallers(
  functionId: string,
  body: FunctionCallersBody,
): Promise<AutomationFunctionCallersReply> {
  return api().call(F.updateAutomationFunctionCallers, { params: { functionId }, body });
}

export function extractFunction(
  body: FunctionExtractBody,
): Promise<AutomationFunctionExtractReply> {
  return api().call(F.extractAutomationFunction, { body });
}

export async function removeFunction(functionId: string): Promise<void> {
  await api().call(F.removeAutomationFunction, { params: { functionId } });
}

export function startRun(body: RunStartBody): Promise<AutomationRunStartReply> {
  return api().call(R.startProgramRun, { body });
}

export function listRuns(
  automationId: string | undefined,
  limit?: number,
): Promise<AutomationRunSummary[]> {
  return api().call(R.listProgramRuns, {
    query: {
      ...(automationId === undefined ? {} : { automationId }),
      ...(limit === undefined ? {} : { limit }),
    },
  });
}

export function readRun(runId: string): Promise<AutomationRunView> {
  return api().call(R.readProgramRun, { params: { runId } });
}

export function readRunNodes(runId: string, query: RunNodesQuery): Promise<AutomationRunNodesPage> {
  return api().call(R.readProgramRunNodes, { params: { runId }, query });
}

export function stopRun(runId: string): Promise<AutomationRunSummary> {
  return api().call(R.stopProgramRun, { params: { runId } });
}

export async function stopRuns(automationId: string, key?: string): Promise<number> {
  const reply = await api().call(R.stopProgramRuns, {
    body: { automationId, ...(key === undefined ? {} : { key }) },
  });
  return reply.stopped;
}

export function listQuestions(): Promise<AutomationQuestion[]> {
  return api().call(Q.listAutomationQuestions, {});
}

export function answerQuestion(questionId: string, answer: string): Promise<AutomationQuestion> {
  return api().call(Q.answerAutomationQuestion, { params: { questionId }, body: { answer } });
}

export function listDecisions(automationId: string): Promise<AutomationDecision[]> {
  return api().call(R.listProgramDecisions, { params: { automationId }, query: {} });
}

export function listTests(automationId: string): Promise<StoredTest[]> {
  return api().call(R.listProgramTests, { params: { automationId } });
}

export function createTest(automationId: string, body: TestBody): Promise<StoredTest> {
  return api().call(R.createProgramTest, { params: { automationId }, body });
}

export function saveTest(
  automationId: string,
  testId: string,
  body: TestBody,
): Promise<StoredTest> {
  return api().call(R.saveProgramTest, { params: { automationId, testId }, body });
}

export async function removeTest(automationId: string, testId: string): Promise<void> {
  await api().call(R.removeProgramTest, { params: { automationId, testId } });
}

export function runTests(automationId: string): Promise<AutomationTestsRunReply> {
  return api().call(R.runProgramTests, { params: { automationId } });
}

export function listSecrets(): Promise<AutomationSecretEntry[]> {
  return api().call(S.listAutomationSecrets, {});
}

export function setSecret(body: SecretBody): Promise<AutomationSecretEntry> {
  return api().call(S.setAutomationSecret, { body });
}

export async function removeSecret(secretId: string): Promise<void> {
  await api().call(S.removeAutomationSecret, { params: { secretId } });
}
