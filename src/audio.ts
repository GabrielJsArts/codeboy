// Sintetizador chiptune ligero usando Web Audio API (cero archivos de audio externos)
class RetroAudio {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType = 'square',
    gainLevel = 0.06,
    delaySec = 0,
    slideToFreq?: number
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideToFreq), now + durationSec);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainLevel, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public dpadTick(): void {
    this.playTone(320, 0.045, 'triangle', 0.05, 0, 260);
  }

  public buttonA(): void {
    this.playTone(523.25, 0.06, 'square', 0.045, 0, 659.25);
  }

  public buttonB(): void {
    this.playTone(330, 0.07, 'square', 0.04, 0, 220);
  }

  public blockSnap(): void {
    this.playTone(440, 0.05, 'triangle', 0.055, 0, 587.33);
  }

  public stepMove(): void {
    this.playTone(290, 0.04, 'triangle', 0.04);
  }

  public pickup(): void {
    this.playTone(659.25, 0.07, 'square', 0.045, 0);
    this.playTone(880, 0.12, 'square', 0.045, 0.06);
  }

  public laser(): void {
    this.playTone(920, 0.11, 'sawtooth', 0.04, 0, 180);
  }

  public error(): void {
    this.playTone(190, 0.14, 'sawtooth', 0.05, 0, 110);
    this.playTone(140, 0.16, 'sawtooth', 0.05, 0.11, 90);
  }

  public bootChime(): void {
    this.playTone(523.25, 0.09, 'square', 0.045, 0);
    this.playTone(1046.5, 0.24, 'square', 0.045, 0.09);
  }

  public victory(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.playTone(n, idx === 3 ? 0.28 : 0.1, 'square', 0.045, idx * 0.09);
    });
  }
}

export const retroAudio = new RetroAudio();
