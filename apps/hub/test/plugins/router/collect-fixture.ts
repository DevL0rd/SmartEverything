export function collectReply(options: {
  readonly at: number;
  readonly wanRx: number;
  readonly wanTx: number;
  readonly busyJiffies: number;
  readonly slow: boolean;
  readonly withStatic: boolean;
}): string {
  const lines = [
    `TS=${String(options.at)}`,
    'load1=0.50',
    'load5=0.40',
    'load15=0.30',
    'procs=2/180',
    'uptime=86400.5',
    'cores=2',
    `STAT cpu ${String(options.busyJiffies)} 0 0 ${String(1000 + options.busyJiffies)} 0 0 0`,
    `STAT cpu0 ${String(options.busyJiffies / 2)} 0 0 ${String(500 + options.busyJiffies / 2)} 0 0 0`,
    `STAT cpu1 ${String(options.busyJiffies / 2)} 0 0 ${String(500 + options.busyJiffies / 2)} 0 0 0`,
    'mem_total=1000000',
    'mem_avail=400000',
    'swap_total=0',
    'swap_free=0',
    'cpu_temp_milli=61500',
    'conntrack=1200',
    'conntrack_max=300000',
    'wan_ifname=ppp0',
    `IF ppp0 ${String(options.wanRx)} ${String(options.wanTx)}`,
    'IF br0 5000 6000',
    'STA mac=AA:BB:CC:00:00:01 band=5GHz-1 phy=1201 data_mbps=8',
    'RCOUNT ifc=eth7 band=5GHz-1 clients=1',
    'RCOUNT ifc=eth10 band=2.4GHz clients=0',
    ...(options.slow ? slowLines() : []),
    ...(options.withStatic ? staticLines() : []),
    'ping_loss=0',
    'ping_rtt=12.34',
    'END=1',
  ];
  return `${lines.join('\n')}\n`;
}

function slowLines(): string[] {
  return [
    'wan_proto=pppoe',
    'wan_ip=203.0.113.7',
    'wan_gw=203.0.113.1',
    'wan_dns=1.1.1.1 9.9.9.9',
    'wan_state=2',
    'RADIO ifc=eth7 band=5GHz-1 temp=55 chan=36 width=160MHz noise=-92 busy=12 glitch=3 badplcp=0 dfs=Idle',
    'RADIO ifc=eth10 band=2.4GHz temp=50 chan=6 width=20MHz noise=-88 busy=40 glitch=1 badplcp=0 dfs=',
    'STASLOW mac=AA:BB:CC:00:00:01 rssi=-48 txrate=1200950 rxrate=864700',
    'LEASE mac=aa:bb:cc:00:00:01 ip=192.168.50.20 name=Phone',
    'LEASE mac=aa:bb:cc:00:00:02 ip=192.168.50.21 name=Desktop',
    'LEASE mac=aa:bb:cc:00:00:03 ip=192.168.50.22 name=*',
    'ARP aa:bb:cc:00:00:02 0x2',
    'ARP aa:bb:cc:00:00:03 0x0',
    'BLOCKED AA:BB:CC:00:00:03',
    'wrs_protect=1',
    'wrs_mals=1',
    'SLOW=1',
  ];
}

function staticLines(): string[] {
  return [
    'model=GT-AXE16000',
    'fw=388.8_4.0',
    'lan_ip=192.168.50.1',
    'PORT eth0 Up 1000 Mbps full duplex',
    'PORT eth1 Down',
    'RSTATIC band=5GHz-1 ssid=Home Network 5 radio=1 txpower=100',
    'RSTATIC band=2.4GHz ssid=Home Network radio=1 txpower=80',
    'STATIC=1',
  ];
}
