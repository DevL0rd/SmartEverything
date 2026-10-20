import { useState, type ReactNode } from 'react';
import { ScrollView } from 'react-native';
import type { AiChatRow, DshEngine, Engine } from '@smarteverything/domain';
import { Icon } from '../../../../components/icon';
import { IconWell } from '../../../../components/icon-well';
import { ListRow } from '../../../../components/list-row';
import { List } from '../../../../components/section';
import { FolderPickerSheet } from '../../../computers';
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
}: {
  readonly engine: Engine;
  readonly onOpen: () => void;
}): ReactNode {
  const facts = useMachineFacts(engine);
  return (
    <MachineSource engine={engine}>
      {(machine): ReactNode => (
        <KeyedRow id="machine">
          <ListRow
            title={machine.name}
            subtitle={rowSubtitle(machine, facts)}
            subtitleTone={machine.pending || machineLine(facts).warning ? 'warning' : 'variant'}
            leading={<IconWell icon="monitor" colour="viz-1" size="m" />}
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

function FolderRow({
  facts,
  machine,
  hint,
  onChoose,
}: {
  readonly facts: MachineFacts;
  readonly machine: string;
  readonly hint: string | null;
  readonly onChoose: (path: string) => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (!facts.canChooseFolder || facts.deviceId === null) return null;
  const name = folderName(facts.folder);
  return (
    <>
      <ListRow
        title={`Folder on ${machine}`}
        value={name ?? 'Default'}
        {...(name === null && hint !== null ? { subtitle: hint } : {})}
        icon="folder"
        chevron
        onPress={(): void => {
          setOpen(true);
        }}
      />
      <FolderPickerSheet
        open={open}
        mode="folder"
        deviceId={facts.deviceId}
        start={facts.folder}
        onClose={(): void => {
          setOpen(false);
        }}
        onChoose={onChoose}
      />
    </>
  );
}

function DshFolderRow({
  chat,
  engine,
  facts,
  machine,
}: {
  readonly chat: AiChatRow;
  readonly engine: DshEngine;
  readonly facts: MachineFacts;
  readonly machine: string;
}): ReactNode {
  const change = useFolderChange(chat, engine);
  return <FolderRow facts={facts} machine={machine} hint={null} onChoose={change} />;
}

function ComputerFolderRow({
  chat,
  engine,
  facts,
  machine,
}: {
  readonly chat: AiChatRow;
  readonly engine: ComputerEngine;
  readonly facts: MachineFacts;
  readonly machine: string;
}): ReactNode {
  const change = useComputerFolderChange(chat, engine);
  return (
    <FolderRow facts={facts} machine={machine} hint={COMPUTER_FOLDER_HINT} onChoose={change} />
  );
}

function FolderChoice({
  chat,
  engine,
  facts,
  machine,
}: {
  readonly chat: AiChatRow;
  readonly engine: Engine;
  readonly facts: MachineFacts;
  readonly machine: string;
}): ReactNode {
  if (engine.kind === 'dsh')
    return <DshFolderRow chat={chat} engine={engine} facts={facts} machine={machine} />;
  if (isComputerEngine(engine))
    return <ComputerFolderRow chat={chat} engine={engine} facts={facts} machine={machine} />;
  return null;
}

export function MachinePage({
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
  return (
    <>
      <PanelHead title="Runs on" onBack={onBack} onClose={onClose} />
      <MachineSource engine={engine}>
        {(machine): ReactNode => (
          <ScrollView className="min-h-0 flex-1">
            <List>
              {machine.choices.length === 0 ? (
                <ListRow title={machine.empty} disabled />
              ) : (
                machine.choices.map((choice) => (
                  <ChoiceRow key={choice.key} choice={choice} onPicked={onBack} />
                ))
              )}
              {machine.cancel === null ? null : (
                <ListRow title="Cancel model selection" icon="close" onPress={machine.cancel} />
              )}
              {chat === undefined ? null : (
                <FolderChoice chat={chat} engine={engine} facts={facts} machine={machine.name} />
              )}
            </List>
          </ScrollView>
        )}
      </MachineSource>
    </>
  );
}
