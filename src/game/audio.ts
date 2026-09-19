import type { SpriteId } from "./types";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let music: GainNode | null = null;
let muted = false;
const AUDIO_SETTINGS_KEY = "ember-ashes-audio-v1";
const clampVolume = (value: number) => Math.max(0, Math.min(1, value));
let musicVolume = 0.65;
let sfxVolume = 1;
// Cutscenes carry their own dialogue/sfx track, not just background music — on by default
// and independent of the master mute toggle (see CutsceneScreen), same as music/sfx are
// independent of each other. Its own slider in the audio settings panel, defaulting to full.
let cutsceneVolume = 1;
let musicTimer = 0;
let htmlPrime: HTMLAudioElement | null = null;
let retryTimer = 0;
const htmlUrls: Record<string, string> = {};

if (typeof window !== "undefined") {
  try {
    const saved = JSON.parse(window.localStorage.getItem(AUDIO_SETTINGS_KEY) ?? "{}") as { music?: unknown; sfx?: unknown; cutscene?: unknown };
    if (typeof saved.music === "number") musicVolume = clampVolume(saved.music);
    if (typeof saved.sfx === "number") sfxVolume = clampVolume(saved.sfx);
    if (typeof saved.cutscene === "number") cutsceneVolume = clampVolume(saved.cutscene);
  } catch {
    // Audio preferences are optional; defaults keep the game playable when storage is blocked.
  }
}

function persistAudioSettings(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({ music: musicVolume, sfx: sfxVolume, cutscene: cutsceneVolume }));
  } catch {
    // A private-storage browser can still use the current session's settings.
  }
}

function applyMusicVolume(): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll<HTMLAudioElement>("audio[data-ember-music-base]").forEach((el) => {
    const base = Number(el.dataset.emberMusicBase ?? "0.4");
    el.volume = clampVolume(base * musicVolume);
  });
}

export function getAudioVolumes(): { music: number; sfx: number; cutscene: number } {
  return { music: musicVolume, sfx: sfxVolume, cutscene: cutsceneVolume };
}

export function setMusicVolume(value: number): void {
  musicVolume = clampVolume(value);
  applyMusicVolume();
  persistAudioSettings();
}

export function setCutsceneVolume(value: number): void {
  cutsceneVolume = clampVolume(value);
  persistAudioSettings();
}

export function setSfxVolume(value: number): void {
  sfxVolume = clampVolume(value);
  if (sfx && ctx) sfx.gain.setTargetAtTime(sfxVolume, ctx.currentTime, 0.02);
  persistAudioSettings();
}

if (typeof window !== "undefined") {
  const g = window as Window & { __brasaMusic?: number };
  if (g.__brasaMusic) {
    clearInterval(g.__brasaMusic);
    g.__brasaMusic = 0;
  }
}

function wavTone(freq: number, dur: number, volume: number, kind: "sine" | "square" | "noise" = "sine"): string {
  const key = `${kind}:${freq}:${dur}:${volume}`;
  if (htmlUrls[key]) return htmlUrls[key];
  const sr = 22050;
  const n = Math.max(2, Math.floor(sr * dur));
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / (sr * 0.012)) * Math.min(1, (n - i) / (sr * 0.05));
    let s: number;
    if (kind === "noise") s = Math.random() * 2 - 1;
    else if (kind === "square") s = Math.sin((2 * Math.PI * freq * i) / sr) > 0 ? 1 : -1;
    else s = Math.sin((2 * Math.PI * freq * i) / sr);
    pcm[i] = (s * env * volume * 32767) | 0;
  }
  const bytes = new ArrayBuffer(44 + n * 2);
  const v = new DataView(bytes);
  const ascii = (o: number, t: string) => {
    for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i));
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, n * 2, true);
  new Uint8Array(bytes, 44).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  htmlUrls[key] = url;
  return url;
}

function playHtml(url: string, volume = 0.7): void {
  if (muted || typeof Audio === "undefined") return;
  const a = new Audio(url);
  a.volume = Math.min(1, volume * sfxVolume);
  void a.play().catch(() => {});
}

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C({ latencyHint: "interactive" });
    master = ctx.createGain();
    sfx = ctx.createGain();
    music = ctx.createGain();
    sfx.gain.value = sfxVolume;
    music.gain.value = 0.35;
    sfx.connect(master);
    music.connect(master);
    master.connect(ctx.destination);
    master.gain.value = muted ? 0 : 1;
  }
  return ctx;
}

