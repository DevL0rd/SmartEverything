import type { PrinterOptions, PrinterPrefsPatch } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { LoadedQuery } from '../../../components/loaded-query';
import { ActionRow, SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import type { IconName } from '../../../components/icon';
import { usePrinterView } from '../data/use-printer-view';
import { choicesOf, qualityOf, sidesOf } from '../model/print-model';
import { Anchored } from './anchored';
import { StepperRow } from './rows';
import type { SettingsProps } from './settings-props';

interface PrefProps {
  readonly options: PrinterOptions;
  readonly write: (prefs: PrinterPrefsPatch) => void;
}

function Pref({
  title,
  icon,
  values,
  value,
  onPick,
}: {
  readonly title: string;
  readonly icon: IconName;
  readonly values: readonly string[];
  readonly value: string | null;
  readonly onPick: (value: string) => void;
}): ReactNode {
  return values.length < 2 ? null : (
    <SelectRow
      icon={icon}
      title={title}
      options={choicesOf(values)}
      value={value}
      onChange={onPick}
    />
  );
}

function Choices({ options, write }: PrefProps): ReactNode {
  const { prefs } = options;
  return (
    <>
      <Pref
        title="Sides"
        icon="fileText"
        values={options.sides}
        value={prefs.sides}
        onPick={(value) => {
          const sides = sidesOf(value);
          if (sides !== null) write({ sides });
        }}
      />
      <Pref
        title="Colour"
        icon="palette"
        values={options.colorModes}
        value={prefs.colorMode}
        onPick={(colorMode) => {
          write({ colorMode });
        }}
      />
      <Pref
        title="Quality"
        icon="gauge"
        values={options.qualities}
        value={prefs.quality}
        onPick={(value) => {
          const quality = qualityOf(value);
          if (quality !== null) write({ quality });
        }}
      />
      <Pref
        title="Paper size"
        icon="box"
        values={options.media}
        value={prefs.media}
        onPick={(media) => {
          write({ media });
        }}
      />
    </>
  );
}

function Rows({ options, write }: PrefProps): ReactNode {
  return (
    <>
      <Choices options={options} write={write} />
      <StepperRow
        title="Copies"
        value={options.prefs.copies ?? 1}
        range={{ min: 1, max: 99, step: 1 }}
        unit=""
        onChange={(copies) => {
          write({ copies });
        }}
      />
      <SwitchRow
        icon="bell"
        title="Tell me when my job is done"
        value={options.prefs.notifyJobDone}
        onChange={(notifyJobDone) => {
          write({ notifyJobDone });
        }}
      />
    </>
  );
}

export function DefaultsList({ device, actor }: SettingsProps): ReactNode {
  const options = usePrinterView(device, 'options');
  const write = (prefs: PrinterPrefsPatch): void => {
    actor.fire(
      { action: 'configure', printer: device.external_id, prefs },
      'The default could not be saved',
    );
  };
  return (
    <List title="My print defaults" footer="Only you use these. Other people keep their own.">
      <Anchored deviceId={device.id} id="defaults" label="My print defaults">
        <LoadedQuery query={options}>
          {(loaded) => <Rows options={loaded} write={write} />}
        </LoadedQuery>
      </Anchored>
    </List>
  );
}

export function DataList({ device, actor, owner }: SettingsProps): ReactNode {
  if (!owner) return null;
  const clear = async (): Promise<void> => {
    const accepted = await confirm({
      title: 'Clear print history?',
      body: 'Charts, job history and supply history for this printer are deleted.',
      confirmLabel: 'Clear',
      tone: 'destructive',
    });
    if (accepted) {
      actor.fire(
        { action: 'clear_history', printer: device.external_id },
        'Could not clear the history',
      );
    }
  };
  return (
    <List title="Data">
      <Anchored deviceId={device.id} id="clear-history" label="Clear print history">
        <ActionRow
          icon="trash"
          title="Clear print history"
          destructive
          onPress={() => {
            background(clear(), 'printer.confirm_failed');
          }}
        />
      </Anchored>
    </List>
  );
}
