import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { dateLine, type RemoveVerdict, type SecretRowModel } from './secrets-model';

export interface SecretRowProps {
  readonly row: SecretRowModel;
  readonly readOnly: boolean;
  readonly refusal: Extract<RemoveVerdict, { readonly allowed: false }> | null;
  readonly onReplace: (row: SecretRowModel) => void;
  readonly onRemove: (row: SecretRowModel) => void;
}

function Users({ row }: { readonly row: SecretRowModel }): ReactNode {
  if (row.users.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {row.users.map((user) => (
        <Badge key={user.automationId} label={user.name} icon="automations" tone="primary" />
      ))}
    </View>
  );
}

function Refusal({
  refusal,
}: {
  readonly refusal: NonNullable<SecretRowProps['refusal']>;
}): ReactNode {
  return (
    <View className="gap-1 rounded-md bg-critical/14 px-3 py-2" accessibilityLiveRegion="polite">
      <Text variant="callout" tone="critical">
        {refusal.title}
      </Text>
      <Text variant="footnote" tone="variant">
        {refusal.body}
      </Text>
    </View>
  );
}

function Actions({
  row,
  onReplace,
  onRemove,
}: Pick<SecretRowProps, 'row' | 'onReplace' | 'onRemove'>): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Button
        label="Replace value"
        icon="pencil"
        variant="outlined"
        hint={`Sets a new value for ${row.name}`}
        onPress={() => {
          onReplace(row);
        }}
      />
      <Button
        label="Remove"
        icon="trash"
        variant="destructive"
        hint={`Removes ${row.name}`}
        onPress={() => {
          onRemove(row);
        }}
      />
    </View>
  );
}

export function SecretRow({
  row,
  readOnly,
  refusal,
  onReplace,
  onRemove,
}: SecretRowProps): ReactNode {
  return (
    <Card label={`${row.name}. ${row.usesLabel}`}>
      <View className="flex-row items-center gap-3">
        <View className="size-10 items-center justify-center rounded-full bg-primary-container">
          <Icon name="key" size={20} tone="primary" />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="body-strong" numberOfLines={1}>
            {row.name}
          </Text>
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {dateLine(row)}
          </Text>
        </View>
        <Text variant="footnote" tone="variant" className="shrink-0">
          {row.usesLabel}
        </Text>
      </View>
      <Users row={row} />
      {refusal === null ? null : <Refusal refusal={refusal} />}
      {readOnly ? null : <Actions row={row} onReplace={onReplace} onRemove={onRemove} />}
    </Card>
  );
}