function silentTick(c: AudioContext): void {
  const buf = c.createBuffer(1, 1, c.sampleRate);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  try {
    src.start(0);
  } catch {
    // ignore
  }
}

function htmlUnlock(): void {
  if (typeof Audio === "undefined") return;
  if (!htmlPrime) {
    htmlPrime = new Audio(wavTone(440, 0.04, 0.0008));
    htmlPrime.volume = 0.01;
  }
  htmlPrime.currentTime = 0;
  void htmlPrime.play().catch(() => {});
}

export function unlockAudio(): void {
  htmlUnlock();
  const c = ac();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume().then(() => {
      if (ctx && ctx.state === "running") silentTick(ctx);
    });
  }
  silentTick(c);
}

export function setMuted(next: boolean): void {
  muted = next;
  if (master && ctx) {
    master.gain.setTargetAtTime(next ? 0 : 1, ctx.currentTime, 0.02);
  }
  if (!next) {
    unlockAudio();
  } else {
    stopMusic();
  }
}

export function isMuted(): boolean {
  return muted;
}

function beep(freq: number, dur: number, type: OscillatorType, gain = 0.22, slide = 0): void {
  if (muted) return;
  const c = ac();
  if (!c || c.state !== "running") {
    playHtml(wavTone(freq, dur, Math.min(0.9, gain * 2.4), type === "square" ? "square" : "sine"), Math.min(1, gain * 3));
    if (c && c.state === "suspended") void c.resume();
    return;
  }
  if (!sfx) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(sfx);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.22): void {
  if (muted) return;
  const c = ac();
  if (!c || c.state !== "running") {
    playHtml(wavTone(180, dur, Math.min(0.8, gain * 2), "noise"), Math.min(1, gain * 2.5));
    if (c && c.state === "suspended") void c.resume();
    return;
  }
  if (!sfx) return;
  const n = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = n.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = n;
  const g = c.createGain();
  const t0 = c.currentTime;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1800;
  src.connect(f);
  f.connect(g);
  g.connect(sfx);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/** One-shot effect from a file in public/game/MUSIC/SoundFX, layered over whatever music or
 * synthesised beep is already playing rather than replacing it — unlike playFile, this never
 * touches the theme/track elements, so it can't interrupt them. A fresh Audio() per call: the
 * previous play is left to finish on its own instead of being cut short by the next one. */
function playSfxFile(file: string, volume = 0.55): void {
  if (muted || typeof Audio === "undefined") return;
  const el = new Audio(`/game/MUSIC/SoundFX/${file}`);
  el.volume = volume * sfxVolume;
  el.play().catch(() => {});
}

/** Per-sprite dedicated sound files — one file stands in for every attack, and one for every
 * tiered spell, that sprite has, until it gets more than one file to work with. A sprite
 * absent here has no audio of its own yet and falls back to the (silent) generic sfxPlay cue
 * below, same as before any per-unit audio existed — adding a new unit's sound later is just
 * a new entry here, no call-site changes needed anywhere else. Movement is not part of this:
 * Cultist V2's walk cues stay their own dedicated hook in startSeq. */
const UNIT_SFX: Partial<Record<SpriteId, { attack?: string; spellcast?: string }>> = {
  "cultist-v2": {
    attack: "CultistV2Attack.mp3",
    spellcast: "CultistV2Spellcast.mp3",
  },
};

/** Plays `sprite`'s own attack cue and returns true, or does nothing and returns false if it
 * has none — the caller falls back to the generic cue on false (see stepCombat). */
export function playUnitAttack(sprite: SpriteId): boolean {
  const file = UNIT_SFX[sprite]?.attack;
  if (!file) return false;
  playSfxFile(file, 0.55);
  return true;
}

/** Same as playUnitAttack, for a tiered spell's cast cue (see stepSpell). */
export function playUnitSpellcast(sprite: SpriteId): boolean {
  const file = UNIT_SFX[sprite]?.spellcast;
  if (!file) return false;
  playSfxFile(file, 0.55);
  return true;
}

// Every synthesized "bleep" cue has been removed by request — most entries below are kept as
// no-ops (rather than deleted) so every existing sfxPlay.xxx() call site throughout the game
// stays valid. meleeAttack/arrowAttack/magicAttack and spell are the exception: until every
// unit has its own dedicated attack/cast file in UNIT_SFX, they all share one generic
// attack cue and one generic cast cue (GenericAttack.mp3 / GenericCast.mp3) — these are what
// actually play whenever playUnitAttack/playUnitSpellcast above returns false for a sprite
// with no override yet. beep()/noise() above are now unused by this object but left defined
// in case real audio files replace any of the remaining no-ops later.
export const sfxPlay = {
  select: () => {},
  move: () => {},
  ui: () => {},
  purchase: () => {},
  hit: () => {},
  crit: () => {},
  death: () => {},
  turn: () => {},
  win: () => {},
  lose: () => {},
  spell: () => playSfxFile("GenericCast.mp3", 0.55),
  // Dreaming Web has no dedicated cast sound of its own yet either — same generic cue as
  // every other spell until one is added.
  dreamingWeb: () => playSfxFile("GenericCast.mp3", 0.55),
  summonFamiliar: () => {},
  meleeAttack: () => playSfxFile("GenericAttack.mp3", 0.55),
  arrowAttack: () => playSfxFile("GenericAttack.mp3", 0.55),
  magicAttack: () => playSfxFile("GenericAttack.mp3", 0.55),
  heal: () => {},
  stun: () => {},
  miss: () => {},
  chest: () => {},
  loot: () => {},
  thrust: () => {},
  sweep: () => {},
  trip: () => {},
  levelUp: () => playSfxFile("LevelUp.mp3", 0.6),
  // Cultist V2's own walk cues — kept as their own dedicated hook (not part of the
  // attack/spellcast UNIT_SFX generalization above, which movement was explicitly left out
  // of; see startSeq).
  cultistV2WalkLeft: () => playSfxFile("CultistV2WalkLeft.mp3", 0.45),
  cultistV2WalkRight: () => playSfxFile("CultistV2WalkRight.mp3", 0.45),
};

let introEl: HTMLAudioElement | null = null;
let battleEl: HTMLAudioElement | null = null;
let earlyEl: HTMLAudioElement | null = null;
let templeEl: HTMLAudioElement | null = null;
let aldeiaEl: HTMLAudioElement | null = null;
let siegeEl: HTMLAudioElement | null = null;
let innEl: HTMLAudioElement | null = null;
let hillEl: HTMLAudioElement | null = null;
let portaoEl: HTMLAudioElement | null = null;
let worldMapEl: HTMLAudioElement | null = null;
type Theme = "intro" | "battle" | "early" | "temple" | "aldeia" | "siege" | "inn" | "hill" | "portao" | "worldMap";
let currentTheme: Theme = "intro";
let currentFile: string | null = null;

if (typeof window !== "undefined") {
  const g = window as Window & { __emberIntro?: HTMLAudioElement };
  if (g.__emberIntro) introEl = g.__emberIntro;
}

function attachTrack(el: HTMLAudioElement, volume: number): HTMLAudioElement {
  el.loop = true;
  el.preload = "auto";
  el.dataset.emberMusicBase = String(volume);
  el.volume = volume * musicVolume;
  if (typeof document !== "undefined" && document.body && !el.isConnected) {
    el.setAttribute("playsinline", "");
    document.body.appendChild(el);
  }
  return el;
}

function getTrack(theme: Theme): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (theme === "intro") return menuElement();
  if (theme === "temple") {
    if (!templeEl) templeEl = attachTrack(new Audio("/game/MUSIC/temple.mp3"), 0.42);
    return templeEl;
  }
  if (theme === "aldeia") {
    if (!aldeiaEl) aldeiaEl = attachTrack(new Audio("/game/MUSIC/aldeia.mp3?v=2"), 0.4);
    return aldeiaEl;
  }
  if (theme === "siege") {
    if (!siegeEl) siegeEl = attachTrack(new Audio("/game/MUSIC/siege.mp3"), 0.4);
    return siegeEl;
  }
  if (theme === "inn") {
    if (!innEl) innEl = attachTrack(new Audio("/game/MUSIC/inn.mp3"), 0.4);
    return innEl;
  }
  if (theme === "hill") {
    if (!hillEl) hillEl = attachTrack(new Audio("/game/MUSIC/hill.mp3"), 0.4);
    return hillEl;
  }
  if (theme === "portao") {
    if (!portaoEl) portaoEl = attachTrack(new Audio("/game/MUSIC/portao.mp3"), 0.4);
    return portaoEl;
  }
  if (theme === "early") {
    if (!earlyEl) earlyEl = attachTrack(new Audio("/game/MUSIC/early.mp3"), 0.4);
    return earlyEl;
  }
  if (theme === "worldMap") {
    // The world map's own piece, under the name it was delivered as. Encoded because that
    // name carries spaces.
    if (!worldMapEl)
      worldMapEl = attachTrack(new Audio(`/game/MUSIC/${encodeURIComponent("Tragic Architecture True Persona-WorldMap-Balanced-High.mp3")}`), 0.4);
    return worldMapEl;
  }
  // The battle theme's own track, recovered from an earlier build's output where it was the
  // only copy left — it had gone missing from public/game/MUSIC while the code still asked
  // for it, which is why nothing played here.
  if (!battleEl) battleEl = attachTrack(new Audio("/game/MUSIC/music.mp3"), 0.4);
  return battleEl;
}

