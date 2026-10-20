import type { ReactNode } from 'react';
import { useRef } from 'react';
import { View } from 'react-native';
import type { AiChatRow, Engine } from '@smarteverything/domain';
import { ReasonLine, type ReasonAction } from '../../../components/reason-line';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useComposerGuards } from '../chats/composer-guards';
import { useChatEngineChange } from '../chats/chat-engine-change';
import { EngineAccessoryProvider, useEngineControls } from '../chats/engine-accessories';
import { ModelChip } from '../chats/model-chip';
import { PermissionControl } from '../chats/permission-control';
import { Composer, type ComposerProps, type MessageSender } from '../components/composer';
import { useAreaStatus } from '../data/area-status';
import { useAssistantName } from '../data/assistant-data';
import { resetDraftEngine, useDraftEngine } from '../data/draft-engine';
import { useDraftKeyNeeded, useDraftExecution, useDraftReadiness } from '../data/draft-execution';
import { useDraftRun } from '../data/draft-run';
import { outboxSender } from '../data/outbox';
import { removeUpload } from '../data/uploads';
import { draftStatusOf } from '../model/draft-chat-request';
import { isComputerEngine } from '../provider/computer-engine';
import { useUnsupportedUploads } from '../provider/codex-attachments';
import { useEngineUnavailableReason } from '../provider/engine-availability';
import { useProviderWorking } from '../provider/provider-working';
import { useDraftSender } from '../chats/draft-chat-start';
import type { Delivered, QuickAskDelivery } from './quick-ask-delivery';
import {
  addKeyFix,
  chatPanel,
  draftPanel,
  engineFixes,
  panelAction,
  type PanelDestination,
} from './quick-ask-fixes';
import { newChatReason } from './quick-ask-model';

export const QUICK_ASK_DRAFT_KEY = 'quick-ask';

const READ_ONLY_REASON = 'Only the owner can work in this computer chat.';

export interface TargetProps {
  readonly delivery: QuickAskDelivery;
  readonly close: () => void;
}

