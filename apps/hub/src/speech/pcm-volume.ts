export function withVolume(pcm: Int16Array, percent: number | undefined): Int16Array {
  if (percent === undefined || percent === 100) {
    return pcm;
  }
  const gain = percent / 100;
  return pcm.map((sample) => Math.round(sample * gain));
}
