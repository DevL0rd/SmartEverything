export const OCR_LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  eng: 'English',
  deu: 'German',
  fra: 'French',
  spa: 'Spanish',
  ita: 'Italian',
  por: 'Portuguese',
  nld: 'Dutch',
  dan: 'Danish',
  swe: 'Swedish',
  nor: 'Norwegian',
  fin: 'Finnish',
  pol: 'Polish',
  ces: 'Czech',
  slk: 'Slovak',
  hun: 'Hungarian',
  ron: 'Romanian',
  ell: 'Greek',
  tur: 'Turkish',
  rus: 'Russian',
  ukr: 'Ukrainian',
  ara: 'Arabic',
  heb: 'Hebrew',
  hin: 'Hindi',
  tha: 'Thai',
  vie: 'Vietnamese',
  ind: 'Indonesian',
  jpn: 'Japanese',
  kor: 'Korean',
  chi_sim: 'Chinese, simplified',
  chi_tra: 'Chinese, traditional',
};

export interface OcrChoice {
  readonly code: string;
  readonly name: string;
  readonly chosen: boolean;
}

export function ocrChoicesOf(chosen: readonly string[]): readonly OcrChoice[] {
  const picked = new Set(chosen);
  const known = Object.keys(OCR_LANGUAGE_NAMES);
  const extra = chosen.filter((code) => !(code in OCR_LANGUAGE_NAMES));
  return [...known, ...extra].map((code) => ({
    code,
    name: OCR_LANGUAGE_NAMES[code] ?? code,
    chosen: picked.has(code),
  }));
}

export function ocrLanguagesAfter(
  chosen: readonly string[],
  code: string,
  on: boolean,
): readonly string[] | null {
  if (on) return chosen.includes(code) ? chosen : [...chosen, code];
  const left = chosen.filter((each) => each !== code);
  return left.length === 0 ? null : left;
}

export function ocrValueOf(chosen: readonly string[]): string {
  const names = chosen.map((code) => OCR_LANGUAGE_NAMES[code] ?? code);
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${String(names.length - 2)} more`;
}

export function ocrLineOf(chosen: readonly string[]): string {
  const names = chosen.map((code) => OCR_LANGUAGE_NAMES[code] ?? code);
  return `Reads text in pictures in ${names.join(', ')}. A new language downloads once to the Hub.`;
}
