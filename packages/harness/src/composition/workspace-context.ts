import type { AiHarnessStorageBinding } from '@smarteverything/domain';
export function projectWorkspaceContext(
  binding: AiHarnessStorageBinding | undefined,
  directory: string,
): string {
  const primary = `Primary machine folder: ${JSON.stringify(directory)}. Ordinary native file paths and shell workdirs refer to this selected machine. Use set_working_directory to change the primary folder and index context in this chat.`;
  const managed =
    'Central chat-owned files are separate. Use explicit read_project_files, write_project_files, remove_project_files and publish_project_preview with workspace/, temporary/ or transfers/ paths. They stay on the Hub across machine changes and are deleted with the chat. Existing managed workspace/foo files remain there; using native read on workspace/foo now refers to a machine path, so read those retained artifacts through read_project_files. Files are never copied or mounted automatically.';
  return `${primary} ${managed}${binding?.kind === 'device' ? ' The retained device project remains on its original machine when the chat is deleted.' : ''}`;
}
