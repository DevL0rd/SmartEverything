import { describe, expect, it } from 'vitest';
import {
  parseDf,
  parseHardwarePorts,
  parseMountTypes,
  parseNetstat,
  parsePmset,
  parseSwapUsage,
  parseVmStat,
  volumeRows,
} from '../../../src/node/collectors/darwin/darwin-parse';

const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               21834.
Pages active:                            301245.
Pages inactive:                          290012.
Pages speculative:                         9115.
Pages throttled:                              0.
Pages wired down:                        119310.
Pages purgeable:                           8021.
File-backed pages:                       150003.
Anonymous pages:                         450369.
`;

const DF = `Filesystem       1024-blocks      Used Available Capacity iused      ifree %iused  Mounted on
/dev/disk3s1s1     971350180  15500236 412398064     4%  426522 4122980640    0%   /
devfs                    214       214         0   100%     740          0  100%   /dev
/dev/disk3s6       971350180   6291460 412398064     2%       3 4122980640    0%   /System/Volumes/VM
/dev/disk3s5       971350180 523004972 412398064    56%  3101877 4122980640    0%   /System/Volumes/Data
/dev/disk5s1       500000000 100000000 400000000    20%     100  400000000    0%   /Volumes/Backup Drive
map auto_home              0         0         0   100%       0          0  100%   /System/Volumes/Data/home
`;

const MOUNT = `/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)
devfs on /dev (devfs, local, nobrowse)
/dev/disk3s5 on /System/Volumes/Data (apfs, local, journaled, nobrowse, protect)
/dev/disk5s1 on /Volumes/Backup Drive (exfat, local, nodev, nosuid, noowners)
`;

const NETSTAT = `Name  Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
lo0   16384 <Link#1>                           5040     0     812345     5040     0     812345     0
lo0   16384 127           127.0.0.1            5040     -     812345     5040     -     812345     -
en0   1500  <Link#6>    aa:bb:cc:dd:ee:ff   900123     0 1234567890   400200     0  234567890     0
en0   1500  192.168.1     192.168.1.20       900123     -  1234567890   400200     -  234567890     -
utun3 1380  <Link#12>                           10     0       2000       20     0       3000     0
en5   1500  <Link#9>    11:22:33:44:55:66        0     0          0        0     0          0     0
`;

const PORTS = `
Hardware Port: Ethernet Adapter (en5)
Device: en5
Ethernet Address: 11:22:33:44:55:66

Hardware Port: Wi-Fi
Device: en0
Ethernet Address: aa:bb:cc:dd:ee:ff

Hardware Port: Thunderbolt Bridge
Device: bridge0
Ethernet Address: N/A
`;

describe('reading Mac memory figures', () => {
  it('takes the page size and the page counts from vm_stat', () => {
    expect(parseVmStat(VM_STAT)).toStrictEqual({
      pageBytes: 16384,
      freePages: 21834,
      inactivePages: 290012,
      speculativePages: 9115,
      purgeablePages: 8021,
      cachedPages: 150003,
    });
  });

  it('reads swap usage in megabytes', () => {
    expect(
      parseSwapUsage('total = 2048.00M  used = 1023.25M  free = 1024.75M  (encrypted)'),
    ).toStrictEqual({ totalBytes: 2048 * 1048576, usedBytes: Math.round(1023.25 * 1048576) });
  });
});

describe('reading Mac drives', () => {
  it('parses df rows including a mount point with a space', () => {
    const rows = parseDf(DF);
    expect(rows.map((row) => row.mount)).toContain('/Volumes/Backup Drive');
    expect(rows.find((row) => row.mount === '/')).toMatchObject({
      device: '/dev/disk3s1s1',
      totalBytes: 971350180 * 1024,
      availableBytes: 412398064 * 1024,
    });
  });

  it('shows the data volume as the drive and drops the system volumes', () => {
    const volumes = volumeRows(parseDf(DF));
    expect(volumes.map((row) => [row.device, row.mount])).toStrictEqual([
      ['/dev/disk3s5', '/'],
      ['/dev/disk5s1', '/Volumes/Backup Drive'],
    ]);
  });

  it('names the file system of each device from mount', () => {
    const types = parseMountTypes(MOUNT);
    expect(types.get('/dev/disk3s5')).toBe('apfs');
    expect(types.get('/dev/disk5s1')).toBe('exfat');
  });
});

describe('reading Mac network counters', () => {
  it('takes the link line of each real interface and skips virtual ones', () => {
    expect(parseNetstat(NETSTAT)).toStrictEqual([
      { name: 'en0', receivedBytes: 1234567890, sentBytes: 234567890 },
      { name: 'en5', receivedBytes: 0, sentBytes: 0 },
    ]);
  });

  it('tells Wi-Fi from Ethernet by the hardware port name', () => {
    const kinds = parseHardwarePorts(PORTS);
    expect(kinds.get('en0')).toBe('wifi');
    expect(kinds.get('en5')).toBe('ethernet');
    expect(kinds.get('bridge0')).toBe('ethernet');
  });
});

describe('reading the Mac battery', () => {
  it('reads a discharging battery with its remaining time', () => {
    const text = `Now drawing from 'Battery Power'
 -InternalBattery-0 (id=4653155)\t87%; discharging; 5:23 remaining present: true`;
    expect(parsePmset(text)).toStrictEqual({
      level: 87,
      state: 'discharging',
      pluggedIn: false,
      minutesLeft: 323,
      healthPercent: null,
      drawWatts: null,
    });
  });

  it.each([
    ['83%; charging; 1:12 remaining present: true', 'charging'],
    ['100%; charged; 0:00 remaining present: true', 'full'],
    ['99%; AC attached; not charging present: true', 'idle'],
    ['99%; finishing charge; 0:03 remaining present: true', 'charging'],
  ] as const)('reads %j as %s', (line, state) => {
    const battery = parsePmset(`Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t${line}`);
    expect(battery?.state).toBe(state);
    expect(battery?.minutesLeft).toBeNull();
  });

  it('reports no battery on a desktop Mac', () => {
    expect(parsePmset("Now drawing from 'AC Power'\n")).toBeNull();
  });
});
