import { element, svgNode } from './overlay-nodes';

export interface OrbNodes {
  readonly root: HTMLElement;
  readonly level: HTMLElement;
  readonly aura: HTMLElement;
}

const SIZE = '40';

function stop(className: string, offset: string, opacity?: string): SVGStopElement {
  return svgNode('stop', {
    class: className,
    offset,
    ...(opacity === undefined ? {} : { 'stop-opacity': opacity }),
  });
}

function gradient(
  id: string,
  stops: readonly SVGStopElement[],
  extra = {},
): SVGRadialGradientElement {
  return svgNode('radialGradient', { id, ...extra }, stops);
}

function sphere(): SVGSVGElement {
  const core = gradient(
    'orb-core',
    [stop('s-shine', '0', '0.55'), stop('s-core', '0.28'), stop('s-deep', '1')],
    { cx: '38%', cy: '32%', r: '72%' },
  );
  return svgNode(
    'svg',
    { width: SIZE, height: SIZE, viewBox: '0 0 40 40', 'aria-hidden': 'true' },
    [
      svgNode('defs', {}, [core]),
      svgNode('circle', { cx: '20', cy: '20', r: '20', fill: 'url(#orb-core)' }),
    ],
  );
}

function swirl(): SVGSVGElement {
  const first = gradient('orb-a', [stop('s-a', '0', '0.85'), stop('s-a', '1', '0')]);
  const second = gradient('orb-b', [stop('s-b', '0', '0.75'), stop('s-b', '1', '0')]);
  const clip = svgNode('clipPath', { id: 'orb-clip' }, [
    svgNode('circle', { cx: '20', cy: '20', r: '20' }),
  ]);
  const blobs = svgNode('g', { 'clip-path': 'url(#orb-clip)' }, [
    svgNode('circle', { cx: '27', cy: '14', r: '12.4', fill: 'url(#orb-a)' }),
    svgNode('circle', { cx: '12.4', cy: '27.6', r: '11.2', fill: 'url(#orb-b)' }),
  ]);
  return svgNode(
    'svg',
    { width: SIZE, height: SIZE, viewBox: '0 0 40 40', 'aria-hidden': 'true' },
    [svgNode('defs', {}, [first, second, clip]), blobs],
  );
}

export function buildOrb(): OrbNodes {
  const root = element('div', 'orb');
  root.dataset['orb'] = 'idle';
  const aura = element('i', 'orb-aura');
  const level = element('div', 'orb-lv');
  const pulse = element('div', 'orb-pulse');
  const swirlBox = element('div', 'orb-swirl');
  swirlBox.append(swirl());
  pulse.append(sphere(), swirlBox, element('i', 'orb-spec'));
  level.append(pulse);
  root.append(
    aura,
    element('i', 'orb-halo'),
    level,
    element('i', 'orb-burst'),
    element('i', 'orb-stop'),
  );
  return { root, level, aura };
}
