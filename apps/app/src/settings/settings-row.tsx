import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { confirm } from '../components/confirm-store';
import { NumberStepper } from '../components/number-stepper';
import { ListRow } from '../components/list-row';
import { ActionRow, NavRow, SelectRow, SwitchRow } from '../components/rows';
import { notify } from '../components/toast-store';
import { useEntityStore, useStoreSelector } from '../store/store-context';
import type { IconName } from '../components/icon';
import { Segmented } from '../components/segmented';
import { Text } from '../components/text';
import { TextEditSheet } from './text-edit-sheet';
import type {
  SelectSetting,
  SettingContext,
  SettingDefinition,
  StepperSetting,
  SwitchSetting,
} from './types';

function useWrite(): (title: string, write: (context: SettingContext) => Promise<void>) => void {
  const store = useEntityStore();
  return (title, write) => {
    write({ state: store.get(), store }).catch((error: unknown) => {
      notify({
        message: `${title} was not changed`,
        error,
        tone: 'critical',
      });
    });
  };
}

interface RowBase {
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: IconName;
}

function baseOf(setting: SettingDefinition): RowBase {
  return {
    title: setting.title,
    ...(setting.description === undefined ? {} : { subtitle: setting.description }),
    ...(setting.icon === undefined ? {} : { icon: setting.icon }),
  };
}

function TextRow({
  setting,
}: {
  readonly setting: Extract<SettingDefinition, { control: 'text' }>;
}): ReactNode {
  const store = useEntityStore();
  const stored = useStoreSelector(setting.read);
  const [editing, setEditing] = useState(false);
  return (
    <>
      <ListRow
        {...baseOf(setting)}
        value={stored}
        chevron
        onPress={() => {
          setEditing(true);
        }}
      />
      <TextEditSheet
        request={
          editing
            ? {
                title: setting.title,
                label: setting.title,
                initial: stored,
                placeholder: setting.placeholder,
                confirmLabel: 'Save',
                maxLength: setting.maxLength,
                save: (value) => setting.write(value, { state: store.get(), store }),
              }
            : null
        }
        onClose={() => {
          setEditing(false);
        }}
      />
    </>
  );
}

function SwitchSettingRow({ setting }: { readonly setting: SwitchSetting }): ReactNode {
  const write = useWrite();
  const value = useStoreSelector((state) => setting.read(state));
  return (
    <SwitchRow
      {...baseOf(setting)}
      value={value}
      onChange={(next) => {
        write(setting.title, (context) => setting.write(next, context));
      }}
    />
  );
}

function InlineSelectRow({ setting }: { readonly setting: SelectSetting }): ReactNode {
  const write = useWrite();
  const value = useStoreSelector((state) => setting.read(state));
  return (
    <View className="gap-2 px-4 py-3">
      <Text variant="body">{setting.title}</Text>
      <Segmented
        label={setting.title}
        options={setting.options}
        value={value}
        onChange={(next) => {
          write(setting.title, (context) => setting.write(next, context));
        }}
      />
      {setting.description === undefined ? null : (
        <Text variant="footnote" tone="variant">
          {setting.description}
        </Text>
      )}
    </View>
  );
}

function SelectSettingRow({ setting }: { readonly setting: SelectSetting }): ReactNode {
  const write = useWrite();
  const value = useStoreSelector((state) => setting.read(state));
  return (
    <SelectRow
      {...baseOf(setting)}
      options={setting.options}
      value={value}
      searchable={setting.searchable ?? false}
      onChange={(next) => {
        write(setting.title, (context) => setting.write(next, context));
      }}
    />
  );
}

function StepperSettingRow({ setting }: { readonly setting: StepperSetting }): ReactNode {
  const write = useWrite();
  const value = useStoreSelector((state) => setting.read(state));
  return (
    <ListRow
      {...baseOf(setting)}
      trailing={
        <NumberStepper
          label={setting.title}
          value={value}
          min={setting.min}
          max={setting.max}
          step={setting.step}
          {...(setting.unit === undefined ? {} : { unit: setting.unit })}
          {...(setting.format === undefined ? {} : { formatValue: setting.format })}
          onChange={(next) => {
            write(setting.title, (context) => setting.write(next, context));
          }}
        />
      }
    />
  );
}

function ActionSettingRow({
  setting,
}: {
  readonly setting: Extract<SettingDefinition, { control: 'action' }>;
}): ReactNode {
  const write = useWrite();
  return (
    <ActionRow
      title={setting.title}
      {...(setting.icon === undefined ? {} : { icon: setting.icon })}
      destructive={setting.destructive ?? false}
      onPress={() => {
        const ask =
          setting.confirm === undefined ? Promise.resolve(true) : confirm(setting.confirm);
        void ask.then((accepted) => {
          if (accepted) {
            write(setting.title, setting.run);
          }
        });
      }}
    />
  );
}

function LinkSettingRow({
  setting,
}: {
  readonly setting: Extract<SettingDefinition, { control: 'link' }>;
}): ReactNode {
  const value = useStoreSelector((state) => setting.value?.(state) ?? null);
  return (
    <NavRow
      title={setting.title}
      href={setting.href}
      {...(setting.icon === undefined ? {} : { icon: setting.icon })}
      {...(value === null ? {} : { value })}
      {...(setting.description === undefined ? {} : { subtitle: setting.description })}
    />
  );
}

export function SettingsRow({ setting }: { readonly setting: SettingDefinition }): ReactNode {
  switch (setting.control) {
    case 'switch':
      return <SwitchSettingRow setting={setting} />;
    case 'select':
      return setting.inline === true ? (
        <InlineSelectRow setting={setting} />
      ) : (
        <SelectSettingRow setting={setting} />
      );
    case 'stepper':
      return <StepperSettingRow setting={setting} />;
    case 'text':
      return <TextRow setting={setting} />;
    case 'link':
      return <LinkSettingRow setting={setting} />;
    case 'action':
      return <ActionSettingRow setting={setting} />;
    case 'custom':
      return setting.render();
  }
}
