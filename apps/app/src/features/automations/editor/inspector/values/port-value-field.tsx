import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Segmented } from '../../../../../components/segmented';
import { Text } from '../../../../../components/text';
import type { ValueRequest } from '../sections/section-types';
import { LiteralEditor } from './literal-editor';
import { useValueServices } from './value-services';
import { WirePicker } from './wire-picker';
import { MODE_LABELS, modeOf, modesFor, switchedValue, type ValueMode } from './value-mode';

const JSON_CONTROL = { t: 'json' } as const;

function ModeBody({
  request,
  mode,
}: {
  readonly request: ValueRequest;
  readonly mode: ValueMode;
}): ReactNode {
  const { env } = useValueServices();
  const { value } = request;
  if (mode === 'wire') {
    return (
      <WirePicker
        nodeKey={request.nodeKey}
        expected={request.type}
        value={value}
        disabled={env.locked}
        onPick={request.onChange}
      />
    );
  }
  return (
    <LiteralEditor
      control={request.control ?? JSON_CONTROL}
      label={request.label}
      value={value !== undefined && 'lit' in value ? value.lit : undefined}
      disabled={env.locked}
      onChange={(lit) => {
        request.onChange({ lit });
      }}
    />
  );
}

export function PortValueField({ request }: { readonly request: ValueRequest }): ReactNode {
  const { env } = useValueServices();
  const [pending, setPending] = useState<ValueMode | null>(null);
  const modes = modesFor(request.isStatic);
  const current = modeOf(request.value);
  const shown = pending ?? current;
  const choose = (to: ValueMode): void => {
    if (to === current) {
      setPending(null);
      return;
    }
    const next = switchedValue(request.value, to);
    if (next !== undefined) request.onChange(next);
    setPending(next === undefined ? to : null);
  };
  return (
    <View className="gap-2">
      {modes.length > 1 ? (
        <Segmented
          label={`How ${request.label} is set`}
          options={modes.map((mode) => ({ value: mode, label: MODE_LABELS[mode] }))}
          value={shown}
          disabled={env.locked}
          onChange={choose}
        />
      ) : null}
      <ModeBody request={request} mode={shown} />
      {request.message === undefined ? null : (
        <Text variant="footnote" tone="critical">
          {request.message}
        </Text>
      )}
    </View>
  );
}
