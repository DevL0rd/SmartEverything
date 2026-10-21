import type { Served } from './served-types';

export const SERVED_COMPUTERS = [
  {
    name: 'computer_read',
    area: 'computers',
    access: 'read',
    title: 'Read a computer',
    line: 'Load, sound, screens, system, apps, permissions',
    description:
      'One computer (deviceId left out means the computer this chat runs on or the only one), read fresh: view now, the default, gives a summary, battery, processor, graphics, memory, disks, network and temperatures; other views give a reading over time, what SmartEverything may do on it, sound, screens, system settings, windows, tiling, services and startup apps or installed apps. Read the view before changing it; it gives the ids the set tools take.',
    route: {
      key: 'view',
      default: 'now',
      branches: {
        now: {
          part: 'computer_read',
          line: 'Summary, battery, processor, memory, disks, network, temperatures',
        },
        history: {
          part: 'get_computer_history',
          line: 'One reading over the last 10 minutes, 24 hours (default) or 30 days',
        },
        permissions: {
          part: 'read_computer_permissions',
          line: 'What SmartEverything may do on it',
        },
        audio: { part: 'get_computer_audio', line: 'Outputs, inputs and apps playing sound' },
        displays: {
          part: 'get_computer_displays',
          line: 'Screens with resolution, scale, brightness; modes lists every resolution',
        },
        system: {
          part: 'get_computer_system',
          line: 'Power mode, Do Not Disturb, keyboard, Wi-Fi, Bluetooth, USB',
        },
        windows: {
          part: 'get_computer_windows',
          line: 'Open windows with windowId and the one in front',
        },
        tiling: {
          part: 'get_computer_tiling',
          line: 'Window tiling; operation_call changeComputerTiling changes it',
        },
        services: { part: 'get_computer_services', line: 'Services, timers and apps that start at sign-in' },
        apps: {
          part: 'list_installed_apps',
          line: 'Installed apps, the one in front and time spent in each',
        },
      },
    },
  },
  {
    name: 'process_read',
    area: 'computers',
    access: 'read',
    title: 'Read processes',
    line: 'Programs running on a computer',
    description:
      'Programs running on a computer, busiest first by processor, memory, disk or graphics, or sorted by name, threads, user or id; search filters by name, tree groups children, cursor pages on. pid gives one program in full (command, start, parent, children, open files, sockets, priority). Read it for the pid process_control takes.',
    route: { part: 'process_read' },
  },
  {
    name: 'process_control',
    area: 'computers',
    access: 'control',
    title: 'Control a process',
    line: 'End, pause, resume or reprioritise',
    description:
      'Ends, force quits, pauses or resumes one of the signed-in person’s programs by pid from process_read, or sets its priority (nice 0 normal, 10 low, 19 lowest). Force quitting can lose unsaved work; ending the hub’s own program is refused.',
    route: { part: 'process_control' },
  },
  {
    name: 'computer_audio_set',
    area: 'computers',
    access: 'control',
    title: 'Change computer sound',
    line: 'Volume, mute, default device, app output',
    description:
      'Sets the volume or mute of a computer’s output, input or one app, changes the default output or input, or moves an app to another output; ids come from computer_read view audio. Returns the sound after the change.',
    route: { part: 'computer_audio_set' },
  },
  {
    name: 'computer_display_set',
    area: 'computers',
    access: 'control',
    title: 'Change computer screens',
    line: 'On or off, resolution, scale, brightness',
    description:
      'Turns a screen on or off or changes its resolution, scale, rotation, primary, position, mirroring, brightness, HDR, adaptive sync or night light; ids come from computer_read view displays. A change that can blank a screen reverts after 15 seconds unless action keep confirms it after the person says it looks right.',
    route: { part: 'computer_display_set' },
  },
  {
    name: 'computer_system_set',
    area: 'computers',
    access: 'control',
    title: 'Change computer system',
    line: 'Power, Wi-Fi, Bluetooth, startup, services',
    description:
      'Sets a computer’s power mode, Do Not Disturb, keyboard layout, Wi-Fi, Bluetooth and its devices, startup apps, or starts, stops, restarts, enables or disables one of the person’s services; names come from computer_read. Wi-Fi off can cut the computer off from SmartEverything; stopping the hub’s own service is refused.',
    route: { part: 'computer_system_set' },
  },
  {
    name: 'computer_use',
    area: 'computers',
    access: 'control',
    title: 'Use a computer',
    line: 'Click, type, scroll and press keys',
    description:
      'Drives a computer like a person: click, double or right click, move, drag, scroll, type and press keys such as ctrl+l, at pixel coordinates of the picture sight_look returned (its pictureSize). look true returns a new picture. Needs pointer control switched on and approved on that computer. Prefer computer_app_control and browser_control when they can do the job; never type passwords or codes.',
    route: { part: 'computer_use' },
  },
  {
    name: 'computer_app_control',
    area: 'computers',
    access: 'control',
    title: 'Control apps and windows',
    line: 'Open or close an app, manage a window',
    description:
      'Opens or closes an installed app on a computer (appId from computer_read view apps), or brings a window to the front, minimises or closes it (windowId from computer_read view windows).',
    route: {
      key: 'action',
      branches: {
        open: { part: 'open_app', line: 'Open an installed app' },
        close: { part: 'close_app', line: 'Close an app; force when it hangs' },
        window_focus: { part: 'focus_window', line: 'Bring a window to the front' },
        window_minimise: { part: 'minimise_window', line: 'Minimise a window' },
        window_close: { part: 'close_window', line: 'Close a window' },
      },
    },
  },
  {
    name: 'file_read',
    area: 'computers',
    access: 'read',
    title: 'Read computer files',
    line: 'Folders, files, search and downloads',
    description:
      'Files on a computer, anywhere its user can read: a folder’s entries (cursor pages on), one file up to 5 MB, a search by name below a folder, one file’s details, or a download link of any size for the person (a folder or several items as one zip). Not for this chat’s project folder (project_read).',
    route: {
      key: 'view',
      branches: {
        folder: { part: 'list_files', line: 'A folder’s files and folders' },
        file: { part: 'read_file', line: 'One file’s content up to 5 MB' },
        search: { part: 'search_files', line: 'Files by name below a folder' },
        properties: { part: 'read_file_details', line: 'Size, owner, permissions and dates' },
        download: { part: 'prepare_download', line: 'A short-lived signed link for the person' },
      },
    },
  },
  {
    name: 'file_edit',
    area: 'computers',
    access: 'control',
    title: 'Edit computer files',
    line: 'Folder, rename, move, copy, trash, save',
    description:
      'Makes a folder, renames, moves, copies, moves to Trash, restores from Trash, or saves a chat attachment onto a computer. Nothing is deleted for good and nothing is overwritten unless replace is true. Returns what was done and what failed.',
    route: { part: 'file_edit' },
  },
  {
    name: 'claude_read',
    area: 'computers',
    access: 'read',
    title: 'Read Claude',
    line: 'Claude chats, history, prompts and usage',
    description:
      'Claude on the computers: the Claude CLI chats SmartEverything started with their history, prompts and operation receipts, and the older Claude Desktop and terminal sessions, transcripts and usage. Read cli_sessions for the chatId, cli_prompts for what a chat waits on and models for the model ids before claude_control.',
    route: {
      key: 'view',
      default: 'cli_sessions',
      branches: {
        models: { part: 'list_claude_models', line: 'Models Claude offers on a computer' },
        cli_sessions: {
          part: 'list_claude_cli_sessions',
          line: 'Claude CLI chats started on a computer',
        },
        cli_session: { part: 'read_claude_cli_session', line: 'One CLI chat and its saved state' },
        cli_history: { part: 'read_claude_cli_history', line: 'The history of one CLI chat' },
        cli_operation: {
          part: 'read_claude_cli_operation',
          line: 'The receipt of one CLI operation',
        },
        cli_prompts: {
          part: 'list_claude_cli_prompts',
          line: 'Permission, question and plan prompts a CLI chat waits on',
        },
        status: { part: 'read_claude_status', line: 'Whether Claude is installed and linked' },
        sessions: {
          part: 'list_claude_sessions',
          line: 'Older Claude Desktop and terminal sessions',
        },
        session: { part: 'read_claude_session', line: 'One older session' },
        thread: { part: 'read_claude_thread', line: 'The transcript of an older session' },
        usage: { part: 'read_claude_usage', line: 'Plan usage figures' },
        prompts: { part: 'list_claude_prompts', line: 'Prompts older sessions wait on' },
      },
    },
  },
  {
    name: 'claude_control',
    area: 'computers',
    access: 'control',
    title: 'Control Claude',
    line: 'Start, message, stop or answer Claude',
    description:
      'Runs Claude CLI chats on a computer: starts one in a working directory with a first message, sends a message (also resumes a stopped chat), stops its reply, closes its process, changes its model or permission mode, or answers a permission, question or plan prompt it waits on. chatId comes from start or claude_read view cli_sessions; operation, session and job ids are filled in. Returns the chat and whether Claude accepted it.',
    route: {
      key: 'action',
      branches: {
        start: {
          part: 'start_claude_session',
          line: 'Start a chat with a working directory and a first message',
        },
        send: { part: 'send_claude_message', line: 'Send a message; steers a running reply' },
        stop: { part: 'stop_claude_session', line: 'Stop the running reply' },
        close: { part: 'close_claude_session', line: 'End the chat’s Claude process' },
        configure: {
          part: 'configure_claude_session',
          line: 'Change the model or the permission mode',
        },
        answer: {
          part: 'answer_claude_prompt',
          line: 'Answer a waiting permission, question or plan prompt',
        },
      },
    },
  },
] as const satisfies readonly Served[];
