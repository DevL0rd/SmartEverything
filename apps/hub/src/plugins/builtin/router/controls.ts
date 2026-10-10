import type { RouterClientAction, RouterCommand } from '@smarteverything/domain';
import { renameInClientList, reserveInStaticList } from './client-lists';
import { runChecked, type RouterShell } from './router-shell';
import { shellQuote } from './ssh-shell';

interface ControlTarget {
  readonly shell: RouterShell;
  readonly wirelessInterfaces: readonly string[];
}

class RouterControlError extends Error {
  override readonly name = 'RouterControlError';
}

export async function runRouterCommand(
  target: ControlTarget,
  command: RouterCommand,
): Promise<string> {
  switch (command.command) {
    case 'reboot':
      await runChecked(target.shell, 'reboot');
      return 'The router is restarting';
    case 'restart_wifi':
      await runChecked(target.shell, 'service restart_wireless');
      return 'Wi-Fi is restarting';
    case 'client':
      return runClientAction(target, command.client);
  }
}

async function runClientAction(target: ControlTarget, action: RouterClientAction): Promise<string> {
  switch (action.action) {
    case 'disconnect':
      return disconnect(target, action.mac);
    case 'block':
      await runChecked(target.shell, `${blockCheck(action.mac)} || ${blockRule('-I', action.mac)}`);
      return 'Internet access is blocked';
    case 'unblock':
      await runChecked(
        target.shell,
        `while ${blockCheck(action.mac)}; do ${blockRule('-D', action.mac)}; done`,
      );
      return 'Internet access is allowed again';
    case 'rename':
      return rename(target.shell, action.mac, action.name);
    case 'reserve':
      return reserve(target.shell, action.mac, action.ip);
  }
}

async function disconnect(target: ControlTarget, mac: string): Promise<string> {
  if (target.wirelessInterfaces.length === 0) {
    throw new RouterControlError('The router has not reported its Wi-Fi radios yet');
  }
  const commands = target.wirelessInterfaces.map(
    (name) => `wl -i ${shellQuote(name)} deauthenticate ${mac}`,
  );
  await runChecked(target.shell, `${commands.join('; ')}; true`);
  return 'The device was disconnected from Wi-Fi';
}

function blockCheck(mac: string): string {
  return `iptables -C FORWARD -m mac --mac-source ${mac} -j DROP 2>/dev/null`;
}

function blockRule(flag: '-I' | '-D', mac: string): string {
  return `iptables ${flag} FORWARD -m mac --mac-source ${mac} -j DROP`;
}

async function rename(shell: RouterShell, mac: string, name: string): Promise<string> {
  const current = await runChecked(shell, 'nvram get custom_clientlist');
  const updated = renameInClientList(current, mac, name);
  await runChecked(shell, `nvram set custom_clientlist=${shellQuote(updated)} && nvram commit`);
  return `Renamed to ${name}`;
}

async function reserve(shell: RouterShell, mac: string, ip: string): Promise<string> {
  const current = await runChecked(shell, 'nvram get dhcp_staticlist');
  const updated = reserveInStaticList(current, mac, ip);
  await runChecked(
    shell,
    `nvram set dhcp_staticlist=${shellQuote(updated)} && nvram set dhcp_static_x=1 && nvram commit && service restart_dnsmasq`,
  );
  return `${ip} is now reserved for this device`;
}
