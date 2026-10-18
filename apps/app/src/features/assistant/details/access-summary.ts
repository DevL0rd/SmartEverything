import type { AiChatRow, AiHarnessPermission } from '@smarteverything/domain';
import {
  claudePermissionLabel,
  codexAccessLabel,
  codexApprovalLabel,
  harnessPermissionLabel,
} from '../provider/permission-labels';
import { toolsLabel } from './tools-model';

export function accessSummary(chat: AiChatRow, session: AiHarnessPermission | null): string {
  const engine = chat.engine;
  switch (engine.kind) {
    case 'dsh':
      return harnessPermissionLabel(session ?? engine.permission);
    case 'claude':
      return claudePermissionLabel(engine.settings);
    case 'codex':
      return `${codexAccessLabel(engine.settings.sandbox_policy)} · ${codexApprovalLabel(engine.settings.approval_policy)}`;
    case 'openrouter':
      return toolsLabel(chat);
  }
}
