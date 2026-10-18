import type { McpToolAccess, McpToolArea } from './areas';
import type { McpCoreToolName } from './names';
import type { McpRoute } from './served-types';

type Entry = readonly [
  name: McpCoreToolName,
  area: McpToolArea,
  access: McpToolAccess,
  title: string,
  description: string,
];

export const COMPUTER_ENTRIES: readonly Entry[] = [
  [
    'get_computer',
    'computers',
    'read',
    'Read a computer',
    'One computer now, read fresh when you ask (it can take a couple of seconds): a summary line, battery, processor, graphics, memory, disks, network, temperatures, fans, power, which parts it offers, what SmartEverything may do on it and its power actions. Sound, screens, system, windows, services and startup apps are separate views.',
  ],
  [
    'get_computer_audio',
    'computers',
    'read',
    'Read sound',
    'Outputs and inputs with id, name, default, volume and mute, and each app playing sound with its streamId, volume, mute and output.',
  ],
  [
    'get_computer_displays',
    'computers',
    'read',
    'Read screens',
    'Screens with id, name, on or off, primary, resolution at refresh rate, scale, rotation, brightness and night light, and the change waiting to be kept. modes true also lists every resolution a screen offers.',
  ],
  [
    'get_computer_system',
    'computers',
    'read',
    'Read system settings',
    'Battery, power mode, Do Not Disturb, keyboard layout, Wi-Fi with saved networks and Bluetooth with its devices.',
  ],
  [
    'get_computer_usb',
    'computers',
    'read',
    'Read USB devices',
    'USB devices plugged into a computer, with id, name and maker.',
  ],
  [
    'get_computer_windows',
    'computers',
    'read',
    'Read windows',
    'Open windows with windowId, title, app, desktop, whether minimised and which one is in front.',
  ],
  [
    'get_computer_services',
    'computers',
    'read',
    'Read services',
    'Background services with unit, state and whether they start at sign-in, and scheduled timers with next and last run.',
  ],
  [
    'get_computer_startup',
    'computers',
    'read',
    'Read startup apps',
    'Apps that start at sign-in, with id, name and whether each is on.',
  ],
  [
    'list_processes',
    'computers',
    'read',
    'List programs',
    'Programs running on a computer, busiest first by processor, memory, disk or graphics, or sorted by name, threads, user or id. search matches a name, tree groups children under their parent, pass next from the answer as cursor for the following page. pid gives one program in detail instead: command, location, start time, parent, children, user, open files, sockets and priority.',
  ],
  [
    'end_process',
    'computers',
    'control',
    'End a program',
    'Ends, force quits, pauses or resumes one of the signed-in person’s programs by pid from list_processes, or sets its priority (nice 0 normal, 10 low, 19 lowest). Force quitting can lose unsaved work. Ending the hub’s own program is refused for the AI; the person does that from the hub’s page. The answer says what was done.',
  ],
  [
    'set_computer_audio',
    'computers',
    'control',
    'Change sound',
    'Sets the volume or mute of an output, input or one app, changes the default output or input, or moves an app to another output. Ids or names come from the sound view; the answer is the sound after the change.',
  ],
  [
    'set_computer_display',
    'computers',
    'control',
    'Change screens',
    'Turns a screen on or off and changes its resolution, scale, rotation, primary, position, mirroring, brightness, HDR, adaptive sync or night light. Changes that can blank a screen go back after 15 seconds unless the person says the screen looks right and keep confirms it; revert undoes it at once.',
  ],
  [
    'set_computer_system',
    'computers',
    'control',
    'Change system settings',
    'Sets power mode, Do Not Disturb, keyboard layout, Wi-Fi, Bluetooth and its devices, whether a startup app is on, and starts, stops, restarts, enables or disables one of the signed-in person’s services; read the system view first for the names. Turning Wi-Fi off can cut the computer off from SmartEverything, and Bluetooth off drops its keyboard and mouse, so check how the person is reaching it first. Stopping, restarting or disabling the hub’s own service is refused for the AI; the person does that from the hub’s page. The answer says what changed and shows the setting as it is now.',
  ],
  [
    'focus_window',
    'computers',
    'control',
    'Bring a window to the front',
    'Brings one window to the front by windowId from the windows view.',
  ],
  [
    'minimise_window',
    'computers',
    'control',
    'Minimise a window',
    'Minimises one window by windowId from the windows view.',
  ],
  [
    'close_window',
    'computers',
    'control',
    'Close a window',
    'Closes one window by windowId from the windows view; the app asks to save if it needs to.',
  ],
  [
    'edit_computer_files',
    'computers',
    'control',
    'Change files',
    'Makes a folder, renames, moves, copies, moves to Trash, restores from Trash, or saves a file attached to the chat onto the computer. Nothing is deleted for good and nothing is overwritten unless replace is true. The answer lists what was done and what failed.',
  ],
];

export function servedComputerTool<Name extends McpCoreToolName>(
  name: Name,
  route: McpRoute,
): readonly [Name, McpToolArea, McpToolAccess, string, string, McpRoute] {
  const entry = COMPUTER_ENTRIES.find(([entryName]) => entryName === name);
  if (entry === undefined) throw new Error(`No computer tool text for ${name}`);
  const [, area, access, title, description] = entry;
  return [name, area, access, title, description, route];
}