function menuElement(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (typeof document !== "undefined") {
    document.querySelectorAll("audio").forEach((node) => {
      if (node === introEl) return;
      if (node.id === "ember-intro" || /\/game\/music\/intro\.(wav|mp3)/.test(node.src)) {
        node.pause();
        node.remove();
      }
    });
  }
  if (introEl) return introEl;
  const node = new Audio("/game/MUSIC/intro.mp3");
  node.id = "ember-intro";
  node.loop = true;
  node.preload = "auto";
  node.dataset.emberMusicBase = "0.7";
  node.volume = 0.7 * musicVolume;
  if (typeof document !== "undefined" && document.body) {
    node.setAttribute("playsinline", "");
    document.body.appendChild(node);
  }
  introEl = node;
  if (typeof window !== "undefined") {
    (window as Window & { __emberIntro?: HTMLAudioElement }).__emberIntro = node;
  }
  return node;
}

/** HMR and older builds may leave a detached intro element behind. Keep the title track
 * exclusive even when it is no longer the module's current introEl reference. */
function pauseIntroTracks(except: HTMLAudioElement | null = null): void {
  if (typeof document !== "undefined") {
    document.querySelectorAll("audio").forEach((node) => {
      if (node === except) return;
      if (/\/game\/music\/intro\.mp3(?:[?#]|$)/i.test(node.src)) node.pause();
    });
  }
  if (introEl && introEl !== except) introEl.pause();
}

function kickPlay(el: HTMLAudioElement): void {
  if (muted) return;
  if (!el.paused && !el.ended) return;
  el.muted = false;
  el.defaultMuted = false;
  const baseVolume = Number(el.dataset.emberMusicBase ?? (el === introEl ? "0.7" : el === templeEl ? "0.42" : "0.4"));
  el.volume = clampVolume(baseVolume * musicVolume);
  const tryOnce = () => {
    if (muted) return;
    if (!el.paused && !el.ended) {
      if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = 0;
      }
      return;
    }
    void el.play().then(() => {
      if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = 0;
      }
    }).catch(() => {
      if (muted || retryTimer) return;
      retryTimer = window.setInterval(() => {
        if (muted) return;
        const want = currentTheme === "intro" ? menuElement() : getTrack(currentTheme);
        if (!want || (!want.paused && !want.ended)) {
          if (retryTimer) {
            clearInterval(retryTimer);
            retryTimer = 0;
          }
          return;
        }
        void want.play().then(() => {
          if (retryTimer) {
            clearInterval(retryTimer);
            retryTimer = 0;
          }
        }).catch(() => {});
      }, 400);
    });
  };
  tryOnce();
}

/** Tracks played by file name rather than by theme — what a mission's own music setting
 * asks for. One element per file, made once and kept, same as the fixed themes. */
const fileEls = new Map<string, HTMLAudioElement>();

function getFileTrack(file: string): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  const have = fileEls.get(file);
  if (have) return have;
  const el = attachTrack(new Audio(`/game/MUSIC/${encodeURIComponent(file)}`), 0.4);
  fileEls.set(file, el);
  return el;
}

