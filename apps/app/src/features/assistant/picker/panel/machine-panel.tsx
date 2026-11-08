import type { ReactNode, Ref } from 'react';
import { View } from 'react-native';
import type { AiChatRow, DshEngine, Engine } from '@smarteverything/domain';
import { usePanelFrame } from '../../../../components/adaptive-panel';
import { COMPACT_PANEL_INSET } from '../../../../components/compact-panel';
import { useFocusRequest } from '../../../../components/focus-request';
import { Icon } from '../../../../components/icon';
import { ListRow } from '../../../../components/list-row';
import { List } from '../../../../components/section';
import { FolderPicker } from '../../../computers';
import { cn } from '../../../../design/cn';
import { useEngineAccessory } from '../../chats/engine-accessories';
import { MachineSource, type MachineChoice, type MachineView } from '../../chats/machine-choices';
import { useComputerFolderChange, useFolderChange } from './panel-folder';
import { isComputerEngine, type ComputerEngine } from '../../provider/computer-engine';
import { folderName, machineLine, useMachineFacts, type MachineFacts } from './panel-machine';
import { KeyedRow, PanelHead } from './panel-chrome';

function rowSubtitle(machine: MachineView, facts: MachineFacts): string {
  if (machine.pending) return 'Choose where this model runs';
  return `Runs on · ${machineLine(facts).text}`;
}

export function MachineRow({
  engine,
  onOpen,
  restoreFocus = false,
}: {
  readonly engine: Engine;
  readonly onOpen: () => void;
  readonly restoreFocus?: boolean;
}): ReactNode {
  const facts = useMachineFacts(engine);
  const ref = useFocusRequest(restoreFocus);
  return (
    <MachineSource engine={engine}>
      {(machine): ReactNode => (
        <KeyedRow id="machine" className="rounded-sm">
          <ListRow
            pressRef={ref}
            compact
            title={machine.name}
            subtitle={rowSubtitle(machine, facts)}
            subtitleTone={machine.pending || machineLine(facts).warning ? 'warning' : 'variant'}
            icon="monitor"
            chevron
            onPress={onOpen}
            label={`Runs on ${machine.name}. ${rowSubtitle(machine, facts)}`}
          />
        </KeyedRow>
      )}
    </MachineSource>
  );
}

interface ChoiceSubtitle {
  readonly subtitle?: string;
  readonly subtitleTone?: 'warning' | 'variant';
}

function choiceSubtitle(choice: MachineChoice): ChoiceSubtitle {
  if (choice.reason !== null) return { subtitle: choice.reason, subtitleTone: 'warning' };
  if (choice.note !== null) return { subtitle: choice.note, subtitleTone: 'variant' };
  return {};
}

function ChoiceRow({
  choice,
  onPicked,
}: {
  readonly choice: MachineChoice;
  readonly onPicked: () => void;
}): ReactNode {
  return (
    <ListRow
      compact
      title={choice.label}
      {...choiceSubtitle(choice)}
      icon="monitor"
      disabled={choice.disabled}
      selected={choice.selected}
      trailing={choice.selected ? <Icon name="check" size={20} tone="primary" /> : undefined}
      onPress={(): void => {
        choice.onPress();
        onPicked();
      }}
    />
  );
}

const COMPUTER_FOLDER_HINT = 'Choose a folder for local tools, sub-agents and commands';

type FolderPlacement =
  | {
      readonly kind: 'row';
      readonly machine: string;
      readonly onFolder: () => void;
      readonly rowRef: Ref<View>;
    }
  | { readonly kind: 'page'; readonly onBack: () => void };

interface FolderControlProps {
  readonly facts: MachineFacts;
  readonly placement: FolderPlacement;
  readonly hint: string | null;
  readonly onChoose: (path: string) => void;
}

function FolderControl({ facts, placement, hint, onChoose }: FolderControlProps): ReactNode {
  if (!facts.canChooseFolder || facts.deviceId === null) return null;
  if (placement.kind === 'page')
    return (
      <InlineFolderPicker
        deviceId={facts.deviceId}
        folder={facts.folder}
        onBack={placement.onBack}
        onChoose={onChoose}
      />
    );
  const name = folderName(facts.folder);
  const { machine, onFolder } = placement;
  return (
    <ListRow
      compact
      pressRef={placement.rowRef}
      title={`Folder on ${machine}`}
      value={name ?? 'None'}
      {...(name === null && hint !== null ? { subtitle: hint } : {})}
      icon="folder"
      chevron
      onPress={onFolder}
    />
  );
}

