import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { StatTile } from '../../../components/stat-tile';
import { effortLabel } from '../picker/efforts';
import { costText } from '../data/cost';
import { usePanelFacts } from '../data/panel-facts';

function Facts({
  chat,
  rows,
}: {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
}): ReactNode {
  const facts = usePanelFacts(chat, rows);
  return (
    <View className="gap-section-gap">
      <View className="flex-row gap-2">
        <View className="flex-1">
          <StatTile label="Cost" value={costText(facts.costMicros)} />
        </View>
        <View className="flex-1">
          <StatTile label="Messages" value={String(facts.messages)} />
        </View>
      </View>
      <List inset>
        <ListRow
          title={facts.model}
          subtitle={facts.engine}
          {...(facts.effort === null ? {} : { value: `${effortLabel(facts.effort)} thinking` })}
          icon="star"
        />
        <ListRow
          title="See costs"
          icon="gauge"
          chevron
          href={href.assistantCosts({ chat: chat.id })}
        />
      </List>
      {facts.files.length === 0 ? null : (
        <List title="Files in this chat" inset>
          {facts.files.map((file) => (
            <ListRow key={file.id} title={file.name} icon={file.image ? 'image' : 'fileText'} />
          ))}
        </List>
      )}
    </View>
  );
}

export function ChatDetails({
  chat,
  rows,
  open,
  onClose,
}: {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Chat details"
      kind="inspector"
      detents={['half', 'full']}
    >
      {open ? <Facts chat={chat} rows={rows} /> : null}
    </Sheet>
  );
}