/** Plays one specific file from public/game/MUSIC, silencing everything else — the escape
 * hatch from the fixed Theme list, so a mission can name its own track. */
export function playFile(file: string): void {
  currentFile = file;
  if (muted) return;
  const want = getFileTrack(file);
  pauseIntroTracks(want === introEl ? introEl : null);
  silenceAllBut(want);
  if (!want) return;
  kickPlay(want);
}
/** Stops every track except the one asked for, themes and per-file alike. */
function silenceAllBut(want: HTMLAudioElement | null): void {
  const others = [introEl, battleEl, earlyEl, templeEl, aldeiaEl, siegeEl, innEl, hillEl, portaoEl, worldMapEl, ...fileEls.values()];
  for (const el of others) {
    if (!el || el === want) continue;
    el.pause();
  }
}

export function playTheme(theme: Theme): void {
  currentTheme = theme;
  currentFile = null;
  if (muted) return;
  const want = getTrack(theme);
  pauseIntroTracks(want === introEl ? introEl : null);
  if (battleEl && battleEl !== want) {
    battleEl.pause();
  }
  if (earlyEl && earlyEl !== want) {
    earlyEl.pause();
  }
  if (templeEl && templeEl !== want) {
    templeEl.pause();
  }
  if (aldeiaEl && aldeiaEl !== want) {
    aldeiaEl.pause();
  }
  if (siegeEl && siegeEl !== want) {
    siegeEl.pause();
  }
  if (innEl && innEl !== want) {
    innEl.pause();
  }
  if (hillEl && hillEl !== want) {
    hillEl.pause();
  }
  if (portaoEl && portaoEl !== want) {
    portaoEl.pause();
  }
  if (worldMapEl && worldMapEl !== want) {
    worldMapEl.pause();
  }
  // A mission that named its own track may be playing; a fixed theme has to silence it too.
  for (const el of fileEls.values()) {
    if (el === want) continue;
    el.pause();
  }
  if (!want) return;
  kickPlay(want);
}

