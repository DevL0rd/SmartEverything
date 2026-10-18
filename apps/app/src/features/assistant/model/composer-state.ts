import type { EngineKind } from '@smarteverything/domain';

export type SendMode = 'idle' | 'send' | 'uploading' | 'stop' | 'queue' | 'steer' | 'blocked';

const STEERING_ENGINES: ReadonlySet<EngineKind> = new Set(['dsh', 'openrouter', 'claude']);

export function engineSteersTurns(kind: EngineKind): boolean {
  return STEERING_ENGINES.has(kind);
}

export interface Quote {
  readonly who: string;
  readonly text: string;
}

export interface SendFacts {
  readonly hasContent: boolean;
  readonly uploading: boolean;
  readonly working: boolean;
  readonly blocked: boolean;
  readonly offline: boolean;
  readonly steerable: boolean;
}

export interface UploadFacts {
  readonly state: 'uploading' | 'done' | 'failed';
  readonly progress: number;
}

export type StatusKind =
  'engine' | 'profile' | 'attachment' | 'failedUpload' | 'uploading' | 'offline';

export interface ComposerStatus {
  readonly kind: StatusKind;
  readonly text: string;
}

export interface StatusFacts {
  readonly engineReason: string | null;
  readonly profileName: string | null;
  readonly attachmentReason: string | null;
  readonly failedUploads: number;
  readonly armedUploads: number;
  readonly offline: boolean;
}

export const OFFLINE_STATUS = 'Offline · Messages send when your hub is back';

const QUOTE_LINES_MAX = 6;

const EXPAND_LINES = 4;

const EXPAND_CHARS = 240;

export function sendModeOf(facts: SendFacts): SendMode {
  if (facts.working && !facts.offline) {
    if (!facts.hasContent || facts.blocked) {
      return 'stop';
    }
    return facts.steerable ? 'steer' : 'queue';
  }
  if (!facts.hasContent) {
    return 'idle';
  }
  if (facts.blocked) {
    return 'blocked';
  }
  return facts.uploading ? 'uploading' : 'send';
}

export function uploadsSummary(uploads: readonly UploadFacts[]): {
  readonly pending: number;
  readonly failed: number;
  readonly progress: number;
} {
  const pending = uploads.filter((upload) => upload.state === 'uploading');
  const total = pending.reduce((sum, upload) => sum + upload.progress, 0);
  return {
    pending: pending.length,
    failed: uploads.filter((upload) => upload.state === 'failed').length,
    progress: pending.length === 0 ? 1 : total / pending.length,
  };
}

function failedUploadsText(count: number): string {
  return count === 1
    ? 'One file didn’t upload. Retry or remove it to send.'
    : `${String(count)} files didn’t upload. Retry or remove them to send.`;
}

function armedText(count: number): string {
  return count === 1
    ? 'Sends when 1 upload finishes'
    : `Sends when ${String(count)} uploads finish`;
}

export function statusOf(facts: StatusFacts): ComposerStatus | null {
  if (facts.engineReason !== null) {
    return { kind: 'engine', text: facts.engineReason };
  }
  if (facts.profileName !== null) {
    return { kind: 'profile', text: `This chat belongs to ${facts.profileName}.` };
  }
  if (facts.attachmentReason !== null) {
    return { kind: 'attachment', text: facts.attachmentReason };
  }
  if (facts.failedUploads > 0) {
    return { kind: 'failedUpload', text: failedUploadsText(facts.failedUploads) };
  }
  if (facts.armedUploads > 0) {
    return { kind: 'uploading', text: armedText(facts.armedUploads) };
  }
  return facts.offline ? { kind: 'offline', text: OFFLINE_STATUS } : null;
}

export function quotedText(text: string, quote: Quote | null): string {
  if (quote === null) {
    return text;
  }
  const lines = quote.text.trim().split('\n').slice(0, QUOTE_LINES_MAX);
  const block = lines.map((line) => `> ${line}`).join('\n');
  return `${block}\n\n${text}`;
}

export interface SendEffects {
  readonly clear: () => void;
  readonly restore: () => void;
  readonly sent: () => void;
}

export async function sendClearing(
  deliver: () => Promise<boolean>,
  effects: SendEffects,
): Promise<void> {
  effects.clear();
  const delivered = await deliver();
  if (delivered) {
    effects.sent();
  } else {
    effects.restore();
  }
}

export type EffortSteps = 1 | 2 | 3;

const EFFORT_STEPS: Readonly<Record<string, EffortSteps>> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Max: 3,
};

export function effortSteps(effort: string | null): EffortSteps | null {
  return effort === null ? null : (EFFORT_STEPS[effort] ?? null);
}

export function queuedLabel(text: string, files: number): string {
  if (text !== '') {
    return text;
  }
  return files === 1 ? '1 file' : `${String(files)} files`;
}

export interface TrayMessage {
  readonly text: string;
  readonly attachments: readonly string[];
  readonly state: 'waiting' | 'failed';
  readonly reason: string | null;
}

export interface TrayRow {
  readonly text: string;
  readonly retry: boolean;
  readonly edit: 'enabled' | 'blocked' | 'absent';
  readonly remove: boolean;
}

export function trayRowOf(
  message: TrayMessage,
  context: { readonly fieldHasText: boolean; readonly delivering: boolean },
): TrayRow {
  const { fieldHasText, delivering } = context;
  const body = queuedLabel(message.text, message.attachments.length);
  if (delivering) {
    return { text: `Sending · “${body}”`, retry: false, edit: 'absent', remove: false };
  }
  const failed = message.state === 'failed';
  const reason = message.reason === null ? '' : ` · ${message.reason}`;
  let edit: TrayRow['edit'] = 'enabled';
  if (message.attachments.length > 0) {
    edit = 'absent';
  } else if (fieldHasText) {
    edit = 'blocked';
  }
  return {
    text: failed ? `Not sent · ${body}${reason}` : `Waiting for connection · “${body}”`,
    retry: failed,
    edit,
    remove: true,
  };
}

export function wantsEditor(text: string): boolean {
  return text.split('\n').length > EXPAND_LINES || text.length > EXPAND_CHARS;
}
