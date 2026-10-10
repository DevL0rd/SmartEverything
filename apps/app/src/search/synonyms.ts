const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  crying: ['baby', 'cry'],
  baby: ['crying', 'cry'],
  movement: ['motion'],
  motion: ['movement'],
  people: ['person', 'human', 'someone'],
  person: ['people', 'human'],
  pets: ['pet', 'animal', 'dog', 'cat'],
  sound: ['noise', 'audio'],
  sounds: ['noise', 'audio'],
  night: ['dark', 'infrared', 'ir'],
  privacy: ['private', 'hide', 'cover'],
  record: ['recording', 'clip', 'video'],
  recording: ['record', 'clips', 'video'],
  clips: ['recording', 'video'],
  follow: ['track', 'tracking'],
  zoom: ['close-up', 'closeup'],
  patrol: ['cruise'],
  fence: ['area', 'zone'],
  gestures: ['hand'],
  volume: ['loud', 'quiet'],
  brightness: ['dim', 'bright'],
  speaker: ['volume', 'sound'],
  memory: ['sd', 'storage'],
  storage: ['sd', 'memory'],
  restart: ['reboot'],
  format: ['wipe', 'erase'],
  alerts: ['notifications', 'notify'],
  alert: ['notification', 'notify'],
  filter: ['filters'],
  timer: ['schedule'],
  costs: ['spend', 'spending', 'money', 'price'],
  budget: ['limit', 'spend'],
  walkie: ['intercom', 'radio'],
};

const WORD = /[^\p{L}\p{N}]+/u;

export function synonymsOf(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(WORD)
    .flatMap((word) => SYNONYMS[word] ?? []);
}
