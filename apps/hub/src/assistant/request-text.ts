import type { Role } from '@smarteverything/domain';
import type { StoredAttachment } from '../store/repositories/assistant-chat';

export interface RequestSender {
  readonly profileName: string;
  readonly profileId: string;
  readonly role: Role;
  readonly device: string | null;
}

export interface ChatRequest {
  readonly eventId: string;
  readonly sender: RequestSender;
  readonly text: string;
  readonly files: readonly { readonly file: StoredAttachment; readonly path: string }[];
}

export interface VoiceRequest {
  readonly eventId: string;
  readonly sender: RequestSender;
  readonly task: string;
  readonly said: string | null;
}

function from(sender: RequestSender): string {
  return `from "${sender.profileName}" (profile ${sender.profileId}) · ${sender.role}`;
}

function sizeText(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

function fileLine(entry: ChatRequest['files'][number]): string {
  const { file } = entry;
  const size =
    file.width === null || file.height === null
      ? ''
      : `, ${String(file.width)}×${String(file.height)}`;
  return `- ${file.name} (${file.mime}, ${sizeText(file.bytes)}${size}): ${entry.path}`;
}

export function chatRequestText(request: ChatRequest): string {
  const place = request.sender.device === null ? '' : ` on ${request.sender.device}`;
  const attachments =
    request.files.length === 0
      ? []
      : ['Attached files (read them from these paths):', ...request.files.map(fileLine)];
  return [
    `SmartEverything · chat${place} · ${from(request.sender)}`,
    request.text === '' ? '(no text, only files)' : request.text,
    ...attachments,
    `-> Before using any tool, first acknowledge in one short line with assistant_reply (eventId "${request.eventId}") as a normal reply, not progress, unless you can answer right away without tools. Then answer with assistant_reply with eventId "${request.eventId}". While you work, send short status updates with progress: true; they show under their message in the app.`,
  ].join('\n');
}

export function voiceRequestText(request: VoiceRequest): string {
  const place = request.sender.device ?? 'a device';
  const said = request.said === null ? '' : `\n\nIn their own words: "${request.said}"`;
  return [
    `SmartEverything · voice call on ${place} (spoken; your reply is told out loud) · ${from(request.sender)}`,
    `${request.task}${said}`,
    `-> The voice already told them you are on it, so do not acknowledge. While you work you may send short status updates with assistant_reply (eventId "${request.eventId}", progress: true); they are logged, not spoken. Finish with exactly one assistant_reply with eventId "${request.eventId}" and no progress: it is told to them out loud, so keep it short and speakable.`,
  ].join('\n');
}