function InlineFolderPicker({
  deviceId,
  folder,
  onBack,
  onChoose,
}: {
  readonly deviceId: NonNullable<MachineFacts['deviceId']>;
  readonly folder: MachineFacts['folder'];
  readonly onBack: () => void;
  readonly onChoose: (path: string) => void;
}): ReactNode {
  return (
    <FolderPicker
      compact
      mode="folder"
      deviceId={deviceId}
      start={folder}
      onCancel={onBack}
      onChoose={(path): void => {
        onChoose(path);
        onBack();
      }}
    />
  );
}

function DshFolder({
  chat,
  engine,
  facts,
  placement,
}: {
  readonly chat: AiChatRow;
  readonly engine: DshEngine;
  readonly facts: MachineFacts;
  readonly placement: FolderPlacement;
}): ReactNode {
  const change = useFolderChange(chat, engine);
  return <FolderControl facts={facts} placement={placement} hint={null} onChoose={change} />;
}

function ComputerFolder({
  chat,
  engine,
  facts,
  placement,
}: {
  readonly chat: AiChatRow;
  readonly engine: ComputerEngine;
  readonly facts: MachineFacts;
  readonly placement: FolderPlacement;
}): ReactNode {
  const change = useComputerFolderChange(chat, engine);
  return (
    <FolderControl
      facts={facts}
      placement={placement}
      hint={COMPUTER_FOLDER_HINT}
      onChoose={change}
    />
  );
}

function FolderChoice({
  chat,
  engine,
  facts,
  placement,
}: {
  readonly chat: AiChatRow;
  readonly engine: Engine;
  readonly facts: MachineFacts;
  readonly placement: FolderPlacement;
}): ReactNode {
  if (engine.kind === 'dsh')
    return <DshFolder chat={chat} engine={engine} facts={facts} placement={placement} />;
  if (isComputerEngine(engine))
    return <ComputerFolder chat={chat} engine={engine} facts={facts} placement={placement} />;
  return null;
}

export function FolderPage({
  engine,
  onBack,
  onClose,
}: {
  readonly engine: Engine;
  readonly onBack: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const facts = useMachineFacts(engine);
  const chat = useEngineAccessory()?.chat;
  const focusBack = useFocusRequest(true);
  const sheet = usePanelFrame().presentation === 'sheet';
  return (
    <View className={cn('min-h-0 shrink', !sheet && cn(COMPACT_PANEL_INSET, 'pb-2'))}>
      <PanelHead
        title="Choose folder"
        onBack={onBack}
        onClose={onClose}
        backLabel="Back to machines"
        backRef={focusBack}
      />
      {chat === undefined ? null : (
        <FolderChoice
          chat={chat}
          engine={engine}
          facts={facts}
          placement={{ kind: 'page', onBack }}
        />
      )}
    </View>
  );
}

interface MachinePageProps {
  readonly engine: Engine;
  readonly onBack: (() => void) | null;
  readonly backLabel?: string | undefined;
  readonly onPicked: () => void;
  readonly onClose: () => void;
  readonly onFolder: () => void;
  readonly focusFolder?: boolean;
}

export function MachinePage({
  engine,
  onBack,
  backLabel,
  onPicked,
  onClose,
  onFolder,
  focusFolder = false,
}: MachinePageProps): ReactNode {
  const facts = useMachineFacts(engine);
  const chat = useEngineAccessory()?.chat;
  const canFocusFolder = chat !== undefined && facts.canChooseFolder;
  const rowRef = useFocusRequest(focusFolder && canFocusFolder);
  const backRef = useFocusRequest(focusFolder && !canFocusFolder);
  return (
    <>
      <PanelHead {...{ title: 'Runs on', onBack, onClose, backRef, backLabel }} />
      <MachineSource engine={engine}>
        {(machine): ReactNode => (
          <List>
            {machine.choices.length === 0 ? (
              <ListRow compact title={machine.empty} disabled />
            ) : (
              machine.choices.map((choice) => (
                <ChoiceRow key={choice.key} choice={choice} onPicked={onPicked} />
              ))
            )}
            {machine.pending ? (
              <ListRow
                compact
                title="Cancel model selection"
                icon="close"
                onPress={onBack ?? onClose}
              />
            ) : null}
            {chat === undefined ? null : (
              <FolderChoice
                chat={chat}
                engine={engine}
                facts={facts}
                placement={{ kind: 'row', machine: machine.name, onFolder, rowRef }}
              />
            )}
          </List>
        )}
      </MachineSource>
    </>
  );
}
