import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ServiceRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import type { ServiceAction } from '../data/computer-system';
import { serviceState, serviceSubtitle, serviceTitle } from './system-model';

type Run = (operation: ServiceAction['operation']) => void;

function Info({
  service,
  hubOwn,
}: {
  readonly service: ServiceRow;
  readonly hubOwn: boolean;
}): ReactNode {
  const state = serviceState(service.state);
  const subtitle = serviceSubtitle(service);
  return (
    <View className="min-w-0 flex-1">
      <Text variant="body" numberOfLines={2}>
        {serviceTitle(service)}
      </Text>
      {subtitle === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {subtitle}
        </Text>
      )}
      <Text variant="footnote" tone={state.tone}>
        {state.word}
      </Text>
      {hubOwn ? (
        <Text variant="caption" tone="variant">
          SmartEverything runs on this service.
        </Text>
      ) : null}
    </View>
  );
}

function Buttons({
  running,
  disabled,
  run,
}: {
  readonly running: boolean;
  readonly disabled: boolean;
  readonly run: Run;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label={running ? 'Stop' : 'Start'}
        variant="tonal"
        disabled={disabled}
        onPress={() => {
          run(running ? 'stop' : 'start');
        }}
      />
      {running ? (
        <Button
          label="Restart"
          variant="text"
          disabled={disabled}
          onPress={() => {
            run('restart');
          }}
        />
      ) : null}
    </View>
  );
}

function LoginSwitch({
  title,
  value,
  disabled,
  run,
}: {
  readonly title: string;
  readonly value: boolean;
  readonly disabled: boolean;
  readonly run: Run;
}): ReactNode {
  return (
    <View className="items-end gap-0.5">
      <Text variant="caption" tone="variant">
        Start at login
      </Text>
      <Switch
        value={value}
        label={`${title} start at login`}
        disabled={disabled}
        onChange={(next) => {
          run(next ? 'enable' : 'disable');
        }}
      />
    </View>
  );
}

export function ServiceItem({
  service,
  hubOwn,
  disabled,
  onChange,
}: {
  readonly service: ServiceRow;
  readonly hubOwn: boolean;
  readonly disabled: boolean;
  readonly onChange: (action: ServiceAction) => void;
}): ReactNode {
  const title = serviceTitle(service);
  const run: Run = (operation) => {
    onChange({ unit: service.unit, name: title, operation, hubOwn });
  };
  return (
    <View className="gap-2 px-4 py-3">
      <View className="flex-row items-center gap-3">
        <Info service={service} hubOwn={hubOwn} />
        {service.startsAtLogin === null ? null : (
          <LoginSwitch title={title} value={service.startsAtLogin} disabled={disabled} run={run} />
        )}
      </View>
      <Buttons running={serviceState(service.state).running} disabled={disabled} run={run} />
    </View>
  );
}
