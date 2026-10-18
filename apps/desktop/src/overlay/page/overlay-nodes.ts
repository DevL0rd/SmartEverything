import { ICONS, type IconName } from '../overlay-icons';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  return node;
}

export function svgNode<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string>>,
  children: readonly SVGElement[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NAMESPACE, tag);
  Object.entries(attributes).forEach(([name, value]) => {
    node.setAttribute(name, value);
  });
  children.forEach((child) => {
    node.append(child);
  });
  return node;
}

export function iconNode(name: IconName, size: number): SVGSVGElement {
  const svg = svgNode('svg', {
    viewBox: '0 0 24 24',
    width: String(size),
    height: String(size),
    fill: 'currentColor',
    'aria-hidden': 'true',
  });
  svg.innerHTML = ICONS[name];
  return svg;
}

export function textButton(className: string, label: string, text: string): HTMLButtonElement {
  const button = element('button', className);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.textContent = text;
  return button;
}

export function onChange(report: (value: boolean) => void): (value: boolean) => void {
  let last = false;
  return (value) => {
    if (value !== last) {
      last = value;
      report(value);
    }
  };
}
