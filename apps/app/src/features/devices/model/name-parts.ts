export interface NameParts {
  readonly head: string;
  readonly tail: string;
}

export function nameParts(name: string): NameParts {
  const space = name.lastIndexOf(' ');
  if (space <= 0 || space === name.length - 1) {
    return { head: name, tail: '' };
  }
  return { head: name.slice(0, space), tail: name.slice(space) };
}
