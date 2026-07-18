import { describe, expect, it } from 'vitest';
import { pcm16MonoToWav } from './pcm-wav';

describe('pcm16MonoToWav', () => {
  it('writes RIFF/WAVE header and appends PCM', () => {
    const pcm = new Uint8Array([0, 0, 0xff, 0x7f]);
    const wav = pcm16MonoToWav(pcm, 16000);
    expect(wav.byteLength).toBe(48);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(wav.slice(44)).toEqual(pcm);
  });
});
