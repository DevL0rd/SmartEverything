import type { ReactNode } from 'react';
import type { Engine } from '@smarteverything/domain';
import { KeyboardList, type ListEntry } from '../../../../components/keyboard-list';
import { useEngineEfforts } from '../../chats/engine-efforts';
import { MachineRow } from './machine-panel';
import { AI_MODEL_ROW, IMAGE_MODEL_ROW, ModelPills } from './model-pills';
import { PanelHead, PanelNote, usePanelFill } from './panel-chrome';
import type { ModelPanelState } from './panel-state';
import { ThinkingRow } from './thinking-panel';
import type { PanelPicker } from './use-panel-picker';

export interface MainPageProps {
  readonly state: ModelPanelState;
  readonly pick: PanelPicker;
  readonly engine: Engine;
  readonly onClose: () => void;
  readonly onLibrary: (query: string) => void;
  readonly onImageLibrary: () => void;
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

function itemsOf(hasThinking: boolean, blocked: boolean): readonly ListEntry[] {
  return [
    { id: 'machine' },
    ...(hasThinking ? [{ id: 'thinking', disabled: blocked }] : []),
    { id: AI_MODEL_ROW },
    { id: IMAGE_MODEL_ROW },
  ];
}

export function MainPage({
  state,
  pick,
  engine,
  onClose,
  onLibrary,
  onImageLibrary,
}: MainPageProps): ReactNode {
  const fill = usePanelFill();
  const hasThinking = useEngineEfforts(engine).length > 0;
  return (
    <KeyboardList
      items={itemsOf(hasThinking, !pick.editable)}
      label="Models and thinking"
      className={fill}
      onActivate={(id): void => {
        if (id === 'machine' || id === 'thinking') state.setPage(id);
        else if (id === AI_MODEL_ROW) onLibrary('');
        else if (id === IMAGE_MODEL_ROW) onImageLibrary();
      }}
    >
      <PanelHead title="Models and thinking" onBack={null} onClose={onClose} />
      <Notes state={state} pick={pick} />
      <MachineRow
        engine={engine}
        onOpen={(): void => {
          state.setPage('machine');
        }}
      />
      <ThinkingRow
        engine={engine}
        blocked={!pick.editable}
        onChange={pick.change}
        onOpen={(): void => {
          state.setPage('thinking');
        }}
      />
      <ModelPills
        engine={engine}
        onAiModel={(): void => {
          onLibrary('');
        }}
        onImageModel={onImageLibrary}
      />
    </KeyboardList>
  );
}
