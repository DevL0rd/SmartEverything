export function moveSlot<T>(slots: readonly T[], index: number, by: -1 | 1): readonly T[] {
  const target = index + by;
  const moving = slots[index];
  const swapped = slots[target];
  if (moving === undefined || swapped === undefined) {
    return slots;
  }
  return slots.map((slot, position) => {
    if (position === index) {
      return swapped;
    }
    return position === target ? moving : slot;
  });
}
