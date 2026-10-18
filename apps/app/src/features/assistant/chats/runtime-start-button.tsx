import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ComputerAiRuntime } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { useIsOwner } from '../../../store/selectors';
import { setDraftEngine } from '../data/draft-engine';
import { COMPUTER_ENGINE_LABELS } from '../provider/computer-engine';
import { useEngineCatalogue } from '../provider/provider-data';
import { runtimeStartOf, type RuntimeChoice } from './runtime-start';

function itemOf(choice: RuntimeChoice, start: (choice: RuntimeChoice) => void): MenuItem {
  return {
    label: choice.name,
    ...(choice.reason === null ? {} : { description: choice.reason }),
    disabled: choice.engine === null,
    onPress: (): void => {
      start(choice);
    },
  };
}

function RuntimeMenuButton({
  label,
  choices,
  start,
}: {
  readonly label: string;
  readonly choices: readonly RuntimeChoice[];
  readonly start: (choice: RuntimeChoice) => void;
}): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(
    choices.map((choice) => itemOf(choice, start)),
    'Choose a computer',
  );
  return (
    <View ref={ref} collapsable={false}>
      <IconButton icon="plus" label={label} onPress={open} />
      {menu}
    </View>
  );
}

export function RuntimeStartButton({
  runtime,
  onNewChat,
}: {
  readonly runtime: ComputerAiRuntime;
  readonly onNewChat: () => void;
}): ReactNode {
  const owner = useIsOwner();
  const catalogue = useEngineCatalogue();
  const start = runtimeStartOf(catalogue.data, runtime);
  const label = `New ${COMPUTER_ENGINE_LABELS[runtime].name} chat`;
  const begin = (choice: RuntimeChoice): void => {
    if (choice.engine === null) return;
    setDraftEngine(choice.engine);
    onNewChat();
  };
  if (!owner || start.kind === 'none') return null;
  if (start.kind === 'menu') {
    return <RuntimeMenuButton label={label} choices={start.choices} start={begin} />;
  }
  return (
    <IconButton
      icon="plus"
      label={label}
      onPress={() => {
        begin({ key: runtime, name: label, reason: null, engine: start.engine });
      }}
    />
  );
}
