import { describe, expect, it } from 'vitest';
import { firewallScript, type FirewallPlan, type PortRule } from '../src';

const REVISION = '0123456789abcdef';
const ANNOUNCEMENT: PortRule = {
  purpose: 'announcement',
  protocol: 'udp',
  port: 6666,
  source: '192.168.1.0/24',
};

describe('device announcement rules', () => {
  it('open the announced UDP port to the home network with ufw', () => {
    const plan: FirewallPlan = {
      backend: 'ufw',
      revision: REVISION,
      rules: [{ rule: ANNOUNCEMENT, prepend: false }],
      unprivilegedPortStart: null,
    };
    expect(firewallScript(plan)).toEqual([
      "ufw allow in proto udp from 192.168.1.0/24 to any port 6666 comment 'SmartEverything device announcements'",
    ]);
  });

  it('open the announced UDP port to the home network with firewalld', () => {
    const plan: FirewallPlan = {
      backend: 'firewalld',
      revision: REVISION,
      zone: 'home',
      rules: [ANNOUNCEMENT],
      unprivilegedPortStart: null,
    };
    expect(firewallScript(plan)).toEqual([
      `firewall-cmd --permanent --zone=home '--add-rich-rule=rule family="ipv4" source address="192.168.1.0/24" port port="6666" protocol="udp" accept'`,
      'firewall-cmd --reload',
    ]);
  });

  it('open the announced UDP port to the home network on Windows', () => {
    const plan: FirewallPlan = {
      backend: 'windows',
      revision: REVISION,
      program: 'C:\\go2rtc.exe',
      appProgram: 'C:\\SmartEverything.exe',
      rules: [ANNOUNCEMENT],
    };
    const [command] = firewallScript(plan);
    expect(command).toContain("'SmartEverything device announcements UDP 6666 192.168.1.0/24'");
    expect(command).toContain("-LocalPort '6666'");
    expect(command).toContain("-RemoteAddress '192.168.1.0/24'");
    expect(command).toContain("-Program 'C:\\SmartEverything.exe'");
  });
});
