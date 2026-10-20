import { describe, expect, it } from 'vitest';
import {
  SOCKETFILTERFW,
  firewallScript,
  powershellQuoted,
  type FirewallPlan,
  type PortRule,
} from '../src';

const REVISION = '0123456789abcdef';
const WEBRTC: PortRule = { purpose: 'webrtc', protocol: 'tcp', port: 8555 };
const CAMERA: PortRule = { purpose: 'camera', protocol: 'udp', source: '192.168.1.20' };
const DEVICE: PortRule = { purpose: 'device', protocol: 'udp', source: 'fe80::1' };
const HUB: PortRule = { purpose: 'hub', protocol: 'tcp', port: 3000, source: '192.168.1.0/24' };
const DISCOVERY: PortRule = {
  purpose: 'discovery',
  protocol: 'udp',
  port: 5353,
  source: '192.168.1.0/24',
};
const PLUGIN: PortRule = { purpose: 'plugin', protocol: 'tcp', port: 9000, source: '10.0.0.0/8' };
const SYSCTL_PORT_FILE = '/etc/sysctl.d/60-smarteverything-ports.conf';

describe('ufw scripts', () => {
  it('opens a live video port to anyone and a camera to its address only', () => {
    const plan: FirewallPlan = {
      backend: 'ufw',
      revision: REVISION,
      unprivilegedPortStart: null,
      rules: [
        { rule: WEBRTC, prepend: false },
        { rule: CAMERA, prepend: true },
        { rule: HUB, prepend: false },
      ],
    };
    expect(firewallScript(plan)).toStrictEqual([
      "ufw allow in proto tcp from any to any port 8555 comment 'SmartEverything live video'",
      "ufw prepend allow in proto udp from 192.168.1.20 to any comment 'SmartEverything camera'",
      "ufw allow in proto tcp from 192.168.1.0/24 to any port 3000 comment 'SmartEverything encrypted LAN'",
    ]);
  });

  it('writes the low-port setting before the rules', () => {
    const plan: FirewallPlan = {
      backend: 'ufw',
      revision: REVISION,
      unprivilegedPortStart: 80,
      rules: [{ rule: DEVICE, prepend: false }],
    };
    const script = firewallScript(plan);
    expect(script).toHaveLength(3);
    expect(script[0]).toContain(SYSCTL_PORT_FILE);
    expect(script[1]).toBe('sysctl -w net.ipv4.ip_unprivileged_port_start=80');
    expect(script[2]).toContain("comment 'SmartEverything device push'");
  });
});

describe('sysctl scripts', () => {
  it('writes the setting to a file and applies it', () => {
    const script = firewallScript({
      backend: 'sysctl',
      revision: REVISION,
      unprivilegedPortStart: 443,
    });
    expect(script).toStrictEqual([
      `sh -c 'printf "%s = %s\n" "$0" "$1" > "$2"' net.ipv4.ip_unprivileged_port_start 443 ${SYSCTL_PORT_FILE}`,
      'sysctl -w net.ipv4.ip_unprivileged_port_start=443',
    ]);
  });
});

