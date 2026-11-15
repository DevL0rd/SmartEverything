export const RING_PAGE_SCRIPT = `
const view = JSON.parse(document.getElementById('ring-view').textContent);
const report = (event) => { document.title = view.prefix + event; };
const clockNode = document.getElementById('clock');
const periodNode = document.getElementById('period');
const dateNode = document.getElementById('date');
const noteNode = document.getElementById('note');
const clockFormat = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' });
const tick = () => {
  const now = new Date();
  const parts = clockFormat.formatToParts(now);
  clockNode.textContent = parts.filter((part) => part.type !== 'dayPeriod').map((part) => part.value).join('').trim();
  periodNode.textContent = parts.find((part) => part.type === 'dayPeriod')?.value ?? '';
  dateNode.textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  setTimeout(tick, 60000 - (now.getTime() % 60000));
};
tick();
const note = (text, warn) => {
  noteNode.textContent = text;
  noteNode.classList.toggle('warn', warn);
};
let tonePlaying = false;
const tone = () => {
  if (tonePlaying) return;
  tonePlaying = true;
  const context = new AudioContext();
  const wave = context.createOscillator();
  const beat = context.createOscillator();
  const level = context.createGain();
  const depth = context.createGain();
  wave.type = 'square';
  wave.frequency.value = 880;
  beat.type = 'square';
  beat.frequency.value = 2;
  depth.gain.value = 0.25;
  level.gain.setValueAtTime(view.rampSeconds > 0 ? 0 : 0.25, context.currentTime);
  if (view.rampSeconds > 0) level.gain.linearRampToValueAtTime(0.25, context.currentTime + view.rampSeconds);
  beat.connect(depth).connect(level.gain);
  wave.connect(level).connect(context.destination);
  wave.start();
  beat.start();
  context.resume();
};
const play = (source) => {
  const audio = new Audio();
  let started = false;
  let failed = false;
  const fail = (why) => {
    if (failed) return;
    failed = true;
    audio.pause();
    audio.removeAttribute('src');
    note(why, true);
    tone();
    report('sound-failed');
  };
  const broken = 'Couldn’t play ' + source.name + ', so the alarm tone is ringing.';
  audio.addEventListener('playing', () => {
    started = true;
    note('Playing ' + source.name, false);
  });
  audio.addEventListener('error', () => fail(broken));
  audio.addEventListener('stalled', () => { if (!started) fail(broken); });
  audio.addEventListener('ended', () => fail(source.name + ' stopped, so the alarm tone is ringing.'));
  audio.loop = source.kind === 'file';
  audio.volume = view.rampSeconds > 0 ? 0 : 1;
  if (view.rampSeconds > 0) {
    const begin = Date.now();
    const ramp = setInterval(() => {
      const share = Math.min((Date.now() - begin) / (view.rampSeconds * 1000), 1);
      audio.volume = share;
      if (share === 1) clearInterval(ramp);
    }, 250);
  }
  audio.src = source.url;
  note('Starting ' + source.name, false);
  audio.play().catch(() => fail(broken));
};
if (view.source.kind === 'tone') {
  tone();
  if (view.source.reason !== null) note(view.source.reason + ' The alarm tone is ringing.', true);
} else {
  play(view.source);
}
for (const button of document.querySelectorAll('button[data-choice]')) {
  button.addEventListener('click', () => report(button.dataset.choice));
}
const maths = document.getElementById('maths');
if (maths !== null) {
  let index = 0;
  const problemNode = document.getElementById('problem');
  const answerNode = document.getElementById('answer');
  const wrongNode = document.getElementById('wrong');
  const stepNode = document.getElementById('step');
  const bars = document.querySelectorAll('.progress i');
  const show = () => {
    problemNode.textContent = view.problems[index].text + ' = ?';
    stepNode.textContent = 'Problem ' + (index + 1) + ' of ' + view.problems.length;
    bars.forEach((bar, at) => bar.classList.toggle('done', at < index));
    answerNode.value = '';
    answerNode.focus();
  };
  show();
  maths.addEventListener('submit', (event) => {
    event.preventDefault();
    const given = Number(answerNode.value.trim());
    if (answerNode.value.trim() === '' || given !== view.problems[index].answer) {
      wrongNode.textContent = 'Not quite. Try again.';
      maths.classList.remove('shake');
      void maths.offsetWidth;
      maths.classList.add('shake');
      answerNode.select();
      return;
    }
    wrongNode.textContent = '';
    index += 1;
    if (index === view.problems.length) {
      report('dismiss');
      return;
    }
    show();
  });
}
`;
