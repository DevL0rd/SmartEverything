import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import type { IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';

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

export function AddSheet({
  open,
  title,
  groups,
  onClose,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly groups: () => readonly AddGroup[];
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={open} title={title} detents={['half', 'full']} onClose={onClose}>
      <OptionRows
        groups={open ? groups() : []}
        onChoose={(option) => {
          onClose();
          option.onPress();
        }}
      />
    </Sheet>
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
      <AddSheet
        open={open}
        title={label}
        groups={groups}
        onClose={() => {
          setOpen(false);
        }}
      />
    </View>
  );
}
