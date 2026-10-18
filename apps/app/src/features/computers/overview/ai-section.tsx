import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import type { Device } from '../../../store/state';
import { useHarnessCatalogue } from '../../assistant';
import { useComputerAi, useComputerModels } from '../data/computer-ai';
import {
  claudeLine,
  codexLine,
  runtimeHostOf,
  runtimeLine,
  useChatCounts,
} from '../data/computer-overview';
import { useComputerRuntime } from '../data/computer-runtime';
import { chatsLine } from '../model/chat-machine';

export function AiSection({
  device,
  owner,
}: {
  readonly device: Device;
  readonly owner: boolean;
}): ReactNode {
  const ai = useComputerAi(device.id);
  const claudeOn = ai.data?.settings.provider.enabled === true;
  const models = useComputerModels(device.id, claudeOn && device.online);
  const codex = useComputerRuntime(device.id);
  const catalogue = useHarnessCatalogue();
  const counts = useChatCounts(device.id);
  const runtime = runtimeLine(runtimeHostOf(catalogue.data, device.id));
  const claude = claudeLine(ai.data?.settings.provider.enabled, models.data?.length);
  const codexSummary = codexLine(codex.data);
  return (
    <List
      title="AI on this computer"
      {...(owner ? {} : { footer: 'Only the owner can change the AI on this computer.' })}
    >
      <ListRow
        title="SmartEverything runtime"
        icon="server"
        {...(runtime === undefined ? {} : { subtitle: runtime, wrapSubtitle: true })}
      />
      <ListRow
        title="Claude"
        icon="sparkles"
        chevron
        href={href.settings.device(device.id, 'claude')}
        {...(claude === undefined ? {} : { subtitle: claude })}
      />
      <ListRow
        title="Codex"
        icon="terminal"
        chevron
        href={href.settings.device(device.id, 'codex')}
        {...(codexSummary === undefined ? {} : { subtitle: codexSummary })}
      />
      <ListRow title="Chats on this computer" icon="messageCircle" subtitle={chatsLine(counts)} />
    </List>
  );
}
