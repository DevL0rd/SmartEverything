import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import type { IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import type { KindLook } from './kinds';

interface AddOption {
  readonly key: string;
  readonly label: string;
  readonly help: string;
  readonly icon: IconName;
  readonly unavailable?: string;
  readonly onPress: () => void;
}

export interface AddGroup {
  readonly title: string;
  readonly options: readonly AddOption[];
}

export function groupedOptions<K extends string>(
  kinds: readonly K[],
  looks: Readonly<Record<K, KindLook>>,
  choose: (kind: K) => void,
  unavailable: (kind: K) => string | undefined = () => undefined,
): readonly AddGroup[] {
  const titles = [...new Set(kinds.map((kind) => looks[kind].group))];
  return titles.map((title) => ({
    title,
    options: kinds
      .filter((kind) => looks[kind].group === title)
      .map((kind) => {
        const reason = unavailable(kind);
        return {
          key: kind,
          label: looks[kind].label,
          help: reason ?? looks[kind].help,
          icon: looks[kind].icon,
          ...(reason === undefined ? {} : { unavailable: reason }),
          onPress: (): void => {
            choose(kind);
          },
        };
      }),
  }));
}

function OptionRows({
  groups,
  onChoose,
}: {
  readonly groups: readonly AddGroup[];
  readonly onChoose: (option: AddOption) => void;
}): ReactNode {
  return (
    <View className="gap-section-gap">
      {groups.map((group) => (
        <List key={group.title} title={group.title} inset>
          {group.options.map((option) => (
            <ListRow
              key={option.key}
              title={option.label}
              subtitle={option.help}
              wrapSubtitle
              icon={option.icon}
              iconTone="primary"
              disabled={option.unavailable !== undefined}
              chevron={option.unavailable === undefined}
              onPress={() => {
                onChoose(option);
              }}
            />
          ))}
        </List>
      ))}
    </View>
  );
}

export function AddMenu({
  label,
  groups,
}: {
  readonly label: string;
  readonly groups: () => readonly AddGroup[];
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <View className="flex-row">
      <Button
        label={label}
        icon="plus"
        variant="tonal"
        onPress={() => {
          setOpen(true);
        }}
      />
      <Sheet
        open={open}
        title={label}
        detents={['half', 'full']}
        onClose={() => {
          setOpen(false);
        }}
      >
        <OptionRows
          groups={open ? groups() : []}
          onChoose={(option) => {
            setOpen(false);
            option.onPress();
          }}
        />
      </Sheet>
    </View>
  );
}
