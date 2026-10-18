import type { ReactNode } from 'react';
import type { AiChatRow, Engine } from '@smarteverything/domain';
import { AccessControl } from '../access/access-control';
import {
  accessFootnoteText,
  rowKey,
  type AccessBanner,
  type AccessModel,
  type AccessSectionView,
} from '../access/access-model';
import { accessPill, type AccessSelection } from '../access/ai-access';
import { claudeChange, claudeSections, codexChange, codexSections } from '../access/native-access';
import { useIsOwner } from '../../../store/selectors';
import { useChatProvider, useEngineCatalogue, useProviderControl } from '../provider/provider-data';
import { useProviderWorking } from '../provider/provider-working';
import type { ComputerEngine } from '../provider/computer-engine';
import { stopChat } from './chat-actions';
import { background } from '@smarteverything/logging';

const OWNER_ONLY = 'Only the owner can change access on this computer.';
const PENDING: AccessBanner = { icon: 'loader', text: 'Changing access…', action: null };

interface Props {
  readonly engine: ComputerEngine;
  readonly onChange: (engine: Engine) => void;
  readonly chat?: AiChatRow;
}

export function NativePermissionControl(props: Props): ReactNode {
  return props.chat === undefined ? (
    <NativePermissions {...props} working={false} />
  ) : (
    <ChatNativePermissions {...props} chat={props.chat} />
  );
}

function ChatNativePermissions(props: Props & { readonly chat: AiChatRow }): ReactNode {
  const working = useProviderWorking(props.chat);
  return <NativePermissions {...props} working={working} />;
}

function NativePermissions(props: Props & { readonly working: boolean }): ReactNode {
  return props.engine.kind === 'claude' ? (
    <ClaudePermissions {...props} engine={props.engine} />
  ) : (
    <CodexPermissions {...props} engine={props.engine} />
  );
}

function useMachineName(engine: ComputerEngine): string {
  const catalogue = useEngineCatalogue();
  const computer = catalogue.data?.computers.find(
    (row) => row.device_id === engine.device_id && row.runtime === engine.kind,
  );
  return computer?.name ?? 'this computer';
}

function nativeModel(input: {
  readonly title: string;
  readonly selection: AccessSelection;
  readonly nextTurn: boolean;
  readonly sections: readonly AccessSectionView[];
  readonly applying: string | null;
  readonly banner: AccessBanner | null;
  readonly footnote: string;
  readonly select: (sectionId: string, value: string) => void;
}): AccessModel {
  return {
    title: input.title,
    pill: accessPill(input.selection),
    nextTurn: input.nextTurn,
    sections: input.sections,
    applying: input.applying,
    blocked: input.banner !== null,
    banner: input.banner,
    footnote: input.footnote,
    tools: null,
    cloud: null,
    select: input.select,
  };
}

function useClaudeLive(
  chat: AiChatRow | undefined,
  owner: boolean,
): { readonly live: boolean; readonly reason: string | undefined } {
  const state = useChatProvider(chat?.id ?? 'draft', chat !== undefined && owner).data;
  const live =
    chat !== undefined &&
    state !== undefined &&
    state.job_id !== null &&
    state.metadata?.operations.includes('set_permission_mode') === true;
  return { live, reason: state?.metadata?.unavailable_operations['set_permission_mode'] };
}

function stopOf(chat: AiChatRow | undefined): (() => void) | null {
  if (chat === undefined) return null;
  return (): void => {
    background(stopChat(chat.id), 'chat.stop_failed');
  };
}

function claudeSelect(
  engine: Extract<Engine, { kind: 'claude' }>,
  live: boolean,
  blocked: boolean,
  actions: {
    readonly control: ReturnType<typeof useProviderControl>;
    readonly onChange: (engine: Engine) => void;
  },
): (sectionId: string, value: string) => void {
  return (_section, value): void => {
    const change = claudeChange(engine, live, value);
    if (blocked || change === null) return;
    if (change.kind === 'engine') actions.onChange(change.engine);
    else actions.control.mutate({ action: 'set_permission_mode', mode: change.mode });
  };
}

function ClaudePermissions({
  engine,
  chat,
  working,
  onChange,
}: Omit<Props, 'engine'> & {
  readonly engine: Extract<Engine, { kind: 'claude' }>;
  readonly working: boolean;
}): ReactNode {
  const owner = useIsOwner();
  const name = useMachineName(engine);
  const { live, reason } = useClaudeLive(chat, owner);
  const control = useProviderControl(chat?.id ?? 'draft');
  const banner = claudeBanner({
    owner,
    applying: applyingMode(control) !== null,
    stuck: working && !live,
    reason,
    stop: stopOf(chat),
  });
  return (
    <AccessControl
      model={nativeModel({
        title: `Access on ${name} · Claude`,
        selection: { kind: 'claude', mode: engine.settings.permission_mode },
        nextTurn: false,
        sections: claudeSections(engine.settings, live),
        applying: applyingMode(control),
        banner,
        footnote: accessFootnoteText('claude', chat !== undefined && !live, false),
        select: claudeSelect(engine, live, banner !== null, { control, onChange }),
      })}
    />
  );
}

function applyingMode(control: ReturnType<typeof useProviderControl>): string | null {
  if (!control.isPending || control.variables.action !== 'set_permission_mode') return null;
  return rowKey('mode', control.variables.mode);
}

function claudeBanner(input: {
  readonly owner: boolean;
  readonly applying: boolean;
  readonly stuck: boolean;
  readonly reason: string | undefined;
  readonly stop: (() => void) | null;
}): AccessBanner | null {
  if (!input.owner) return { icon: 'lock', text: OWNER_ONLY, action: null };
  if (input.applying) return PENDING;
  if (!input.stuck) return null;
  return {
    icon: 'info',
    text: input.reason ?? CLAUDE_STUCK,
    action: input.stop === null ? null : { label: 'Stop', onPress: input.stop },
  };
}

const CLAUDE_STUCK = 'Stop the reply first. Claude can’t change mode while working';

function CodexPermissions({
  engine,
  working,
  onChange,
}: Omit<Props, 'engine'> & {
  readonly engine: Extract<Engine, { kind: 'codex' }>;
  readonly working: boolean;
}): ReactNode {
  const owner = useIsOwner();
  const name = useMachineName(engine);
  const banner: AccessBanner | null = owner
    ? null
    : { icon: 'lock', text: OWNER_ONLY, action: null };
  const select = (sectionId: string, value: string): void => {
    const settings = codexChange(engine, working, sectionId, value);
    if (banner !== null || settings === null) return;
    onChange({ ...engine, settings });
  };
  return (
    <AccessControl
      model={nativeModel({
        title: `Access on ${name} · Codex`,
        selection: {
          kind: 'codex',
          sandbox: engine.settings.sandbox_policy,
          approval: engine.settings.approval_policy,
        },
        nextTurn: working,
        sections: codexSections(engine, working),
        applying: null,
        banner,
        footnote: accessFootnoteText('codex', false, false),
        select,
      })}
    />
  );
}
