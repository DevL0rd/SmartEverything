export function sharesOf(values: readonly number[]): readonly number[] {
  const largest = Math.max(0, ...values);
  return values.map((value) => (largest === 0 ? 0 : value / largest));
}
