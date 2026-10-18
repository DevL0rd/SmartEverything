type ProgramKind = 'bundled' | 'os' | 'optional-external';

interface ProgramEntry {
  readonly kind: ProgramKind;
  readonly reason: string;
}

interface BundledPackage {
  readonly packageName: string;
  readonly resolver: string;
}

export const BUNDLED_PACKAGES: readonly BundledPackage[] = [
  { packageName: 'ffmpeg-static', resolver: 'ffmpegPath()' },
];

export const PROGRAMS: Readonly<Record<string, ProgramEntry>> = {
  'ffmpegPath()': {
    kind: 'bundled',
    reason:
      'ffmpeg ships in the service through ffmpeg-static and is resolved by apps/hub/src/media/ffmpeg-path.ts',
  },
  'firewall-cmd': {
    kind: 'optional-external',
    reason:
      'the user’s own firewalld; the firewall page reads its state and offers the rules to apply',
  },
  ufw: {
    kind: 'optional-external',
    reason: 'the user’s own ufw; the firewall page reads its state and offers the rules to apply',
  },
  sysctl: {
    kind: 'os',
    reason:
      'always on Linux and macOS; lets the hub bind ports below 1024 and reads the Mac hardware and memory figures',
  },
  sh: { kind: 'os', reason: 'always on Linux and macOS; runs the elevated firewall script' },
  'New-NetFirewallRule': {
    kind: 'os',
    reason: 'a Windows PowerShell cmdlet, present on every supported Windows',
  },
  systemctl: { kind: 'os', reason: 'systemd manages the Linux service the app installs' },
  loginctl: { kind: 'os', reason: 'systemd-logind lists sessions, power actions and user linger' },
  launchctl: { kind: 'os', reason: 'launchd manages the macOS service the app installs' },
  reg: { kind: 'os', reason: 'Windows registry tool for the sign-in entry the app installs' },
  'wscript.exe': { kind: 'os', reason: 'Windows script host that starts the hidden service' },
  'xdg-mime': {
    kind: 'os',
    reason: 'registers the smarteverything:// link handler on Linux desktops',
  },
  pkexec: { kind: 'os', reason: 'polkit prompt for the elevated firewall change on Linux' },
  'powershell.exe': {
    kind: 'os',
    reason:
      'Windows PowerShell for the elevated firewall change and the persistent session that reads Windows computer figures',
  },
  osascript: { kind: 'os', reason: 'macOS prompt for the elevated firewall change' },
  git: {
    kind: 'optional-external',
    reason:
      'the user’s own git; adding a harness extension from a git source checks it out, and a missing git is reported as upstream_failed',
  },
  sw_vers: { kind: 'os', reason: 'always on macOS; names the system version of a Mac computer' },
  vm_stat: { kind: 'os', reason: 'always on macOS; reads the memory figures of a Mac computer' },
  df: { kind: 'os', reason: 'always on macOS; reads the used and free space of Mac drives' },
  mount: { kind: 'os', reason: 'always on macOS; names the file system type of each Mac drive' },
  netstat: {
    kind: 'os',
    reason: 'always on macOS; reads the byte counters of Mac network interfaces',
  },
  networksetup: {
    kind: 'os',
    reason: 'always on macOS; tells Wi-Fi from Ethernet for each Mac network interface',
  },
  pmset: {
    kind: 'os',
    reason: 'always on macOS; reads the battery of a Mac and sleeps or locks the screen',
  },
  ps: { kind: 'os', reason: 'always on macOS; lists the programs running on a Mac computer' },
  dscl: {
    kind: 'os',
    reason: 'always on macOS; maps the user numbers of running programs to account names',
  },
  open: {
    kind: 'os',
    reason: 'always on macOS; opens the link or file the person asked a Mac to open',
  },
  caffeinate: {
    kind: 'os',
    reason: 'always on macOS; wakes the display so the person can unlock a Mac',
  },
  unzip: {
    kind: 'optional-external',
    reason: 'the user’s own unzip; unpacking a downloaded app update on Linux needs it',
  },
  ditto: { kind: 'os', reason: 'always on macOS; unpacks a downloaded app update' },
  unzip: {
    kind: 'optional-external',
    reason:
      'the user’s own unzip; unpacking a downloaded Linux app update needs it and reports its absence',
  },
  ditto: {
    kind: 'os',
    reason: 'always on macOS; unpacks a downloaded app update with its permissions and links',
  },
  'xdg-open': {
    kind: 'os',
    reason:
      'the freedesktop opener of the Linux desktop; opens a link or file the person asked for',
  },
  gio: { kind: 'os', reason: 'GLib launcher present on Linux desktops that list apps' },
  pactl: {
    kind: 'os',
    reason: 'the PulseAudio or PipeWire client of the Linux desktop whose volume is controlled',
  },
  spectacle: {
    kind: 'os',
    reason: 'KDE Plasma screenshots; used only after the session is detected as Plasma',
  },
  'nvidia-smi': {
    kind: 'optional-external',
    reason:
      'exists only with the NVIDIA driver; without it GPU figures are absent and node.nvidia_unavailable is logged',
  },
  getconf: {
    kind: 'os',
    reason:
      'POSIX tool present on every Linux; reads the memory page size for process memory figures',
  },
  busctl: {
    kind: 'os',
    reason:
      'systemd D-Bus client present wherever systemd runs; reads keyboard layouts and sets do-not-disturb',
  },
  udevadm: {
    kind: 'os',
    reason:
      'systemd udev tool present wherever systemd runs; the device monitor follows hardware events',
  },
  nmcli: {
    kind: 'optional-external',
    reason: 'the NetworkManager client of the user’s desktop; Wi-Fi controls are absent without it',
  },
  bluetoothctl: {
    kind: 'optional-external',
    reason: 'the BlueZ client of the user’s desktop; Bluetooth controls are absent without it',
  },
  upower: {
    kind: 'optional-external',
    reason: 'the user’s own UPower; the battery reading is absent without it',
  },
  powerprofilesctl: {
    kind: 'optional-external',
    reason:
      'the user’s own power-profiles-daemon client; the power profile control is absent without it',
  },
  ddcutil: {
    kind: 'optional-external',
    reason: 'the user’s own ddcutil; monitor brightness control is absent without it',
  },
  'kscreen-doctor': {
    kind: 'optional-external',
    reason: 'KDE Plasma display tool; display controls use it only on Plasma',
  },
  kwriteconfig6: {
    kind: 'optional-external',
    reason: 'KDE Plasma configuration writer; the night light control uses it only on Plasma',
  },
  'wlr-randr': {
    kind: 'optional-external',
    reason: 'the user’s own wlr-randr; display controls use it only on wlroots Wayland sessions',
  },
  xrandr: {
    kind: 'optional-external',
    reason: 'the user’s own xrandr; display controls use it only on X11 sessions',
  },
  wmctrl: {
    kind: 'optional-external',
    reason: 'the user’s own wmctrl; window listing and focus use it only on X11 sessions',
  },
  xdotool: {
    kind: 'optional-external',
    reason: 'the user’s own xdotool; window minimize uses it only when installed',
  },
  xprop: {
    kind: 'optional-external',
    reason: 'the user’s own xprop; window details use it only on X11 sessions',
  },
  'pw-record': {
    kind: 'optional-external',
    reason: 'PipeWire recorder of the user’s desktop; the computer microphone uses it when present',
  },
  parec: {
    kind: 'optional-external',
    reason: 'PulseAudio recorder of the user’s desktop; the computer microphone falls back to it',
  },
  'pw-play': {
    kind: 'optional-external',
    reason: 'PipeWire player of the user’s desktop; the computer speaker uses it when present',
  },
  paplay: {
    kind: 'optional-external',
    reason: 'PulseAudio player of the user’s desktop; the computer speaker falls back to it',
  },
};

