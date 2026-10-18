import { compareText } from '../../format/text';

interface Fiber {
  readonly type: unknown;
  readonly memoizedProps: Readonly<Record<string, unknown>> | null;
  readonly child: Fiber | null;
  readonly sibling: Fiber | null;
  readonly stateNode: unknown;
}

interface HostNode {
  readonly host: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: readonly HostNode[];
}

const GRADIENTS = new Set(['Svg.LinearGradient', 'Svg.RadialGradient', 'Svg.Pattern']);

function isFiber(value: unknown): value is Fiber {
  return typeof value === 'object' && value !== null && 'child' in value && 'sibling' in value;
}

function hostOf(type: unknown): string | null {
  return typeof type === 'function' && 'host' in type && typeof type.host === 'string'
    ? type.host
    : null;
}

function hostsOf(fiber: Fiber | null): HostNode[] {
  const found: HostNode[] = [];
  for (let node = fiber; node !== null; node = node.sibling) {
    const host = hostOf(node.type);
    const children = hostsOf(node.child);
    if (host === null) found.push(...children);
    else found.push({ host, props: node.memoizedProps ?? {}, children });
  }
  return found;
}

function gradientsIn(node: HostNode, into: Map<string, HostNode>): void {
  const id = node.props['id'];
  if (GRADIENTS.has(node.host) && typeof id === 'string') into.set(id, node);
  for (const child of node.children) gradientsIn(child, into);
}

function printedText(value: string, defs: ReadonlyMap<string, HostNode>): string {
  const ref = /^url\(#(.+)\)$/.exec(value)?.[1];
  if (ref === undefined) return JSON.stringify(value);
  const gradient = defs.get(ref);
  if (gradient === undefined) throw new Error(`Unresolved url(#${ref})`);
  return `url(${serialise(gradient, defs, '', true)})`;
}

function printed(value: unknown, defs: ReadonlyMap<string, HostNode>): string {
  if (typeof value === 'function') return 'fn';
  if (typeof value === 'string') return printedText(value, defs);
  if (Array.isArray(value)) return `[${value.map((item) => printed(item, defs)).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .map(([key, item]) => `${key}:${printed(item, defs)}`)
      .join(',')}}`;
  }
  return String(value);
}

function serialise(
  node: HostNode,
  outer: ReadonlyMap<string, HostNode>,
  indent: string,
  inline = false,
): string {
  const defs = new Map(outer);
  if (node.host === 'Svg.default' || node.host === 'Svg.Svg') gradientsIn(node, defs);
  const props = Object.entries(node.props)
    .filter(([key]) => key !== 'children' && !(GRADIENTS.has(node.host) && key === 'id'))
    .sort(([a], [b]) => compareText(a, b))
    .map(([key, value]) => `${key}=${printed(value, defs)}`)
    .join(' ');
  const children = node.children.filter((child) => inline || !GRADIENTS.has(child.host));
  if (inline) {
    return `${node.host}(${props}; ${children.map((child) => serialise(child, defs, '', true)).join('; ')})`;
  }
  return [`${indent}${node.host} ${props}`]
    .concat(children.map((child) => serialise(child, defs, `${indent}  `)))
    .join('\n');
}

export function treeOf(container: object): string {
  const key = Object.keys(container).find((name) => name.startsWith('__reactContainer$'));
  const stale: unknown = key === undefined ? null : Reflect.get(container, key);
  const root: unknown = isFiber(stale) ? stale.stateNode : null;
  const current: unknown =
    typeof root === 'object' && root !== null ? Reflect.get(root, 'current') : null;
  return hostsOf(isFiber(current) ? current : null)
    .map((node) => serialise(node, new Map(), ''))
    .join('\n');
}
