interface Leaf<T> {
  readonly value: T;
  readonly names: readonly string[];
}

export interface Found<T> {
  readonly value: T;
  readonly params: Readonly<Record<string, string>>;
}

class Node<T> {
  readonly literals = new Map<string, Node<T>>();
  readonly leaves = new Map<string, Leaf<T>>();
  param: Node<T> | null = null;

  child(segment: string): Node<T> {
    if (segment.startsWith(':')) {
      this.param ??= new Node<T>();
      return this.param;
    }
    const known = this.literals.get(segment);
    if (known !== undefined) {
      return known;
    }
    const created = new Node<T>();
    this.literals.set(segment, created);
    return created;
  }
}

function segmentsOf(path: string): readonly string[] {
  return path.split('/').filter((segment) => segment !== '');
}

function paramsOf(names: readonly string[], values: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    names.map((name, index) => [name, decodeURIComponent(values[index] ?? '')]),
  );
}

export class RouteIndex<T> {
  private readonly root = new Node<T>();

  add(method: string, path: string, value: T): void {
    const segments = segmentsOf(path);
    const node = segments.reduce((at, segment) => at.child(segment), this.root);
    const names = segments.filter((segment) => segment.startsWith(':'));
    node.leaves.set(method, { value, names: names.map((name) => name.slice(1)) });
  }

  find(method: string, pathname: string): Found<T> | 'wrong_method' | null {
    const segments = segmentsOf(pathname);
    const visit = (
      node: Node<T>,
      depth: number,
      values: readonly string[],
    ): Found<T> | 'wrong_method' | null => {
      const segment = segments[depth];
      if (segment === undefined) {
        const leaf = node.leaves.get(method);
        if (leaf !== undefined) {
          return { value: leaf.value, params: paramsOf(leaf.names, values) };
        }
        return node.leaves.size > 0 ? 'wrong_method' : null;
      }
      const literal = node.literals.get(segment);
      const viaLiteral = literal === undefined ? null : visit(literal, depth + 1, values);
      if (viaLiteral !== null && viaLiteral !== 'wrong_method') {
        return viaLiteral;
      }
      const viaParam =
        node.param === null ? null : visit(node.param, depth + 1, [...values, segment]);
      return viaParam ?? viaLiteral;
    };
    return visit(this.root, 0, []);
  }
}
