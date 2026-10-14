import type { AiHarnessStorageBinding } from '@smarteverything/domain';
export function projectWorkspaceContext(
  binding: AiHarnessStorageBinding | undefined,
  directory: string,
): string {
  if (binding === undefined) return '';
  if (binding.kind === 'managed')
    return 'Current file storage: the central managed project for this chat. Relative file paths use workspace/ by default; temporary/ is chat-owned scratch. The same files remain available across execution-device changes. Deleting the chat immediately removes all its managed workspace, temporary and transfer files. Native execution cwd is separate; central files have no local subprocess path. Select an explicit device project for local shell/jobs/indexing, and use publish_project_preview for a multi-file site.';
  return `Current file storage: the explicitly selected device project at ${JSON.stringify(directory)}. Native file, shell and indexer tools use that device directory; its project files stay on the device and are preserved when the chat is deleted. Use central project-file tools for chat-owned workspace/ and temporary/ files; deleting the chat immediately removes those managed files.`;
}
