const PERCENT = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?%$/;

function isPercent(text: string): text is `${number}%` {
  return PERCENT.test(text);
}

export function percentOf(share: number): `${number}%` {
  const text = `${String(share * 100)}%`;
  return isPercent(text) ? text : '0%';
}
