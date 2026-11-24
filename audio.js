// Motor de sonido sin dependencias externas (Web Audio API + síntesis de voz opcional en español)

class TournamentAudio {
  constructor() {
    this.ctx = null;
    this.soundEnabled = true;
    this.voiceEnabled = false;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Desbloqueo de audio para Safari en iOS/iPhone en el primer toque del usuario
  unlock() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // Ignorar si ya está desbloqueado
    }
  }

  playTone(freq, startOffset, duration, type = 'sine', peakGain = 0.22) {
    if (!this.soundEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  // Tic suave en los últimos 5 segundos
  playCountdownTick(isFinal = false) {
    if (!this.soundEnabled) return;
    this.playTone(isFinal ? 1174.66 : 880, 0, isFinal ? 0.16 : 0.09, 'triangle', isFinal ? 0.22 : 0.14);
  }

  // Aviso de 1 minuto restante
  playOneMinuteWarning() {
    if (!this.soundEnabled) return;
    this.playTone(659.25, 0, 0.22, 'sine', 0.18);
    this.playTone(880, 0.18, 0.35, 'sine', 0.2);
  }

  // Campana de cambio de nivel (acorde claro y elegante de torneo)
  playLevelUp() {
    if (!this.soundEnabled) return;
    this.playTone(523.25, 0.0, 0.55, 'triangle', 0.24); // C5
    this.playTone(659.25, 0.14, 0.55, 'triangle', 0.24); // E5
    this.playTone(783.99, 0.28, 0.7, 'triangle', 0.26); // G5
    this.playTone(1046.5, 0.44, 0.95, 'sine', 0.28); // C6
  }

  // Fanfarria cálida para inicio de descanso (COMIDA / FIN DE RECOMPRAS)
  playBreakStart() {
    if (!this.soundEnabled) return;
    this.playTone(587.33, 0.0, 0.45, 'sine', 0.24); // D5
    this.playTone(739.99, 0.16, 0.45, 'sine', 0.24); // F#5
    this.playTone(880.0, 0.32, 0.85, 'triangle', 0.28); // A5
    this.playTone(1174.66, 0.5, 1.0, 'sine', 0.24); // D6
  }

  // Anuncio hablado opcional en español
  speak(text) {
    if (!this.voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'es-MX';
      utter.rate = 0.96;
      utter.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const esVoice =
        voices.find((v) => v.lang.toLowerCase().startsWith('es-mx')) ||
        voices.find((v) => v.lang.toLowerCase().startsWith('es-es')) ||
        voices.find((v) => v.lang.toLowerCase().startsWith('es'));
      if (esVoice) utter.voice = esVoice;

      window.speechSynthesis.speak(utter);
    } catch {
      // Ignorar si speechSynthesis no está disponible
    }
  }

  announceItem(item) {
    if (!item) return;
    if (item.type === 'break') {
      this.playBreakStart();
      if (item.closesRebuys) {
        this.speak(`${item.label}. ${item.durationMin} minutos de descanso. Último momento para recompras y add on.`);
      } else {
        this.speak(`Descanso de ${item.label}. ${item.durationMin} minutos.`);
      }
    } else {
      this.playLevelUp();
      const anteText = item.ante > 0 ? `. Big Blind Ante ${item.ante}` : '';
      const endText = item.note ? `. Atención: ${item.note}` : '';
      this.speak(`Nivel ${item.round}. Ciegas ${item.sb} y ${item.bb}${anteText}${endText}.`);
    }
  }
}

export const audio = new TournamentAudio();
