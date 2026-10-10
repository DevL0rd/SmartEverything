import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { useDeviceIcon } from '../editor/kinds';
import type { Template } from '../model/templates';

export interface NewAutomation {
  readonly open: () => void;
  readonly sheet: ReactNode;
}

export function IdeaRows({
  ideas,
  onPick,
}: {
  readonly ideas: readonly Template[];
  readonly onPick: (idea: Template) => void;
}): ReactNode {
  const iconOf = useDeviceIcon();
  return (
    <List title="Ideas for your devices" inset>
      {ideas.map((idea) => (
        <ListRow
          key={idea.id}
          title={idea.title}
          subtitle={idea.why}
          icon={iconOf(idea.deviceId)}
          iconTone="primary"
          chevron
          onPress={() => {
            onPick(idea);
          }}
        />
      ))}
    </List>
  );
}

export function useNewAutomation(ideas: readonly Template[]): NewAutomation {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const start = (idea: Template | null): void => {
    setOpen(false);
    router.push(idea === null ? href.automation('new') : href.automation('new', idea.id));
  };
  return {
    open: (): void => {
      if (ideas.length === 0) {
        start(null);
        return;
      }
      setOpen(true);
    },
    sheet: (
      <Sheet
        open={open}
        title="New automation"
        detents={['fit']}
        onClose={() => {
          setOpen(false);
        }}
      >
        <View className="gap-section-gap">
          <List inset>
            <ListRow
              title="Start from scratch"
              icon="plus"
              iconTone="primary"
              chevron
              onPress={() => {
                start(null);
              }}
            />
          </List>
          <IdeaRows ideas={ideas} onPick={start} />
        </View>
      </Sheet>
    ),
  };
}
