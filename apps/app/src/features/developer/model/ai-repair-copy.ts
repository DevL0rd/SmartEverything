import type { AiRepairAdmission, AiRepairGroup, AiRepairPage } from '@smarteverything/domain';

type Hold = Extract<AiRepairAdmission, { readonly kind: 'held' }>;

const REPAIR_HOLD: Readonly<Record<Hold['reason'], string>> = {
  origin: 'This error isn’t eligible for AI investigation.',
  evidence: 'The hub no longer has enough information to investigate this error.',
  owner: 'This investigation needs the home owner.',
  unavailable: 'The AI chat is unavailable. Check its selected AI connection.',
  disabled: 'Automatic repair requests are off.',
  busy: 'Another investigation is in progress. Try again when it finishes.',
  budget: 'The current AI spending limits prevent this investigation.',
};

export const AUTOMATIC_HOLD: Readonly<Record<NonNullable<AiRepairPage['automaticHold']>, string>> =
  {
    disabled: 'Automatic repair requests are off. You can still send an error to the AI.',
    unavailable: 'Automatic repair requests are unavailable. Check the selected AI connection.',
  };

const DIAGNOSIS_STATUS: Readonly<Record<NonNullable<AiRepairGroup['progress']>, string>> = {
  queued: 'Investigation queued',
  running: 'Investigation in progress',
  finished: 'Investigation finished',
  failed: 'Investigation failed',
  unavailable: 'Investigation chat unavailable',
};

export function errorTitle(event: string): string {
  const title = event.replace(/[._-]+/gu, ' ');
  return title.slice(0, 1).toUpperCase() + title.slice(1);
}

export function diagnosisStatus(group: AiRepairGroup, failed: boolean): string | undefined {
  if (failed) return 'Couldn’t confirm the request. Try again.';
  const { progress, admission } = group;
  if (progress !== null && progress !== undefined) return DIAGNOSIS_STATUS[progress];
  return admission?.kind === 'held' ? REPAIR_HOLD[admission.reason] : undefined;
}

export function diagnosisChat(group: AiRepairGroup): string | null {
  if (group.progress === 'unavailable') return null;
  const admission = group.admission;
  return admission?.kind === 'queued' || admission?.kind === 'existing' ? admission.chatId : null;
}

export function canDiagnose(group: AiRepairGroup): boolean {
  return group.latestLogId !== null && !isInvestigationActive(group);
}

export function isInvestigationActive(group: AiRepairGroup): boolean {
  return group.progress === 'queued' || group.progress === 'running';
}
