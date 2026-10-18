import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { Engine } from '@smarteverything/domain';
import { ReasonLine, type ReasonAction } from '../../../components/reason-line';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useFileDrop } from '../../../platform/file-drop';
import { Composer } from '../components/composer';
import { DropOverlay } from '../components/drop-overlay';
import { useAssistantName } from '../data/assistant-data';
import { resetDraftEngine, useDraftEngine } from '../data/draft-engine';
import { useDraftKeyNeeded, useDraftExecution, useDraftReadiness } from '../data/draft-execution';
import { useDraftRun, type DraftRun } from '../data/draft-run';
import { setDraft } from '../data/drafts';
import { attachFiles } from '../data/uploads';
import {
  useDraftChatStart,
  useDraftSender,
  type DraftChatStart,
  type DraftSender,
} from './draft-chat-start';
import { draftStatusOf } from '../model/draft-chat-request';
import { DraftIntro } from './draft-intro';
import { ModelChip } from './model-chip';
import { PermissionControl } from './permission-control';

const DRAFT_KEY = 'new-chat';

interface DraftScreen {
  readonly engine: Engine;
  readonly setEngine: (engine: Engine) => void;
  readonly loading: boolean;
  readonly status: string | null;
  readonly runtimeStopped: boolean;
  readonly needsKey: boolean;
  readonly run: DraftRun;
  readonly draftChat: DraftChatStart;
  readonly sender: DraftSender;
}

function openMachine(engine: Engine): void {
  router.setParams({ operation: engine.kind === 'dsh' ? 'device' : 'model' });
}

function useDraftScreen(onStarted: (chatId: string) => void): DraftScreen {
  const [engine, setEngine, ready] = useDraftEngine();
  const execution = useDraftExecution(engine);
  const keyNeeded = useDraftKeyNeeded(engine);
  const readiness = useDraftReadiness({ engine, ready, execution, needsKey: keyNeeded });
  const run = useDraftRun(execution.engine ?? engine);
  const actions = {
    resolve: execution.resolve,
    opened: (chatId: string): void => {
      resetDraftEngine();
      onStarted(chatId);
    },
  };
  return {
    engine,
    setEngine,
    loading: !ready,
    status: draftStatusOf(readiness),
    runtimeStopped: readiness.runtimeStopped,
    needsKey: keyNeeded && ready,
    run,
    draftChat: useDraftChatStart(DRAFT_KEY, execution.engine, actions),
    sender: useDraftSender(run.host, actions),
  };
}

export function StartChat({
  onStarted,
}: {
  readonly onStarted: (chatId: string) => void;
}): ReactNode {
  const screen = useDraftScreen(onStarted);
  const ref = useRef<View>(null);
  const [dragging, setDragging] = useState(false);
  useFileDrop(ref, { onFiles: attachFiles, onHover: setDragging });
  const { engine } = screen;
  return (
    <View ref={ref} className="min-h-0 flex-1 justify-between pb-safe-offset-3">
      <View className="flex-1 justify-center">
        <DraftIntro
          run={screen.run}
          loading={screen.loading}
          needsKey={screen.needsKey}
          onSuggest={(text): void => {
            setDraft(DRAFT_KEY, text);
          }}
          onOpenMachine={(): void => {
            openMachine(engine);
          }}
          onChooseComputer={(): void => {
            router.setParams({ operation: 'model' });
          }}
        />
      </View>
      <DraftFooter screen={screen} />
      {dragging ? <DropOverlay /> : null}
    </View>
  );
}

function fixesFor(screen: DraftScreen): readonly ReasonAction[] {
  if ((screen.loading && !screen.runtimeStopped) || screen.needsKey) return [];
  return [
    {
      label: 'Switch machine',
      onPress: (): void => {
        openMachine(screen.engine);
      },
    },
  ];
}

function DraftFooter({ screen }: { readonly screen: DraftScreen }): ReactNode {
  const name = useAssistantName();
  const cardRef = useRef<View>(null);
  const { engine, setEngine, sender } = screen;
  return (
    <View className="w-full max-w-reading gap-2 self-center px-gutter">
      {sender.failure === null ? null : (
        <ReasonLine text={sender.failure} icon="circleX" tone="critical" />
      )}
      <DraftChatPrompt draftChat={screen.draftChat} canStart={screen.status === null} />
      <View ref={cardRef}>
        <Composer
          disabled={false}
          reason={screen.status}
          fixes={{ engine: fixesFor(screen) }}
          placeholder={`Message ${name}`}
          draftKey={DRAFT_KEY}
          send={sender.send}
          focusOnMount
          shortcuts
          accessory={<PermissionControl engine={engine} onChange={setEngine} />}
          rightAccessory={<ModelChip engine={engine} onChange={setEngine} anchorRef={cardRef} />}
        />
      </View>
    </View>
  );
}

function DraftChatPrompt({
  draftChat,
  canStart,
}: {
  readonly draftChat: DraftChatStart;
  readonly canStart: boolean;
}): ReactNode {
  if (!draftChat.requested) return null;
  return (
    <View className="flex-row items-center gap-2">
      <Text tone="variant" className="min-w-0 flex-1">
        {draftChat.problem ?? 'Commands and references work inside a started chat.'}
      </Text>
      <Button
        label="Start chat"
        variant="text"
        loading={draftChat.pending}
        disabled={!canStart}
        onPress={draftChat.start}
      />
    </View>
  );
}