function Frame({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className="gap-2 px-3 pb-2 pt-2">{children}</View>;
}

function useQuickAskGuards(
  chat: AiChatRow,
  readOnly: boolean,
  go: { readonly destination: PanelDestination; readonly close: () => void },
): Pick<
  ComposerProps,
  'attachmentReason' | 'unsupportedUploads' | 'fixes' | 'profileGate' | 'steerable'
> {
  const guards = useComposerGuards(chat, readOnly);
  const unsupported = useUnsupportedUploads(chat);
  return {
    ...guards,
    fixes: {
      engine: readOnly ? [] : engineFixes(chat.engine, go),
      attachment: [
        {
          label: 'Remove unsupported',
          onPress: (): void => {
            unsupported.forEach((upload) => {
              removeUpload(upload.key);
            });
          },
        },
        panelAction('Choose another model', 'model', go),
      ],
    },
  };
}

function useContinueSend(chat: AiChatRow, delivery: QuickAskDelivery): MessageSender {
  const online = useSyncStatus().status === 'live';
  const outbox = outboxSender(chat.id, online);
  return async (text, attachments, references, clientMessageId) => {
    const delivered = delivery.begin();
    const sent = await outbox(text, attachments, references, clientMessageId);
    if (sent) delivered({ chatId: chat.id, title: chat.title, queued: !online });
    return sent;
  };
}

function ContinueFields({
  chat,
  change,
  delivery,
  close,
}: TargetProps & {
  readonly chat: AiChatRow;
  readonly change: (engine: Engine) => void;
}): ReactNode {
  const name = useAssistantName();
  const owner = useIsOwner();
  const unavailable = useEngineUnavailableReason(chat.engine);
  const working = useProviderWorking(chat);
  const readOnly = isComputerEngine(chat.engine) && !owner;
  const guards = useQuickAskGuards(chat, readOnly, { destination: chatPanel(chat.id), close });
  const send = useContinueSend(chat, delivery);
  const offline = useSyncStatus().status === 'interrupted';
  const cardRef = useRef<View>(null);
  return (
    <Frame>
      <View ref={cardRef}>
        <Composer
          disabled={readOnly}
          reason={unavailable ?? (readOnly ? READ_ONLY_REASON : null)}
          {...guards}
          placeholder={`Message ${name}`}
          draftKey={QUICK_ASK_DRAFT_KEY}
          commandChat={chat}
          send={send}
          onSent={close}
          focusOnMount
          offline={offline}
          rightAccessory={
            <ModelChip
              engine={chat.engine}
              onChange={change}
              blocked={readOnly || (isComputerEngine(chat.engine) && working)}
              anchorRef={cardRef}
            />
          }
          accessory={<PermissionControl engine={chat.engine} chat={chat} onChange={change} />}
        />
      </View>
    </Frame>
  );
}

export function ContinueComposer({
  chat,
  delivery,
  close,
}: TargetProps & { readonly chat: AiChatRow }): ReactNode {
  const change = useChatEngineChange(chat);
  const control = useEngineControls(chat.engine, change, chat);
  return (
    <EngineAccessoryProvider value={control}>
      <ContinueFields chat={chat} change={change} delivery={delivery} close={close} />
    </EngineAccessoryProvider>
  );
}

function useNewChatSend(
  engine: Engine,
  execution: ReturnType<typeof useDraftExecution>,
  delivery: QuickAskDelivery,
): { readonly send: MessageSender; readonly failure: string | null } {
  const run = useDraftRun(execution.engine ?? engine);
  const delivered = useRef<Delivered | null>(null);
  const sender = useDraftSender(run.host, {
    resolve: execution.resolve,
    opened: (chatId): void => {
      resetDraftEngine();
      delivered.current?.({ chatId, title: null, queued: false });
    },
  });
  return {
    failure: sender.failure,
    send: (text, attachments, references, clientMessageId): Promise<boolean> => {
      delivered.current = delivery.begin();
      return sender.send(text, attachments, references, clientMessageId);
    },
  };
}

function NewChatFields({
  engine,
  setEngine,
  ready,
  delivery,
  close,
}: TargetProps & {
  readonly engine: Engine;
  readonly setEngine: (engine: Engine) => void;
  readonly ready: boolean;
}): ReactNode {
  const name = useAssistantName();
  const execution = useDraftExecution(engine);
  const keyNeeded = useDraftKeyNeeded(engine);
  const readiness = useDraftReadiness({ engine, ready, execution, needsKey: keyNeeded });
  const offline = newChatReason(useAreaStatus().kind);
  const { send, failure } = useNewChatSend(engine, execution, delivery);
  const cardRef = useRef<View>(null);
  const fixable = offline === null && (ready || readiness.runtimeStopped);
  const engineFixesOf = (): readonly ReasonAction[] => {
    if (!fixable) return [];
    if (keyNeeded && ready) return addKeyFix(close);
    return engineFixes(engine, { destination: draftPanel, close });
  };
  return (
    <Frame>
      {failure === null ? null : <ReasonLine text={failure} icon="circleX" tone="critical" />}
      <View ref={cardRef}>
        <Composer
          disabled={false}
          reason={offline ?? draftStatusOf(readiness)}
          fixes={{ engine: engineFixesOf() }}
          placeholder={`Message ${name}`}
          draftKey={QUICK_ASK_DRAFT_KEY}
          send={send}
          onSent={close}
          focusOnMount
          accessory={<PermissionControl engine={engine} onChange={setEngine} />}
          rightAccessory={<ModelChip engine={engine} onChange={setEngine} anchorRef={cardRef} />}
        />
      </View>
    </Frame>
  );
}

export function NewChatComposer({ delivery, close }: TargetProps): ReactNode {
  const [engine, setEngine, ready] = useDraftEngine();
  const control = useEngineControls(engine, setEngine);
  return (
    <EngineAccessoryProvider value={control}>
      <NewChatFields
        engine={engine}
        setEngine={setEngine}
        ready={ready}
        delivery={delivery}
        close={close}
      />
    </EngineAccessoryProvider>
  );
}
