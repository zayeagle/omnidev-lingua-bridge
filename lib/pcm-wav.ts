/** Wrap PCM16LE mono into a WAV container for HTMLAudioElement playback. */

export function pcm16MonoToWav(
  pcm: Uint8Array,
  sampleRate = 16000,
): Uint8Array {
  const dataSize = pcm.byteLength;
  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[offset + i] = s.charCodeAt(i);
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  out.set(pcm, 44);
  return out;
}
