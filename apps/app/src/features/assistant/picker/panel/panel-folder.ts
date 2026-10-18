import { background } from '@smarteverything/logging';
import type { AiChatRow, DshEngine } from '@smarteverything/domain';
import { notify } from '../../../../components/toast-store';
import { changeChat } from '../../chats/chat-actions';
import { useChatHandoff } from '../../chats/chat-engine-change';
import type { ComputerEngine } from '../../provider/computer-engine';
import { folderName } from './panel-machine';

export function useFolderChange(chat: AiChatRow, engine: DshEngine): (path: string) => void {
  const handoff = useChatHandoff(chat);
  return (path): void => {
    handoff(engine, {
      directory: { target: engine.execution_target, path },
      failure: 'Folder not changed',
      onSuccess: (result): void => {
        notify({
          message:
            result.state === 'pending'
              ? 'The folder changes after the current step'
              : `Folder is now ${folderName(path) ?? path}`,
          tone: 'positive',
        });
      },
    });
  };
}

export function useComputerFolderChange(
  chat: AiChatRow,
  engine: ComputerEngine,
): (path: string) => void {
  return (path): void => {
    background(
      changeChat(chat.id, { engine: withFolder(engine, path) }),
      'chat.folder_change_failed',
    );
    notify({ message: `Folder is now ${folderName(path) ?? path}`, tone: 'positive' });
  };
}

function withFolder(engine: ComputerEngine, cwd: string): ComputerEngine {
  return engine.kind === 'claude'
    ? { ...engine, settings: { ...engine.settings, cwd } }
    : { ...engine, settings: { ...engine.settings, cwd } };
}
