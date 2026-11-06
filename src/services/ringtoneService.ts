/**
 * CareLoop Emergency Audio Synthesizer
 * 
 * Generates synthetic acoustic ringback, incoming call alerts, and busy tones
 * directly using the browser's Web Audio API. No external MP3 downloads required.
 */

class RingtoneService {
  private audioCtx: AudioContext | null = null;
  private ringInterval: any = null;
  private isRinging: boolean = false;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Start Incoming Call Ringtone (Distinctive, calm, medical alert chime)
   */
  startIncomingRingtone(): void {
    if (this.isRinging) return;
    this.isRinging = true;

    const playChime = () => {
      const ctx = this.getAudioContext();
      if (!ctx || !this.isRinging) return;

      const now = ctx.currentTime;
      
      // Dual-tone chime: 587.33Hz (D5) -> 880Hz (A5) -> 1174.66Hz (D6)
      const freqs = [587.33, 880, 1174.66];
      freqs.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + index * 0.15);

        gain.gain.setValueAtTime(0, now + index * 0.15);
        gain.gain.linearRampToValueAtTime(0.18, now + index * 0.15 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.15 + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + index * 0.15);
        osc.stop(now + index * 0.15 + 0.55);
      });
    };

    playChime();
    this.ringInterval = setInterval(playChime, 2400);
  }

  /**
   * Start Outgoing Ringback Tone (Traditional 440Hz + 480Hz PBX ringback tone)
   */
  startOutgoingRingback(): void {
    if (this.isRinging) return;
    this.isRinging = true;

    const playBeep = () => {
      const ctx = this.getAudioContext();
      if (!ctx || !this.isRinging) return;

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(480, now);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.setValueAtTime(0.08, now + 1.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.3);
      osc2.stop(now + 1.3);
    };

    playBeep();
    this.ringInterval = setInterval(playBeep, 4000);
  }

  /**
   * Play Single Call End Tone (Descending chirp)
   */
  playCallEndTone(): void {
    this.stop();
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.25);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.26);
  }

  /**
   * Stop any active ringing
   */
  stop(): void {
    this.isRinging = false;
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }
}

export const ringtoneService = new RingtoneService();

