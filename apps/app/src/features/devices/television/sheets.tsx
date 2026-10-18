import { useState, type ReactNode } from 'react';
import type { TvInput } from '@smarteverything/domain';
import { Pressable, View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Sheet } from '../../../components/sheet';
import { Slider } from '../../../components/slider';
import { Text } from '../../../components/text';
import { SleepTimerSheet } from '../../automations';
import { cn } from '../../../design/cn';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { AppGrid, inputIcon } from './chips';
import { inputRenameRequest } from './input-names';
import { MAX_CHANNEL_DIGITS } from './keys';
import { channelSend, type ChannelSend } from './numpad';
import type { TvSheets } from './sheet-state';
import type { Television } from './use-television';
import type { TelevisionActions } from './use-television-actions';
import type { TvApp } from './apps';
import { volumeText } from './state-line';

const PAD_ROWS: readonly (readonly string[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['erase', '0', 'go'],
];

function VolumeBody({
  tv,
  actions,
}: {
  readonly tv: Television;
  readonly actions: TelevisionActions;
}): ReactNode {
  const { volume, mode } = tv.view;
  return (
    <View className="gap-4 pb-2">
      <Slider
        label="Volume"
        value={volume.level}
        min={0}
        max={100}
        step={1}
        disabled={mode !== 'on'}
        onCommit={actions.setVolume}
        formatValue={String}
      />
      <View className="flex-row items-center gap-2">
        <Icon name={volume.muted ? 'muted' : 'volume'} size={20} />
        <Text variant="footnote" tone="variant">
          {volume.muted
            ? 'Muted. Moving the slider unmutes.'
            : volume.stale
              ? 'Last known level. Moving the slider sets the real one.'
              : `Volume ${volumeText(volume) ?? ''}`}
        </Text>
      </View>
    </View>
  );
}

function InputRow({
  input,
  current,
  off,
  onChoose,
  onRename,
}: {
  readonly input: TvInput;
  readonly current: boolean;
  readonly off: boolean;
  readonly onChoose: () => void;
  readonly onRename: () => void;
}): ReactNode {
  return (
    <View className="flex-row items-center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={input.label}
        accessibilityState={{ selected: current, disabled: off }}
        disabled={off}
        onPress={onChoose}
        className={cn(
          'min-h-touch-min flex-1 flex-row items-center gap-3 rounded-md px-3 active:bg-surface-3',
          off && 'opacity-60',
        )}
      >
        <Icon name={inputIcon(input.id)} size={24} />
        <Text variant="body" className="flex-1">
          {input.label}
        </Text>
        {current ? <Icon name="check" size={20} tone="primary" /> : null}
      </Pressable>
      <IconButton icon="pencil" label={`Rename ${input.label}`} onPress={onRename} />
    </View>
  );
}

function InputsBody({
  tv,
  actions,
  close,
}: {
  readonly tv: Television;
  readonly actions: TelevisionActions;
  readonly close: () => void;
}): ReactNode {
  const off = tv.view.mode !== 'on';
  const [request, setRequest] = useState<TextEditRequest | null>(null);
  return (
    <View className="gap-1 pb-2">
      {off ? (
        <Text variant="footnote" tone="variant" className="pb-2">
          Turn the TV on to change its input.
        </Text>
      ) : null}
      {tv.view.inputs.map((input) => (
        <InputRow
          key={input.id}
          input={input}
          current={input.id === tv.view.input}
          off={off}
          onChoose={() => {
            actions.chooseInput(input.id);
            close();
          }}
          onRename={() => {
            setRequest(inputRenameRequest(input, actions.renameInput));
          }}
        />
      ))}
      <TextEditSheet
        request={request}
        onClose={() => {
          setRequest(null);
        }}
      />
    </View>
  );
}

function AppsBody({
  apps,
  off,
  onOpen,
}: {
  readonly apps: readonly TvApp[];
  readonly off: boolean;
  readonly onOpen: (name: string) => void;
}): ReactNode {
  return (
    <View className="gap-3 pb-2">
      {off ? (
        <Text variant="footnote" tone="variant">
          Turn the TV on to open an app.
        </Text>
      ) : null}
      <AppGrid apps={apps} off={off} current={null} onOpen={onOpen} />
    </View>
  );
}

function PadCell({
  cell,
  sheets,
  typed,
  send,
  go,
}: {
  readonly cell: string;
  readonly sheets: TvSheets;
  readonly typed: string;
  readonly send: ChannelSend | null;
  readonly go: () => void;
}): ReactNode {
  if (cell === 'erase') {
    return (
      <View className="flex-1">
        <Button
          label="Erase"
          variant="text"
          size="lg"
          disabled={typed === ''}
          onPress={sheets.erase}
        />
      </View>
    );
  }
  if (cell === 'go') {
    return (
      <View className="flex-1">
        <Button label="Go" size="lg" disabled={send === null} onPress={go} />
      </View>
    );
  }
  return (
    <View className="flex-1">
      <Button
        label={cell}
        variant="tonal"
        size="lg"
        disabled={typed.length >= MAX_CHANNEL_DIGITS}
        onPress={() => {
          sheets.digit(cell);
        }}
      />
    </View>
  );
}

function NumberBody({
  tv,
  actions,
  sheets,
  typed,
}: {
  readonly tv: Television;
  readonly actions: TelevisionActions;
  readonly sheets: TvSheets;
  readonly typed: string;
}): ReactNode {
  const send = channelSend(tv.view, typed);
  const go = (): void => {
    if (send === null) {
      return;
    }
    if (send.kind === 'keys') {
      tv.pressAll(send.keys);
    } else {
      actions.goToChannel(send.channel);
    }
    sheets.close();
  };
  return (
    <View className="gap-3 pb-2">
      <Text variant="title-2" align="center" className="tabular" accessibilityLiveRegion="polite">
        {typed === '' ? '_' : `${typed}_`}
      </Text>
      {PAD_ROWS.map((row) => (
        <View key={row.join('')} className="flex-row gap-2">
          {row.map((cell) => (
            <PadCell key={cell} cell={cell} sheets={sheets} typed={typed} send={send} go={go} />
          ))}
        </View>
      ))}
    </View>
  );
}

function openThenClose(actions: TelevisionActions, close: () => void): (name: string) => void {
  return (name): void => {
    actions.openApp(name);
    close();
  };
}

function numberTitle(tv: Television): string {
  return tv.view.locks.n0 === undefined ? 'Number pad' : 'Go to channel';
}

function Panel({
  title,
  close,
  half = false,
  children,
}: {
  readonly title: string;
  readonly close: () => void;
  readonly half?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Sheet open onClose={close} title={title} detents={half ? ['half', 'full'] : ['fit']}>
      {children}
    </Sheet>
  );
}

export function TelevisionSheets({
  tv,
  sheets,
  actions,
  apps,
}: {
  readonly tv: Television;
  readonly sheets: TvSheets;
  readonly actions: TelevisionActions;
  readonly apps: readonly TvApp[];
}): ReactNode {
  const { sheet, close } = sheets;
  if (sheet === null) {
    return null;
  }
  switch (sheet.kind) {
    case 'sleep':
      return <SleepTimerSheet deviceId={tv.device.id} name={tv.name} open onClose={close} />;
    case 'volume':
      return (
        <Panel title="Volume" close={close}>
          <VolumeBody tv={tv} actions={actions} />
        </Panel>
      );
    case 'inputs':
      return (
        <Panel title="Inputs" close={close}>
          <InputsBody tv={tv} actions={actions} close={close} />
        </Panel>
      );
    case 'apps':
      return (
        <Panel title="Apps" close={close} half>
          <AppsBody
            apps={apps}
            off={tv.view.mode !== 'on'}
            onOpen={openThenClose(actions, close)}
          />
        </Panel>
      );
    case 'numpad':
      return (
        <Panel title={numberTitle(tv)} close={close}>
          <NumberBody tv={tv} actions={actions} sheets={sheets} typed={sheet.typed} />
        </Panel>
      );
  }
}
