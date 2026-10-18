import type { ReactNode } from 'react';
import { useState } from 'react';
import type {
  JsonValue,
  PluginListSetting,
  PluginRow,
  PluginSetting,
} from '@smarteverything/domain';
import { plural } from '../../../format/text';
import { href } from '../../../app-shell/hrefs';
import { NavRow, SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { changePlugin, savePlugin } from '../data/plugin-actions';
import { settingGroups } from '../model/setting-groups';
import {
  listItems,
  numberProblem,
  settingText,
  settingValue,
  shownValue,
  type TextSetting,
} from '../model/setting-values';
import { background } from '@smarteverything/logging';

interface FieldProps<S extends PluginSetting> {
  readonly row: PluginRow;
  readonly name: string;
  readonly setting: S;
  readonly edit: (request: TextEditRequest) => void;
}

function saver(row: PluginRow, name: string): (value: JsonValue) => Promise<void> {
  return (value) => savePlugin(row, { settings: { [name]: value } });
}

function textRequest(row: PluginRow, name: string, setting: TextSetting): TextEditRequest {
  const save = saver(row, name);
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

function ListSettingRow({
  row,
  name,
  setting,
}: Omit<FieldProps<PluginListSetting>, 'edit'>): ReactNode {
  const items = listItems(row, name, setting);
  return (
    <NavRow
      title={setting.title}
      {...(setting.humanOnly ? { subtitle: 'Only you can change this' } : {})}
      value={items.length === 0 ? 'Empty' : plural(items.length, 'item')}
      href={href.pluginList(row.id, name)}
    />
  );
}

function Field({ row, name, setting, edit }: FieldProps<PluginSetting>): ReactNode {
  const change = (value: JsonValue): void => {
    background(
      changePlugin(row, { settings: { [name]: value } }, `${setting.title} wasn’t saved`),
      'plugin.change_failed',
    );
  };
  const subtitle = setting.description ?? undefined;
  const common = {
    title: setting.title,
    ...(subtitle === undefined ? {} : { subtitle, wrapSubtitle: true }),
  };
  if (setting.type === 'boolean') {
    return (
      <SwitchRow {...common} value={settingValue(row, name, setting) === true} onChange={change} />
    );
  }
  if (setting.type === 'enum') {
    const value = settingValue(row, name, setting);
    return (
      <SelectRow
        {...common}
        options={setting.options}
        value={typeof value === 'string' ? value : null}
        onChange={change}
      />
    );
  }
  if (setting.type === 'list') {
    return <ListSettingRow row={row} name={name} setting={setting} />;
  }
  return <TextSettingRow row={row} name={name} setting={setting} edit={edit} />;
}

export function PluginSettingsForm({ row }: { readonly row: PluginRow }): ReactNode {
  const [request, setRequest] = useState<TextEditRequest | null>(null);
  const groups = settingGroups(Object.entries(row.manifest.contributes.settings));
  if (groups.length === 0) {
    return null;
  }
  return (
    <>
      {groups.map((group) => (
        <List inset key={group.title ?? 'settings'} title={group.title ?? 'Settings'}>
          {group.fields.map(([name, setting]) => (
            <Field key={name} row={row} name={name} setting={setting} edit={setRequest} />
          ))}
        </List>
      ))}
      <TextEditSheet
        request={request}
        onClose={() => {
          setRequest(null);
        }}
      />
    </>
  );
}
