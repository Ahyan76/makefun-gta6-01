// All sound in Solmar Bay is synthesized with WebAudio — no audio files. Engine hum,
// police sirens, gunshots, punches, pickup blips and a simple bassline loop are built from
// oscillators and filtered noise, and start only after the player's first click (the browser
// needs a user gesture before an AudioContext may run).

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let musicTimer = null;
  let musicStep = 0;
  let started = false;

  /** A minor-key bassline that loops under the game, one note per eighth. */
  const BASSLINE = [55, 0, 55, 65.41, 55, 0, 49, 58.27, 55, 0, 55, 65.41, 82.41, 0, 73.42, 65.41];

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function tone(freq, dur, type, vol, slideTo) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  function noiseBurst(dur, vol, filterFreq) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  /** Start the audio graph. Call once, from the Start button's click handler. */
  function start() {
    if (started) return;
    started = true;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    engineOsc = ctx.createOscillator();
    engineOsc2 = ctx.createOscillator();
    engineGain = ctx.createGain();
    engineOsc.type = 'sawtooth';
    engineOsc2.type = 'square';
    engineOsc.frequency.value = 50;
    engineOsc2.frequency.value = 75;
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 400;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();

    sirenOsc = ctx.createOscillator();
    sirenGain = ctx.createGain();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 700;
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    let high = false;
    sirenTimer = window.setInterval(() => {
      if (!ctx || sirenGain.gain.value === 0) return;
      high = !high;
      sirenOsc.frequency.setValueAtTime(high ? 950 : 700, ctx.currentTime);
    }, 450);

    musicTimer = window.setInterval(() => {
      if (!ctx) return;
      const freq = BASSLINE[musicStep % BASSLINE.length];
      musicStep += 1;
      if (freq > 0) tone(freq, 0.22, 'triangle', 0.12);
      if (musicStep % 2 === 0) noiseBurst(0.03, 0.03, 6000);
    }, 240);
  }

  return {
    start,
    /** Engine pitch and volume follow how fast the player is driving, 0 to 1. */
    setEngine(amount) {
      if (!ctx) return;
      const f = 50 + amount * 130;
      engineOsc.frequency.setValueAtTime(f, ctx.currentTime);
      engineOsc2.frequency.setValueAtTime(f * 1.5, ctx.currentTime);
      engineGain.gain.setTargetAtTime(0.02 + amount * 0.06, ctx.currentTime, 0.1);
    },
    /** The two-tone Bay PD siren, on while police are close. */
    setSiren(on) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.2);
    },
    gunshot() {
      if (!ctx) return;
      noiseBurst(0.14, 0.5, 1800);
      tone(160, 0.1, 'square', 0.25, 60);
    },
    punch() {
      if (!ctx) return;
      noiseBurst(0.08, 0.3, 500);
    },
    blip() {
      if (!ctx) return;
      tone(880, 0.12, 'sine', 0.25, 1320);
    },
    crash() {
      if (!ctx) return;
      noiseBurst(0.3, 0.5, 700);
      tone(90, 0.25, 'sine', 0.3, 40);
    },
    pickup() {
      if (!ctx) return;
      tone(660, 0.1, 'sine', 0.25);
      window.setTimeout(() => tone(990, 0.14, 'sine', 0.25), 90);
    },
  };
}
