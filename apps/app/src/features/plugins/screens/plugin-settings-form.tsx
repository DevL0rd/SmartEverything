import type { ReactNode } from 'react';
import { useState } from 'react';
import type { JsonValue, PluginRow, PluginSetting } from '@smarteverything/domain';
import { NavRow, SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { savePlugin } from '../data/plugin-actions';
import {
  numberProblem,
  settingText,
  settingValue,
  shownValue,
  type TextSetting,
} from '../model/setting-values';

interface FieldProps<S extends PluginSetting> {
  readonly row: PluginRow;
  readonly name: string;
  readonly setting: S;
  readonly edit: (request: TextEditRequest) => void;
}

function saver(row: PluginRow, name: string, title: string): (value: JsonValue) => Promise<void> {
  return (value) => savePlugin(row, { settings: { [name]: value } }, `${title} wasn’t saved`);
}

function textRequest(row: PluginRow, name: string, setting: TextSetting): TextEditRequest {
  const save = saver(row, name, setting.title);
  const description = setting.description ?? undefined;
  const base = {
    title: setting.title,
    label: setting.title,
    initial:
      setting.type === 'string' && !setting.secret
        ? settingText(settingValue(row, name, setting))
        : '',
    placeholder: '',
    confirmLabel: 'Save',
    ...(description === undefined ? {} : { helper: description }),
  };
  if (setting.type === 'number') {
    return {
      ...base,
      maxLength: 30,
      kind: 'number',
      problemOf: (value) => numberProblem(setting, value),
      save: (value) => save(Number(value)),
    };
  }
  return { ...base, maxLength: 2000, kind: setting.secret ? 'password' : 'text', save };
}

function TextSettingRow({ row, name, setting, edit }: FieldProps<TextSetting>): ReactNode {
  return (
    <NavRow
      title={setting.title}
      value={shownValue(row, name, setting)}
      onPress={() => {
        edit(textRequest(row, name, setting));
      }}
    />
  );
}

function Field({ row, name, setting, edit }: FieldProps<PluginSetting>): ReactNode {
  const save = saver(row, name, setting.title);
  const subtitle = setting.description ?? undefined;
  const common = { title: setting.title, ...(subtitle === undefined ? {} : { subtitle }) };
  if (setting.type === 'boolean') {
    return (
      <SwitchRow
        {...common}
        value={settingValue(row, name, setting) === true}
        onChange={(on) => void save(on)}
      />
    );
  }
  if (setting.type === 'enum') {
    const value = settingValue(row, name, setting);
    return (
      <SelectRow
        {...common}
        options={setting.options}
        value={typeof value === 'string' ? value : null}
        onChange={(picked) => void save(picked)}
      />
    );
  }
  return <TextSettingRow row={row} name={name} setting={setting} edit={edit} />;
}

export function PluginSettingsForm({ row }: { readonly row: PluginRow }): ReactNode {
  const [request, setRequest] = useState<TextEditRequest | null>(null);
  const fields = Object.entries(row.manifest.contributes.settings);
  if (fields.length === 0) {
    return null;
  }
  return (
    <>
      <List inset title="Settings">
        {fields.map(([name, setting]) => (
          <Field key={name} row={row} name={name} setting={setting} edit={setRequest} />
        ))}
      </List>
      <TextEditSheet
        request={request}
        onClose={() => {
          setRequest(null);
        }}
      />
    </>
  );
}
