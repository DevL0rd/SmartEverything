import { FIREWALL_GROUP, type FirewallPlan, type PortRule, type UfwRule } from './api/firewall';

interface FirewallCommand {
  readonly program: string;
  readonly args: readonly string[];
}

export const SOCKETFILTERFW = '/usr/libexec/ApplicationFirewall/socketfilterfw';

const RULE_NAMES: Readonly<Record<PortRule['purpose'], string>> = {
  camera: `${FIREWALL_GROUP} camera`,
  webrtc: `${FIREWALL_GROUP} live video`,
  device: `${FIREWALL_GROUP} device push`,
};

const SAFE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;

function familyOf(address: string): 'ipv4' | 'ipv6' {
  return address.includes(':') ? 'ipv6' : 'ipv4';
}

function ufwMatch(rule: PortRule): readonly string[] {
  return rule.purpose === 'webrtc'
    ? ['proto', rule.protocol, 'from', 'any', 'to', 'any', 'port', String(rule.port)]
    : ['proto', rule.protocol, 'from', rule.source, 'to', 'any'];
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
  return rule.purpose === 'webrtc'
    ? `--add-port=${String(rule.port)}/${rule.protocol}`
    : `--add-rich-rule=rule family="${familyOf(rule.source)}" source address="${rule.source}" protocol value="${rule.protocol}" accept`;
}

function firewalldCommand(zone: string, rule: PortRule): FirewallCommand {
  return {
    program: 'firewall-cmd',
    args: ['--permanent', `--zone=${zone}`, firewalldChange(rule)],
  };
}

function windowsMatch(rule: PortRule): readonly string[] {
  return rule.purpose === 'webrtc'
    ? [
        '-DisplayName',
        `${RULE_NAMES.webrtc} ${rule.protocol.toUpperCase()} ${String(rule.port)}`,
        '-LocalPort',
        String(rule.port),
      ]
    : ['-DisplayName', `${RULE_NAMES[rule.purpose]} ${rule.source}`, '-RemoteAddress', rule.source];
}

type WindowsPrograms = Pick<
  FirewallPlan & { readonly backend: 'windows' },
  'program' | 'appProgram'
>;

function windowsCommand(plan: WindowsPrograms, rule: PortRule): FirewallCommand {
  const program = rule.purpose === 'device' ? plan.appProgram : plan.program;
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

function firewallCommands(plan: FirewallPlan): readonly FirewallCommand[] {
  switch (plan.backend) {
    case 'ufw':
      return plan.rules.map(ufwCommand);
    case 'firewalld':
      return [
        ...plan.rules.map((rule) => firewalldCommand(plan.zone, rule)),
        { program: 'firewall-cmd', args: ['--reload'] },
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

export const COMMAND_SEPARATOR = ';';

export function firewallArgv(plan: FirewallPlan): readonly string[] {
  return firewallCommands(plan).flatMap((command, index) => [
    ...(index === 0 ? [] : [COMMAND_SEPARATOR]),
    command.program,
    ...command.args,
  ]);
}

export function firewallScript(plan: FirewallPlan): readonly string[] {
  const quote = plan.backend === 'windows' ? powershellQuoted : posixQuoted;
  return firewallCommands(plan).map((command) =>
    [command.program, ...command.args.map(quote)].join(' '),
  );
}
