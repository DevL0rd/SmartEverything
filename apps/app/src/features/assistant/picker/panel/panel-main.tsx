import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow, Engine } from '@smarteverything/domain';
import { KeyboardList, type ListEntry } from '../../../../components/keyboard-list';
import { useEngineAccessory } from '../../chats/engine-accessories';
import { useEngineEfforts } from '../../chats/engine-efforts';
import { useSelectedImageModel } from '../image/use-image-models';
import { IMAGE_SETTINGS_ROW, ImageSettingsRow } from './image-settings-panel';
import { MachineRow } from './machine-panel';
import { MEMORY_ROW, MemoryRow, useMemoryControl, type MemoryControl } from './memory-row';
import { AI_MODEL_ROW, IMAGE_MODEL_ROW, ModelPills } from './model-pills';
import { PanelHead, PanelNote } from './panel-chrome';
import { isLibraryPage, type ModelPanelState } from './panel-state';
import { PLAN_FIRST_ROW, PlanFirstRow, type PlanFirst } from './plan-first-row';
import { ThinkingRow } from './thinking-panel';
import type { PanelPicker } from './use-panel-picker';

export interface MainPageProps {
  readonly state: ModelPanelState;
  readonly pick: PanelPicker;
  readonly engine: Engine;
  readonly onClose: () => void;
  readonly onLibrary: () => void;
  readonly onImageLibrary: () => void;
  readonly plan: PlanFirst | null;
  readonly machineInHeader?: boolean;
}

interface ModelRowsPageProps extends MainPageProps {
  readonly memory: MemoryControl | null;
}

function Notes({ state, pick }: Pick<MainPageProps, 'state' | 'pick'>): ReactNode {
  return (
    <>
      {pick.reason === null ? null : (
        <PanelNote
          icon={pick.reason.icon}
          text={pick.reason.text}
          {...(pick.stop === null ? {} : { action: { label: 'Stop', onPress: pick.stop } })}
        />
      )}
      {state.note === null ? null : <PanelNote icon="refresh" text={state.note} />}
    </>
  );
}

function itemsOf(
  hasThinking: boolean,
  blocked: boolean,
  hasImage: boolean,
  {
    memory,
    machineInHeader,
    plan,
  }: Pick<ModelRowsPageProps, 'memory' | 'machineInHeader' | 'plan'>,
): readonly ListEntry[] {
  return [
    ...(machineInHeader === true ? [] : [{ id: 'machine' }]),
    ...(hasThinking ? [{ id: 'thinking', disabled: blocked }] : []),
    { id: AI_MODEL_ROW },
    { id: IMAGE_MODEL_ROW },
    ...(memory === null ? [] : [{ id: MEMORY_ROW, disabled: memory.disabled }]),
    ...(plan === null ? [] : [{ id: PLAN_FIRST_ROW, disabled: plan.disabled }]),
    { id: IMAGE_SETTINGS_ROW, disabled: !hasImage },
  ];
}

function activate(
  id: string,
  { state, onLibrary, onImageLibrary, memory, plan }: ModelRowsPageProps,
  openMachine: () => void,
): void {
  if (id === 'machine') openMachine();
  else if (id === 'thinking') state.setPage(id);
  else if (id === MEMORY_ROW && memory !== null) memory.change(!memory.value);
  else if (id === PLAN_FIRST_ROW) plan?.toggle();
  else if (id === AI_MODEL_ROW) onLibrary();
  else if (id === IMAGE_MODEL_ROW) onImageLibrary();
  else if (id === IMAGE_SETTINGS_ROW) state.setPage('image');
}

function Rows({
  state,
  pick,
  engine,
  onLibrary,
  onImageLibrary,
  memory,
  plan,
  openMachine,
  machineInHeader,
}: Omit<ModelRowsPageProps, 'onClose'> & { readonly openMachine: () => void }): ReactNode {
  return (
    <>
      {machineInHeader === true ? null : (
        <MachineRow
          engine={engine}
          onOpen={openMachine}
          restoreFocus={state.returnFocus === 'machine'}
        />
      )}
      <ThinkingRow
        engine={engine}
        blocked={!pick.editable}
        onChange={pick.change}
        restoreFocus={state.returnFocus === 'thinking'}
        onOpen={(): void => {
          state.setPage('thinking');
        }}
      />
      <View className="my-1 h-hairline bg-outline-variant" />
      <ModelPills
        engine={engine}
        returnFocus={
          state.returnFocus !== null && isLibraryPage(state.returnFocus) ? state.returnFocus : null
        }
        onAiModel={onLibrary}
        onImageModel={onImageLibrary}
      />
      <View className="my-1 h-hairline bg-outline-variant" />
      {memory === null ? null : <MemoryRow control={memory} />}
      {plan === null ? null : <PlanFirstRow plan={plan} />}
      <ImageSettingsRow
        restoreFocus={state.returnFocus === 'image'}
        onOpen={(): void => {
          state.setPage('image');
        }}
      />
    </>
  );
}

function ModelRowsPage(props: ModelRowsPageProps): ReactNode {
  const { state, pick, engine, onClose, onLibrary, onImageLibrary, memory, machineInHeader, plan } =
    props;
  const openMachine = (): void => {
    state.setPage('machine');
  };
  const hasThinking = useEngineEfforts(engine).length > 0;
  const hasImage = useSelectedImageModel() !== null;
  return (
    <KeyboardList
      items={itemsOf(hasThinking, !pick.editable, hasImage, props)}
      label="Models and thinking"
      onActivate={(id): void => {
        activate(id, props, openMachine);
      }}
    >
      <PanelHead title="Models and thinking" onBack={null} onClose={onClose} />
      <Notes state={state} pick={pick} />
      <Rows
        state={state}
        pick={pick}
        engine={engine}
        onLibrary={onLibrary}
        onImageLibrary={onImageLibrary}
        memory={memory}
        plan={plan}
        openMachine={openMachine}
        machineInHeader={machineInHeader === true}
      />
    </KeyboardList>
  );
}

function MemoryPage({ chat, ...props }: MainPageProps & { readonly chat: AiChatRow }): ReactNode {
  const memory = useMemoryControl(chat);
  return <ModelRowsPage {...props} memory={memory} />;
}

export function MainPage(props: MainPageProps): ReactNode {
  const chat = useEngineAccessory()?.chat;
  return chat?.engine.kind === 'dsh' ? (
    <MemoryPage {...props} chat={chat} />
  ) : (
    <ModelRowsPage {...props} memory={null} />
  );
}
