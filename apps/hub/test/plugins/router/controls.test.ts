import { describe, expect, it } from 'vitest';
import {
  renameInClientList,
  reserveInStaticList,
} from '../../../src/plugins/builtin/router/client-lists';
import { runRouterCommand } from '../../../src/plugins/builtin/router/controls';
import type { RouterShell, RunResult } from '../../../src/plugins/builtin/router/router-shell';

function recordingShell(replies: Readonly<Record<string, string>> = {}): {
  readonly shell: RouterShell;
  readonly commands: string[];
} {
  const commands: string[] = [];
  const shell: RouterShell = {
    collect: () => Promise.reject(new Error('not used')),
    run: (command): Promise<RunResult> => {
      commands.push(command);
      return Promise.resolve({ code: 0, stdout: replies[command] ?? '', stderr: '' });
    },
    close: () => undefined,
  };
  return { shell, commands };
}

describe('router client lists', () => {
  it('renames an existing client and adds a new one', () => {
    const list = 'Phone>AA:BB:CC:00:00:01>0>0>>>>>';
    expect(renameInClientList(list, 'aa:bb:cc:00:00:01', 'My phone')).toBe(
      'My phone>AA:BB:CC:00:00:01>0>0>>>>>',
    );
    expect(renameInClientList('', 'aa:bb:cc:00:00:02', 'PC')).toBe('PC>AA:BB:CC:00:00:02>0>0>>>>>');
  });

  it('reserves an address in the DHCP static list', () => {
    expect(
      reserveInStaticList('<AA:BB:CC:00:00:01>192.168.50.5>>', 'aa:bb:cc:00:00:01', '192.168.50.9'),
    ).toBe('<AA:BB:CC:00:00:01>192.168.50.9>>');
    expect(reserveInStaticList('', 'aa:bb:cc:00:00:02', '192.168.50.10')).toBe(
      '<AA:BB:CC:00:00:02>192.168.50.10>>',
    );
  });
});

describe('router controls', () => {
  it('blocks idempotently and quotes names', async () => {
    const { shell, commands } = recordingShell({ 'nvram get custom_clientlist': '' });
    const target = { shell, wirelessInterfaces: ['eth7', 'eth10'] };
    await runRouterCommand(target, {
      command: 'client',
      client: { action: 'block', mac: 'aa:bb:cc:00:00:01' },
    });
    await runRouterCommand(target, {
      command: 'client',
      client: { action: 'rename', mac: 'aa:bb:cc:00:00:01', name: "Alex's phone" },
    });
    await runRouterCommand(target, {
      command: 'client',
      client: { action: 'disconnect', mac: 'aa:bb:cc:00:00:01' },
    });
    expect(commands).toEqual([
      'iptables -C FORWARD -m mac --mac-source aa:bb:cc:00:00:01 -j DROP 2>/dev/null || iptables -I FORWARD -m mac --mac-source aa:bb:cc:00:00:01 -j DROP',
      'nvram get custom_clientlist',
      "nvram set custom_clientlist='Alex'\\''s phone>AA:BB:CC:00:00:01>0>0>>>>>' && nvram commit",
      "wl -i 'eth7' deauthenticate aa:bb:cc:00:00:01; wl -i 'eth10' deauthenticate aa:bb:cc:00:00:01; true",
    ]);
  });
});
