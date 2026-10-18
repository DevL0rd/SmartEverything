import { formatMegabits, type RouterSnapshot } from '@smarteverything/domain';

export function tileLine(snapshot: RouterSnapshot): string {
  switch (snapshot.connection.state) {
    case 'online':
      if (snapshot.network === null) {
        return 'Waiting for the router';
      }
      return snapshot.network.wanUp === false
        ? 'Internet is down'
        : `↓ ${formatMegabits(snapshot.network.downloadMbps)}`;
    case 'paused':
      return 'Monitoring paused';
    case 'connecting':
      return 'Connecting…';
    case 'unreachable':
      return 'Can’t be reached';
    case 'not_set_up':
      return 'Not set up';
  }
}