export const DYNAMIC_SITES: Readonly<Record<string, ProgramEntry>> = {
  'apps/desktop/src/firewall/apply.ts': {
    kind: 'os',
    reason: 'runs the pkexec, powershell.exe or osascript command the plan names',
  },
  'apps/desktop/src/service/system.ts': {
    kind: 'os',
    reason:
      'the service managers run systemctl, loginctl, launchctl, reg and wscript.exe through it',
  },
  'apps/desktop/src/service/ffmpeg-binary.ts': {
    kind: 'bundled',
    reason:
      'the packaging step runs the ffmpeg-static install script with the Node runtime that is already running it',
  },
  'apps/desktop/src/squirrel-events.ts': {
    kind: 'os',
    reason: 'Update.exe of the Windows installer the user ran to install the app',
  },
  'apps/hub/src/cameras/go2rtc-process.ts': {
    kind: 'bundled',
    reason: 'go2rtc ships with the app and its path comes from service.json',
  },
  'apps/hub/src/claude/claude-cli.ts': {
    kind: 'optional-external',
    reason: 'the user’s own Claude Code program; a missing one is reported as ClaudeNotReadyError',
  },
  'apps/hub/src/codex/process.ts': {
    kind: 'optional-external',
    reason: 'the user’s own Codex program, configured by codex_executable',
  },
  'apps/hub/src/firewall/system.ts': {
    kind: 'os',
    reason: 'the firewall readers run firewall-cmd, systemctl and the Windows and macOS tools',
  },
  'apps/hub/src/node/run-program.ts': {
    kind: 'os',
    reason: 'the Linux computer controls run gio, pactl, loginctl and spectacle through it',
  },
  'apps/hub/src/plugins/isolation/spawn.ts': {
    kind: 'bundled',
    reason: 'forks the plugin host script with the service’s own Node runtime',
  },
  'apps/hub/src/service.ts': {
    kind: 'bundled',
    reason: 'restarts the service with the Node runtime that is already running it',
  },
  'apps/hub/src/node/controls/linux/line-stream.ts': {
    kind: 'optional-external',
    reason: 'long-running desktop watchers start the program their caller names',
  },
  'apps/hub/src/node/controls/linux/mic-capture.ts': {
    kind: 'optional-external',
    reason: 'starts the recorder the detected audio stack provides',
  },
  'apps/hub/src/node/controls/linux/pulse-audio.ts': {
    kind: 'os',
    reason: 'runs pactl through the injected runner',
  },
  'apps/hub/src/node/controls/linux/speaker-playback.ts': {
    kind: 'optional-external',
    reason: 'starts the player the detected audio stack provides',
  },
  'apps/hub/src/node/controls/linux/tool-probe.ts': {
    kind: 'optional-external',
    reason: 'checks whether a desktop tool exists by running the program the caller names',
  },
};
