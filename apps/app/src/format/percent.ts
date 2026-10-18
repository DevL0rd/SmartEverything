function isPercent(text: string): text is `${number}%` {
  return text.endsWith('%') && Number.isFinite(Number(text.slice(0, -1)));
}

export function percentOf(share: number): `${number}%` {
  const text = `${String(Math.round((Number.isFinite(share) ? share : 0) * 10000) / 100)}%`;
  return isPercent(text) ? text : '0%';
}
