import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AutomationToolRow, JsonValue, ToolAction } from '@smarteverything/domain';
import { SchemaEditor } from '../../../components/schema-editor';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { rawErrorText } from '../../../format/errors';
import type { Catalog } from '../data/use-automations';
import { useAutomationTools } from '../data/use-automation-tools';
import { toolProblems } from '../model/tool-arguments';

export interface ToolCall {
  readonly profileId: string;
  readonly tool: string;
  readonly args: Readonly<Record<string, JsonValue>>;
}

function Arguments({
  tool,
  call,
  onChange,
}: {
  readonly tool: AutomationToolRow;
  readonly call: ToolCall;
  readonly onChange: (call: ToolCall) => void;
}): ReactNode {
  const problems = toolProblems(tool.input_schema, call.args);
  return (
    <View className="gap-3">
      <Text variant="callout" tone="variant">
        {tool.description}
      </Text>
      <SchemaEditor
        schema={tool.input_schema}
        value={call.args}
        searchPlaceholder="Find an argument"
        change={(args) => {
          onChange({ ...call, args });
        }}
      />
      {problems.length === 0 ? null : (
        <Text variant="footnote" tone="critical">
          {problems.join('; ')}
        </Text>
      )}
    </View>
  );
}

function ToolPicker({
  call,
  onChange,
}: {
  readonly call: ToolCall;
  readonly onChange: (call: ToolCall) => void;
}): ReactNode {
  const tools = useAutomationTools();
  const chosen = tools.data?.find((row) => row.name === call.tool);
  return (
    <View className="gap-3">
      <Select
        label="Tool"
        searchable
        value={chosen === undefined ? null : chosen.name}
        placeholder={tools.isPending ? 'Loading the tools' : 'Pick a tool'}
        options={(tools.data ?? []).map((row) => ({ value: row.name, label: row.title }))}
        onChange={(tool) => {
          onChange({ ...call, tool, args: {} });
        }}
      />
      {tools.isError ? (
        <Text variant="footnote" tone="critical">
          {rawErrorText(tools.error)}
        </Text>
      ) : null}
      {chosen === undefined ? null : <Arguments tool={chosen} call={call} onChange={onChange} />}
    </View>
  );
}

export function ToolForm({
  catalog,
  call,
  onChange,
}: {
  readonly catalog: Catalog;
  readonly call: ToolCall;
  readonly onChange: (call: ToolCall) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <Select
        label="Whose"
        value={
          catalog.people.some((person) => person.id === call.profileId) ? call.profileId : null
        }
        placeholder="Pick a person"
        options={catalog.people.map((person) => ({ value: person.id, label: person.name }))}
        onChange={(profileId) => {
          onChange({ ...call, profileId });
        }}
      />
      <ToolPicker call={call} onChange={onChange} />
    </View>
  );
}

export function ToolActionFields({
  action,
  onChange,
}: {
  readonly action: ToolAction;
  readonly onChange: (action: ToolAction) => void;
}): ReactNode {
  return (
    <ToolPicker
      call={{ profileId: action.profileId, tool: action.tool, args: action.args }}
      onChange={(call) => {
        onChange({ ...action, tool: call.tool, args: call.args });
      }}
    />
  );
}
