import { z } from 'zod';
import type { JsonValue } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Select } from '../../components/select';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { ActionRow } from '../../components/rows';
import { List } from '../../components/section';

export function MemberInput({
  value,
  keys,
  change,
  title = 'Ordered group members',
  labels = {},
}: {
  readonly value: JsonValue;
  readonly keys: readonly string[];
  readonly change: (value: JsonValue) => void;
  readonly title?: string;
  readonly labels?: Readonly<Record<string, string>>;
}): ReactNode {
  const parsed = z.array(z.string()).safeParse(value);
  const members = parsed.success ? parsed.data : [];
  return (
    <View className="gap-3">
      <List title={title}>
        <MemberRows members={members} change={change} labels={labels} />
      </List>
      <Select
        label="Add component"
        value={null}
        options={keys
          .filter((key) => !members.includes(key))
          .map((key) => ({ value: key, label: labels[key] ?? key }))}
        onChange={(key) => {
          change([...members, key]);
        }}
      />
    </View>
  );
}

function MemberRows({
  members,
  change,
  labels,
}: {
  readonly members: readonly string[];
  readonly labels: Readonly<Record<string, string>>;
  readonly change: (value: JsonValue) => void;
}): ReactNode {
  return (
    <View>
      {members.map((member, index) => (
        <View key={member} className="gap-1">
          <Text>{labels[member] ?? member}</Text>
          <View className="flex-row gap-2">
            <Button
              label="Move earlier"
              variant="text"
              disabled={index === 0}
              onPress={() => {
                const previous = members[index - 1];
                if (previous !== undefined)
                  change(
                    members.map((entry, at) =>
                      at === index - 1 ? member : at === index ? previous : entry,
                    ),
                  );
              }}
            />
            <ActionRow
              title="Remove from group"
              onPress={() => {
                change(members.filter((key) => key !== member));
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