describe('firewalld scripts', () => {
  it('opens a bare port for live video and a protocol for cameras and devices, then reloads', () => {
    const script = firewallScript({
      backend: 'firewalld',
      revision: REVISION,
      zone: 'home',
      unprivilegedPortStart: null,
      rules: [WEBRTC, CAMERA, DEVICE],
    });
    expect(script).toStrictEqual([
      'firewall-cmd --permanent --zone=home --add-port=8555/tcp',
      `firewall-cmd --permanent --zone=home '--add-rich-rule=rule family="ipv4" source address="192.168.1.20" protocol value="udp" accept'`,
      `firewall-cmd --permanent --zone=home '--add-rich-rule=rule family="ipv6" source address="fe80::1" protocol value="udp" accept'`,
      'firewall-cmd --reload',
    ]);
  });

  it('opens a port to one network for the hub, discovery and plugins', () => {
    const script = firewallScript({
      backend: 'firewalld',
      revision: REVISION,
      zone: 'work',
      unprivilegedPortStart: null,
      rules: [HUB, DISCOVERY, PLUGIN],
    });
    expect(script).toStrictEqual([
      `firewall-cmd --permanent --zone=work '--add-rich-rule=rule family="ipv4" source address="192.168.1.0/24" port port="3000" protocol="tcp" accept'`,
      `firewall-cmd --permanent --zone=work '--add-rich-rule=rule family="ipv4" source address="192.168.1.0/24" port port="5353" protocol="udp" accept'`,
      `firewall-cmd --permanent --zone=work '--add-rich-rule=rule family="ipv4" source address="10.0.0.0/8" port port="9000" protocol="tcp" accept'`,
      'firewall-cmd --reload',
    ]);
  });

  it('has nothing to do and nothing to reload without rules or a port setting', () => {
    expect(
      firewallScript({
        backend: 'firewalld',
        revision: REVISION,
        zone: 'home',
        unprivilegedPortStart: null,
        rules: [],
      }),
    ).toStrictEqual([]);
  });
});

describe('windows scripts', () => {
  const plan: FirewallPlan = {
    backend: 'windows',
    revision: REVISION,
    program: 'C:\\go2rtc.exe',
    appProgram: 'C:\\SmartEverything.exe',
    rules: [WEBRTC, CAMERA, HUB],
  };

  it('names each rule by what it is for and ties live video and cameras to the media program', () => {
    const [webrtc, camera, hub] = firewallScript(plan);
    expect(webrtc).toContain("-DisplayName 'SmartEverything live video TCP 8555'");
    expect(webrtc).toContain("-LocalPort '8555'");
    expect(webrtc).toContain("-Program 'C:\\go2rtc.exe'");
    expect(camera).toContain("-DisplayName 'SmartEverything camera 192.168.1.20'");
    expect(camera).toContain("-Program 'C:\\go2rtc.exe'");
    expect(hub).toContain("-RemoteAddress '192.168.1.0/24'");
    expect(hub).toContain("-Program 'C:\\SmartEverything.exe'");
  });

  it('names hub, discovery and plugin rules by purpose, port and network', () => {
    const script = firewallScript({
      backend: 'windows',
      revision: REVISION,
      program: 'C:\\go2rtc.exe',
      appProgram: 'C:\\SmartEverything.exe',
      rules: [DISCOVERY, PLUGIN],
    });
    expect(script[0]).toContain("-DisplayName 'SmartEverything discovery UDP 5353 192.168.1.0/24'");
    expect(script[1]).toContain("-DisplayName 'SmartEverything plugin TCP 9000 10.0.0.0/8'");
  });

  it('starts every command with the rule cmdlet and leaves switches unquoted', () => {
    for (const line of firewallScript(plan)) {
      expect(line.startsWith('New-NetFirewallRule -DisplayName ')).toBe(true);
    }
  });

  it('doubles a single quote inside a value and leaves a switch alone', () => {
    expect(powershellQuoted("it's")).toBe("'it''s'");
    expect(powershellQuoted('-Group')).toBe('-Group');
  });
});

describe('macos scripts', () => {
  it('adds each program to the application firewall and unblocks it', () => {
    const script = firewallScript({
      backend: 'macos',
      revision: REVISION,
      programs: ['/Applications/SmartEverything.app', '/usr/local/bin/go2rtc'],
    });
    expect(script).toStrictEqual([
      `${SOCKETFILTERFW} --add /Applications/SmartEverything.app`,
      `${SOCKETFILTERFW} --unblockapp /Applications/SmartEverything.app`,
      `${SOCKETFILTERFW} --add /usr/local/bin/go2rtc`,
      `${SOCKETFILTERFW} --unblockapp /usr/local/bin/go2rtc`,
    ]);
  });

  it('quotes a program path with a space for the shell', () => {
    const [add] = firewallScript({
      backend: 'macos',
      revision: REVISION,
      programs: ['/Applications/Smart Everything.app'],
    });
    expect(add).toBe(`${SOCKETFILTERFW} --add '/Applications/Smart Everything.app'`);
  });
});
