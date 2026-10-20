const ACRONYMS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    cpu: 'CPU',
    gpu: 'GPU',
    ssd: 'SSD',
    hdd: 'HDD',
    nvme: 'NVMe',
    ram: 'RAM',
    usb: 'USB',
    acpi: 'ACPI',
    pch: 'PCH',
    vrm: 'VRM',
    soc: 'SoC',
    wifi: 'Wi-Fi',
    ac: 'AC',
    psu: 'PSU',
    rpm: 'RPM',
  }),
);

const WORDS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    mid: 'middle',
    mem: 'memory',
    temp: 'temperature',
    pwr: 'power',
    junction: 'hotspot',
    acpitz: 'ACPI thermal zone',
    cannonlake: 'Cannon Lake',
    skylake: 'Skylake',
    kabylake: 'Kaby Lake',
    coffeelake: 'Coffee Lake',
    cometlake: 'Comet Lake',
    icelake: 'Ice Lake',
    tigerlake: 'Tiger Lake',
    alderlake: 'Alder Lake',
    raptorlake: 'Raptor Lake',
    lunarlake: 'Lunar Lake',
  }),
);

const GPU_CHIP = /^(amdgpu|nouveau|radeon|nvidia|i915|xe)/i;

const GPU_LABELS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    edge: 'GPU edge',
    junction: 'GPU hotspot',
    mem: 'GPU memory',
  }),
);

const CHIPS: readonly (readonly [RegExp, string])[] = [
  [/^pch(_|$)/i, 'Chipset'],
  [/^(coretemp|k10temp|zenpower)/i, 'CPU'],
  [/^acpitz/i, 'ACPI thermal zone'],
  [/^nvme/i, 'NVMe drive'],
  [/^(iwlwifi|ath|mt7)/i, 'Wi-Fi'],
];

function wordsOf(raw: string): string[] {
  return raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_]+/)
    .filter((word) => word !== '');
}

function wordOf(word: string, keepCase: boolean): string {
  const lower = word.toLowerCase();
  const known = ACRONYMS.get(lower) ?? WORDS.get(lower);
  if (known !== undefined) return known;
  return keepCase || /\d/.test(word) ? word : lower;
}

function sentenceCase(text: string): string {
  const first = text.charAt(0);
  return first === first.toUpperCase() ? text : `${first.toUpperCase()}${text.slice(1)}`;
}

function alreadyReadable(raw: string): boolean {
  return !/_|[a-z][A-Z]/.test(raw) && (raw.includes(' ') || /[A-Z]/.test(raw));
}

export function readableLabel(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  const keepCase = alreadyReadable(trimmed);
  return sentenceCase(
    wordsOf(trimmed)
      .map((word) => wordOf(word, keepCase))
      .join(' '),
  );
}

function chipLabel(chip: string): string {
  const known = CHIPS.find(([pattern]) => pattern.test(chip));
  if (known === undefined) return readableLabel(chip);
  const rest = chip.replace(/^pch[_-]?/i, '');
  return /^pch/i.test(chip) && rest !== '' ? `${known[1]} (${readableLabel(rest)})` : known[1];
}

export function sensorLabel(chip: string, label: string): string {
  if (GPU_CHIP.test(chip)) {
    const gpu = GPU_LABELS.get(label.trim().toLowerCase());
    if (gpu !== undefined) return gpu;
  }
  if (label.trim().toLowerCase() === chip.trim().toLowerCase()) return chipLabel(chip);
  return readableLabel(label);
}
