export type PullUpDetent = 'peek' | 'half' | 'full';

export type OpenDetent = Exclude<PullUpDetent, 'peek'>;

const HALF_SHARE = 0.5;

const FLICK_VELOCITY = 800;

const SAME_HEIGHT = 1;

export function detentHeight(detent: PullUpDetent, host: number): number {
  'worklet';
  if (detent === 'peek') {
    return 0;
  }
  return detent === 'half' ? host * HALF_SHARE : host;
}

export function snapDetent(height: number, velocityY: number, host: number): PullUpDetent {
  'worklet';
  const stops: readonly PullUpDetent[] = ['peek', 'half', 'full'];
  if (velocityY > FLICK_VELOCITY) {
    return stops.findLast((stop) => detentHeight(stop, host) < height - SAME_HEIGHT) ?? 'peek';
  }
  if (velocityY < -FLICK_VELOCITY) {
    return stops.find((stop) => detentHeight(stop, host) > height + SAME_HEIGHT) ?? 'full';
  }
  return stops.reduce((best, stop) =>
    Math.abs(detentHeight(stop, host) - height) < Math.abs(detentHeight(best, host) - height)
      ? stop
      : best,
  );
}

export function cycleDetent(current: OpenDetent): PullUpDetent {
  return current === 'half' ? 'full' : 'peek';
}

export function stepDetent(current: OpenDetent, direction: 'taller' | 'shorter'): PullUpDetent {
  if (direction === 'taller') {
    return 'full';
  }
  return current === 'full' ? 'half' : 'peek';
}

export function openingDetent(short: boolean): OpenDetent {
  return short ? 'full' : 'half';
}

export function dragPlan(target: PullUpDetent, host: number): { rest: number; closes: boolean } {
  'worklet';
  return { rest: detentHeight(target, host), closes: target === 'peek' };
}