export function preloadMenuMusic(): void {
  playMenuMusic();
}

export function playMenuMusic(): void {
  currentTheme = "intro";
  currentFile = null;
  if (muted) return;
  battleEl?.pause();
  earlyEl?.pause();
  templeEl?.pause();
  aldeiaEl?.pause();
  siegeEl?.pause();
  innEl?.pause();
  hillEl?.pause();
  portaoEl?.pause();
  worldMapEl?.pause();
  const el = menuElement();
  if (!el) return;
  // Returning to the title is another hard boundary: custom mission tracks must not linger.
  pauseIntroTracks(el);
  silenceAllBut(el);
  kickPlay(el);
}

export function startMusic(): void {
  if (currentFile) playFile(currentFile);
  else playTheme(currentTheme);
}

export function stopMusic(): void {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = 0;
  }
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = 0;
  }
  if (typeof window !== "undefined") {
    const g = window as Window & { __brasaMusic?: number };
    if (g.__brasaMusic) {
      clearInterval(g.__brasaMusic);
      g.__brasaMusic = 0;
    }
  }
  introEl?.pause();
  battleEl?.pause();
  earlyEl?.pause();
  templeEl?.pause();
  aldeiaEl?.pause();
  siegeEl?.pause();
  innEl?.pause();
  hillEl?.pause();
  portaoEl?.pause();
  worldMapEl?.pause();
  for (const el of fileEls.values()) el.pause();
}

export function resumeAudio(): void {
  unlockAudio();
}

export function installAudioUnlock(): () => void {
  if (typeof window === "undefined") return () => {};
  const arm = () => {
    unlockAudio();
    startMusic();
  };
  const opts: AddEventListenerOptions = { capture: true };
  window.addEventListener("pointerdown", arm, opts);
  window.addEventListener("keydown", arm, opts);
  return () => {
    window.removeEventListener("pointerdown", arm, opts);
    window.removeEventListener("keydown", arm, opts);
  };
}



