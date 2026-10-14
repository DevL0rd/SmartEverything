interface Selection {
  readonly names: readonly string[];
  readonly selected: string | null;
  readonly select: (name: string) => void;
  readonly choose: (name: string) => void;
  readonly dismiss: () => void;
}
export function selectionKey(key: string, selection: Selection): boolean {
  if (key === 'Escape') {
    selection.dismiss();
    return true;
  }
  if (key === 'Tab' || key === 'Enter') return chooseSelected(selection);
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return false;
  const { names, selected } = selection;
  if (names.length === 0) return true;
  const next =
    names[
      (names.indexOf(selected ?? '') + (key === 'ArrowUp' ? -1 : 1) + names.length) % names.length
    ];
  if (next !== undefined) selection.select(next);
  return true;
}
function chooseSelected(selection: Selection): boolean {
  if (selection.selected === null) return false;
  selection.choose(selection.selected);
  return true;
}
