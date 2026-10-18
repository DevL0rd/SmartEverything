import {
  FIREWALL_GROUP,
  UNPRIVILEGED_PORT_FILE,
  UNPRIVILEGED_PORT_KEY,
  type FirewallPlan,
  type PortRule,
  type UfwRule,
} from './api/firewall';

interface FirewallCommand {
  readonly program: string;
  readonly args: readonly string[];
}

export const SOCKETFILTERFW = '/usr/libexec/ApplicationFirewall/socketfilterfw';

const RULE_NAMES: Readonly<Record<PortRule['purpose'], string>> = {
  camera: `${FIREWALL_GROUP} camera`,
  webrtc: `${FIREWALL_GROUP} live video`,
  device: `${FIREWALL_GROUP} device push`,
  plugin: `${FIREWALL_GROUP} plugin`,
  hub: `${FIREWALL_GROUP} encrypted LAN`,
  discovery: `${FIREWALL_GROUP} discovery`,
  announcement: `${FIREWALL_GROUP} device announcements`,
};

const SAFE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;

function familyOf(address: string): 'ipv4' | 'ipv6' {
  return address.includes(':') ? 'ipv6' : 'ipv4';
}

function ufwMatch(rule: PortRule): readonly string[] {
  switch (rule.purpose) {
    case 'webrtc':
      return ['proto', rule.protocol, 'from', 'any', 'to', 'any', 'port', String(rule.port)];
    case 'hub':
    case 'discovery':
    case 'announcement':
    case 'plugin':
      return ['proto', rule.protocol, 'from', rule.source, 'to', 'any', 'port', String(rule.port)];
    case 'camera':
    case 'device':
      return ['proto', rule.protocol, 'from', rule.source, 'to', 'any'];
  }
}

function ufwCommand(entry: UfwRule): FirewallCommand {
  return {
    program: 'ufw',
    args: [
      ...(entry.prepend ? ['prepend'] : []),
      'allow',
      'in',
      ...ufwMatch(entry.rule),
      'comment',
      RULE_NAMES[entry.rule.purpose],
    ],
  };
}

function firewalldChange(rule: PortRule): string {
  switch (rule.purpose) {
    case 'webrtc':
      return `--add-port=${String(rule.port)}/${rule.protocol}`;
    case 'hub':
    case 'discovery':
    case 'announcement':
    case 'plugin':
      return `--add-rich-rule=rule family="${familyOf(rule.source)}" source address="${rule.source}" port port="${String(rule.port)}" protocol="${rule.protocol}" accept`;
    case 'camera':
    case 'device':
      return `--add-rich-rule=rule family="${familyOf(rule.source)}" source address="${rule.source}" protocol value="${rule.protocol}" accept`;
  }
}

function firewalldCommand(zone: string, rule: PortRule): FirewallCommand {
  return {
    program: 'firewall-cmd',
    args: ['--permanent', `--zone=${zone}`, firewalldChange(rule)],
  };
}

function windowsMatch(rule: PortRule): readonly string[] {
  switch (rule.purpose) {
    case 'webrtc':
      return [
        '-DisplayName',
        `${RULE_NAMES.webrtc} ${rule.protocol.toUpperCase()} ${String(rule.port)}`,
        '-LocalPort',
        String(rule.port),
      ];
    case 'hub':
    case 'discovery':
    case 'announcement':
    case 'plugin':
      return [
        '-DisplayName',
        `${RULE_NAMES[rule.purpose]} ${rule.protocol.toUpperCase()} ${String(rule.port)} ${rule.source}`,
        '-LocalPort',
        String(rule.port),
        '-RemoteAddress',
        rule.source,
      ];
    case 'camera':
    case 'device':
      return [
        '-DisplayName',
        `${RULE_NAMES[rule.purpose]} ${rule.source}`,
        '-RemoteAddress',
        rule.source,
      ];
  }
}

type WindowsPrograms = Pick<
  FirewallPlan & { readonly backend: 'windows' },
  'program' | 'appProgram'
>;

function windowsCommand(plan: WindowsPrograms, rule: PortRule): FirewallCommand {
  const program =
    rule.purpose === 'camera' || rule.purpose === 'webrtc' ? plan.program : plan.appProgram;
  return {
    program: 'New-NetFirewallRule',
    args: [
      ...windowsMatch(rule),
      '-Group',
      FIREWALL_GROUP,
      '-Direction',
      'Inbound',
      '-Action',
      'Allow',
      '-Profile',
      'Any',
      '-Program',
      program,
      '-Protocol',
      rule.protocol.toUpperCase(),
    ],
  };
}

function macCommands(program: string): readonly FirewallCommand[] {
  return [
    { program: SOCKETFILTERFW, args: ['--add', program] },
    { program: SOCKETFILTERFW, args: ['--unblockapp', program] },
  ];
}

function sysctlCommands(start: number | null): readonly FirewallCommand[] {
  if (start === null) {
    return [];
  }
  return [
    {
      program: 'sh',
      args: [
        '-c',
        'printf "%s = %s\n" "$0" "$1" > "$2"',
        UNPRIVILEGED_PORT_KEY,
        String(start),
        UNPRIVILEGED_PORT_FILE,
      ],
    },
    { program: 'sysctl', args: ['-w', `${UNPRIVILEGED_PORT_KEY}=${String(start)}`] },
  ];
}

function firewallCommands(plan: FirewallPlan): readonly FirewallCommand[] {
  switch (plan.backend) {
    case 'sysctl':
      return sysctlCommands(plan.unprivilegedPortStart);
    case 'ufw':
      return [...sysctlCommands(plan.unprivilegedPortStart), ...plan.rules.map(ufwCommand)];
    case 'firewalld':
      return [
        ...sysctlCommands(plan.unprivilegedPortStart),
        ...plan.rules.map((rule) => firewalldCommand(plan.zone, rule)),
        ...(plan.rules.length === 0 ? [] : [{ program: 'firewall-cmd', args: ['--reload'] }]),
      ];
    case 'windows':
      return plan.rules.map((rule) => windowsCommand(plan, rule));
    case 'macos':
      return plan.programs.flatMap(macCommands);
  }
}

function posixQuoted(text: string): string {
  return SAFE_WORD.test(text) ? text : `'${text.replaceAll("'", `'\\''`)}'`;
}

export function powershellQuoted(text: string): string {
  return text.startsWith('-') ? text : `'${text.replaceAll("'", "''")}'`;
}

export function firewallScript(plan: FirewallPlan): readonly string[] {
  const quote = plan.backend === 'windows' ? powershellQuoted : posixQuoted;
  return firewallCommands(plan).map((command) =>
    [command.program, ...command.args.map(quote)].join(' '),
  );
}
