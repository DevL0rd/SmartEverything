const MACHINE_FOLDER =
  'Ordinary native file paths and shell workdirs refer to this selected machine and its current working directory. Use set_working_directory to change the primary folder and index context in this chat.';
const CENTRAL_FILES =
  'Central chat-owned files are separate. Use project_read and project_edit with workspace/ or temporary/ paths, and browser_control open with a path to show a file or folder in the app. They stay on the Hub across machine changes and are deleted with the chat. Files are never copied or mounted automatically.';
const CHAT_FOLDER =
  'The working directory is this chat’s own folder on the Hub: keep deliverables under workspace/ (browser_control opens them from there) and scratch files under temporary/. Paths are relative to that folder, and it is deleted with the chat.';

export function projectWorkspaceContext(server: boolean): string {
  return server ? CHAT_FOLDER : `${MACHINE_FOLDER} ${CENTRAL_FILES}`;
}
