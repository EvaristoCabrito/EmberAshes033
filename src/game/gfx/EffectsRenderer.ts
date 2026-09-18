/** The WebGL2 elemental FX pipeline: SceneFBO (the existing Canvas2D battle frame, uploaded as
 * a texture) x LightMapFBO (multiplicative), plus an additive bloom pass, composited on top of
 * whatever BattleCanvas already draws.
 *
 * Per-frame FBO binds are fixed regardless of how many effects are active — light pass, effects
 * pass, bright-pass, two blur passes, composite — because every element after the first ends up
 * batched into one of those same few passes instead of getting its own. LightMapFBO and the
 * bloom chain both render at reduced resolution (see params.ts), which is where most of the
 * fill-rate actually goes on a screen-covering effect like this. */

import { bindAttrib, createFbo, createFullscreenTri, createProgram, createUnitQuad, deleteFbo, resizeFbo, type Fbo } from "./glutil";
import { buildNoiseTexture } from "./noiseTexture";
import { DEFAULT_ASPECT, DEFAULT_ELEMENT_PARAMS, DEFAULT_RADIUS_TILES, DEFAULT_ROTATION, EFFECT_PARAMS, ELEMENT_KINDS, GLOBAL_FX_PARAMS, type ElementKind } from "./params";
import { ParticleEmitter } from "./particles";
import {
  ELEMENT_INDEX,
  FRAG_BLUR,
  FRAG_BRIGHTPASS,
  FRAG_COMPOSITE,
  FRAG_ELEMENTAL,
  FRAG_LIGHT,
  FRAG_PARTICLE,
  VERT_FULLSCREEN,
  VERT_QUAD,
} from "./shaders";

const ADDITIVE_ELEMENTS: ReadonlySet<ElementKind> = new Set(["fire", "lightning", "acid", "holy"]);
// webShot casts light (a travelling glow) without joining the additive group above — its own
// body stays normal alpha-blended (see shaders.ts WEB_SHOT), the same "solid, opaque, glossy"
// treatment that fixed Cleave/Piercing Thrust washing out over bright ground art; only the
// light pass below (a separate glow painted onto the scene, not the shot's own body) is additive.
const LIGHT_ELEMENTS: ReadonlySet<ElementKind> = new Set(["fire", "acid", "holy", "darkness", "webShot"]);
const PARTICLE_ELEMENTS: ReadonlySet<ElementKind> = new Set(["fire", "holy"]);

export interface EffectAnchor {
  x: number;
  y: number;
  tile: number;
  /** Camera-independent counterpart to x/y — see BattleEngine.effectAnchor. Only the
   * elemental visual pass (progElemental) samples its noise field from this. */
  worldX: number;
  worldY: number;
}

export type AnchorProvider = (col: number, row: number) => EffectAnchor;

export interface SpawnOptions {
  /** Effect footprint as a multiple of one hex's tile size. Default 1.4. */
  radiusTiles?: number;
  /** Seconds until auto-removal. Omit for a persistent effect (remove with removeEffect). */
  duration?: number;
  /** Radians; mainly useful for the lightning bolt's orientation. */
  rotation?: number;
  /** Non-uniform aspect (width, height) as a multiple of radiusTiles. Default (1,1). */
  aspect?: [number, number];
}

/** A continuously-repositioned, continuously-resized override for one effect instance — used
 * only by the Dreaming Web shot, which needs sub-hex precision and a length that changes every
 * frame as it travels, neither of which the tile-grid getAnchor(col,row) + radiusTiles/aspect
 * model (built for effects fixed to one hex) can express. Every other effect kind leaves this
 * unset and renders exactly as before. */
export interface EffectOverride {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  tile: number;
  halfLengthPx: number;
  halfWidthPx: number;
  rotation: number;
}

interface EffectInstance {
  id: number;
  kind: ElementKind;
  col: number;
  row: number;
  radiusTiles: number;
  aspect: [number, number];
  rotation: number;
  duration: number | null;
  age: number;
  seed: number;
  override: EffectOverride | null;
}

function uniformLocations<T extends readonly string[]>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: T,
): Record<T[number], WebGLUniformLocation | null> {
  const out = {} as Record<T[number], WebGLUniformLocation | null>;
  for (const n of names) out[n as T[number]] = gl.getUniformLocation(program, n);
  return out;
}

export class EffectsRenderer {
  private gl: WebGL2RenderingContext;
  private quadBuf: WebGLBuffer;
  private triBuf: WebGLBuffer;
  private noiseTex: WebGLTexture;
  private sceneTex: WebGLTexture;

  private progElemental: WebGLProgram;
  private uElemental;
  private progLight: WebGLProgram;
  private uLight;
  private progParticle: WebGLProgram;
  private uParticle;
  private progComposite: WebGLProgram;
  private uComposite;
  private progBrightpass: WebGLProgram;
  private uBrightpass;
  private progBlur: WebGLProgram;
  private uBlur;

  private lightFbo: Fbo;
  private effectsFbo: Fbo;
  private brightFbo: Fbo;
  private blurFboA: Fbo;
  private blurFboB: Fbo;

  private cssW = 1;
  private cssH = 1;
  private dpr = 1;
  private fullW = 1;
  private fullH = 1;

  private effects = new Map<number, EffectInstance>();
  private particleEmitters = new Map<number, ParticleEmitter>();
  private nextId = 1;
  private time = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;

    this.quadBuf = createUnitQuad(gl);
    this.triBuf = createFullscreenTri(gl);
    this.noiseTex = buildNoiseTexture(gl, 256);

    this.sceneTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.progElemental = createProgram(gl, VERT_QUAD, FRAG_ELEMENTAL);
    this.uElemental = uniformLocations(gl, this.progElemental, [
      "u_resolution",
      "u_center",
      "u_radius",
      "u_rotation",
      "u_worldCenter",
      "u_element",
      "u_time",
      "u_frameSeed",
      "u_seed",
      "u_noiseScale",
      "u_scrollSpeed",
      "u_intensity",
      "u_color",
      "u_scene",
      "u_noiseTex",
    ] as const);

    this.progLight = createProgram(gl, VERT_QUAD, FRAG_LIGHT);
    this.uLight = uniformLocations(gl, this.progLight, [
      "u_resolution",
      "u_center",
      "u_radius",
      "u_rotation",
      "u_element",
      "u_time",
      "u_seed",
      "u_intensity",
      "u_color",
    ] as const);

    this.progParticle = createProgram(gl, VERT_QUAD, FRAG_PARTICLE);
    this.uParticle = uniformLocations(gl, this.progParticle, ["u_resolution", "u_center", "u_radius", "u_rotation", "u_color", "u_alpha"] as const);

    this.progComposite = createProgram(gl, VERT_FULLSCREEN, FRAG_COMPOSITE);
    this.uComposite = uniformLocations(gl, this.progComposite, ["u_scene", "u_light", "u_effects", "u_bloom", "u_bloomStrength"] as const);

    this.progBrightpass = createProgram(gl, VERT_FULLSCREEN, FRAG_BRIGHTPASS);
    this.uBrightpass = uniformLocations(gl, this.progBrightpass, ["u_src", "u_threshold"] as const);

    this.progBlur = createProgram(gl, VERT_FULLSCREEN, FRAG_BLUR);
    this.uBlur = uniformLocations(gl, this.progBlur, ["u_src", "u_texel", "u_direction"] as const);

    this.lightFbo = createFbo(gl, 2, 2);
    this.effectsFbo = createFbo(gl, 2, 2);
    this.brightFbo = createFbo(gl, 2, 2);
    this.blurFboA = createFbo(gl, 2, 2);
    this.blurFboB = createFbo(gl, 2, 2);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = dpr;
    const fullW = Math.max(1, Math.floor(this.cssW * dpr));
    const fullH = Math.max(1, Math.floor(this.cssH * dpr));
    if (this.canvas.width !== fullW) this.canvas.width = fullW;
    if (this.canvas.height !== fullH) this.canvas.height = fullH;
    this.fullW = fullW;
    this.fullH = fullH;
    const gl = this.gl;
    const lw = Math.max(1, Math.floor(fullW * GLOBAL_FX_PARAMS.lightMapScale));
    const lh = Math.max(1, Math.floor(fullH * GLOBAL_FX_PARAMS.lightMapScale));
    resizeFbo(gl, this.lightFbo, lw, lh);
    resizeFbo(gl, this.effectsFbo, fullW, fullH);
    const bw = Math.max(1, Math.floor(fullW * GLOBAL_FX_PARAMS.bloomScale));
    const bh = Math.max(1, Math.floor(fullH * GLOBAL_FX_PARAMS.bloomScale));
    resizeFbo(gl, this.brightFbo, bw, bh);
    resizeFbo(gl, this.blurFboA, bw, bh);
    resizeFbo(gl, this.blurFboB, bw, bh);
  }

  spawnEffect(kind: ElementKind, col: number, row: number, opts: SpawnOptions = {}): number {
    const id = this.nextId++;
    this.effects.set(id, {
      id,
      kind,
      col,
      row,
      radiusTiles: opts.radiusTiles ?? DEFAULT_RADIUS_TILES[kind] ?? 1.4,
      aspect: opts.aspect ?? DEFAULT_ASPECT[kind] ?? [1, 1],
      rotation: opts.rotation ?? DEFAULT_ROTATION[kind] ?? 0,
      duration: opts.duration ?? null,
      age: 0,
      seed: Math.random() * 1000,
      override: null,
    });
    if (PARTICLE_ELEMENTS.has(kind)) this.particleEmitters.set(id, new ParticleEmitter(kind as "fire" | "holy"));
    return id;
  }

  removeEffect(id: number): void {
    this.effects.delete(id);
    this.particleEmitters.delete(id);
  }

  /** Repositions/resizes a live effect for this frame — see EffectOverride. The caller
   * (BattleCanvas, driven by BattleEngine.webShotBeam) calls this every frame while the
   * Dreaming Web shot is in flight; every other effect kind never calls this and is unaffected. */
  updateOverride(id: number, override: EffectOverride | null): void {
    const fx = this.effects.get(id);
    if (fx) fx.override = override;
  }

  clearAll(): void {
    this.effects.clear();
    this.particleEmitters.clear();
  }

  hasEffects(): boolean {
    return this.effects.size > 0;
  }

  private hasLightElements(): boolean {
    for (const fx of this.effects.values()) if (LIGHT_ELEMENTS.has(fx.kind)) return true;
    return false;
  }

  private drawQuad(
    program: WebGLProgram,
    uniforms: {
      u_resolution: WebGLUniformLocation | null;
      u_center: WebGLUniformLocation | null;
      u_radius: WebGLUniformLocation | null;
      u_rotation: WebGLUniformLocation | null;
      u_worldCenter?: WebGLUniformLocation | null;
    },
    resW: number,
    resH: number,
    centerXCss: number,
    centerYCss: number,
    radiusXCss: number,
    radiusYCss: number,
    rotation: number,
    worldXCss?: number,
    worldYCss?: number,
  ): void {
    const gl = this.gl;
    gl.useProgram(program);
    bindAttrib(gl, this.quadBuf, 0, 2);
    gl.uniform2f(uniforms.u_resolution, resW, resH);
    gl.uniform2f(uniforms.u_center, centerXCss * this.dpr * (resW / this.fullW), centerYCss * this.dpr * (resH / this.fullH));
    gl.uniform2f(uniforms.u_radius, radiusXCss * this.dpr * (resW / this.fullW), radiusYCss * this.dpr * (resH / this.fullH));
    gl.uniform1f(uniforms.u_rotation, rotation);
    // Only the elemental visual pass declares/uses this — see waterSurface()/riverSurface()
    // in shaders.ts. Kept in the same dpr/resolution-scaled unit system as u_center so a
    // hex's world position and its screen position agree on scale, just not on origin.
    if (uniforms.u_worldCenter && worldXCss !== undefined && worldYCss !== undefined) {
      gl.uniform2f(uniforms.u_worldCenter, worldXCss * this.dpr * (resW / this.fullW), worldYCss * this.dpr * (resH / this.fullH));
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  render(sceneCanvas: HTMLCanvasElement, dt: number, getAnchor: AnchorProvider): void {
    const gl = this.gl;
    this.time += dt;

    // Expire and advance effects.
    for (const fx of this.effects.values()) {
      fx.age += dt;
      if (fx.duration != null && fx.age >= fx.duration) this.effects.delete(fx.id);
    }
    for (const [id, emitter] of this.particleEmitters) {
      if (!this.effects.has(id)) {
        if (emitter.particles.length === 0) this.particleEmitters.delete(id);
      }
    }

    // 1. Upload the existing Canvas2D battle frame as the "scene" texture.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);

    // 2. Light pass — batched into a single FBO bind regardless of instance count.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightFbo.fbo);
    gl.viewport(0, 0, this.lightFbo.w, this.lightFbo.h);
    // Only darken the ambient when something is actually casting light (fire/acid/holy/
    // darkness) — a map with just water/ice/shore placed has nothing to brighten the
    // lightmap back up afterward, so the darker default would just dim the whole screen
    // uniformly for no visible reason.
    const hasLight = this.hasLightElements();
    const amb = hasLight ? GLOBAL_FX_PARAMS.ambientLevel : 1.0;
    gl.clearColor(amb, amb, amb, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.progLight);
    gl.uniform1f(this.uLight.u_time, this.time);
    for (const fx of this.effects.values()) {
      if (!LIGHT_ELEMENTS.has(fx.kind)) continue;
      const ov = fx.override;
      const anchor = ov ?? getAnchor(fx.col, fx.row);
      // Darkness's "light removal" radius stays matched to its visual shape; an actual light
      // source (fire/acid/holy/webShot) throws its glow noticeably further than its own
      // flame/shape. webShot has no radiusTiles (it's sized in pixels via override), so its
      // glow radius is keyed off its own half-width instead.
      const radius = ov
        ? ov.halfWidthPx * GLOBAL_FX_PARAMS.lightRadiusMul * 1.8
        : anchor.tile * fx.radiusTiles * (fx.kind === "darkness" ? 1 : GLOBAL_FX_PARAMS.lightRadiusMul);
      const params = EFFECT_PARAMS[fx.kind];
      gl.uniform1i(this.uLight.u_element, ELEMENT_INDEX[fx.kind]);
      gl.uniform1f(this.uLight.u_seed, fx.seed);
      gl.uniform1f(this.uLight.u_intensity, params.intensity);
      gl.uniform3f(this.uLight.u_color, params.color[0], params.color[1], params.color[2]);
      if (fx.kind === "darkness") {
        gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      } else {
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE);
      }
      this.drawQuad(this.progLight, this.uLight, this.lightFbo.w, this.lightFbo.h, anchor.x, anchor.y, radius, radius, 0);
    }
    gl.blendEquation(gl.FUNC_ADD);

    // 3. Effects visual pass — one FBO bind, two blend groups (alpha ground effects, then
    //    additive spell glow), no per-instance program swap.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.effectsFbo.fbo);
    gl.viewport(0, 0, this.effectsFbo.w, this.effectsFbo.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.progElemental);
    gl.uniform1f(this.uElemental.u_time, this.time);
    gl.uniform1f(this.uElemental.u_frameSeed, Math.random());
    gl.uniform1i(this.uElemental.u_scene, 0);
    gl.uniform1i(this.uElemental.u_noiseTex, 1);

    const drawElemental = (fx: EffectInstance) => {
      const ov = fx.override;
      const anchor = ov ?? getAnchor(fx.col, fx.row);
      const rx = ov ? ov.halfLengthPx : anchor.tile * fx.radiusTiles * fx.aspect[0];
      const ry = ov ? ov.halfWidthPx : anchor.tile * fx.radiusTiles * fx.aspect[1];
      const rot = ov ? ov.rotation : fx.rotation;
      const anchorX = anchor.x;
      const anchorY = anchor.y;
      const anchorWorldX = anchor.worldX;
      const anchorWorldY = anchor.worldY;
      const params = EFFECT_PARAMS[fx.kind];
      gl.uniform1i(this.uElemental.u_element, ELEMENT_INDEX[fx.kind]);
      gl.uniform1f(this.uElemental.u_seed, fx.seed);
      gl.uniform1f(this.uElemental.u_noiseScale, params.noiseScale);
      gl.uniform1f(this.uElemental.u_scrollSpeed, params.scrollSpeed);
      gl.uniform1f(this.uElemental.u_intensity, params.intensity);
      gl.uniform3f(this.uElemental.u_color, params.color[0], params.color[1], params.color[2]);
      this.drawQuad(
        this.progElemental,
        this.uElemental,
        this.effectsFbo.w,
        this.effectsFbo.h,
        anchorX,
        anchorY,
        rx,
        ry,
        rot,
        anchorWorldX,
        anchorWorldY,
      );
    };

    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const fx of this.effects.values()) if (!ADDITIVE_ELEMENTS.has(fx.kind)) drawElemental(fx);

    gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
    for (const fx of this.effects.values()) if (ADDITIVE_ELEMENTS.has(fx.kind)) drawElemental(fx);

    // Particles (fire embers / holy motes) ride on top, same alpha-safe additive blend.
    gl.useProgram(this.progParticle);
    for (const [id, fx] of this.effects) {
      if (!PARTICLE_ELEMENTS.has(fx.kind)) continue;
      const emitter = this.particleEmitters.get(id);
      if (!emitter) continue;
      const anchor = getAnchor(fx.col, fx.row);
      const radius = anchor.tile * fx.radiusTiles;
      const params = EFFECT_PARAMS[fx.kind];
      emitter.update(dt, anchor.x, anchor.y, radius, params.color, fx.kind === "fire" ? 14 : 6);
      for (const p of emitter.particles) {
        const life = p.age / p.life;
        const speed = Math.hypot(p.vx, p.vy) || 1;
        const rot = Math.atan2(-p.vy, p.vx);
        gl.uniform3f(this.uParticle.u_color, p.color[0], p.color[1], p.color[2]);
        gl.uniform1f(this.uParticle.u_alpha, (1 - life) * params.intensity);
        const stretch = 1 + Math.min(2, speed / 40);
        this.drawQuad(this.progParticle, this.uParticle, this.effectsFbo.w, this.effectsFbo.h, p.x, p.y, p.size * stretch, p.size, rot);
      }
    }

    // 4. Bright-pass + separable blur, all at reduced resolution.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.brightFbo.fbo);
    gl.viewport(0, 0, this.brightFbo.w, this.brightFbo.h);
    gl.disable(gl.BLEND);
    gl.useProgram(this.progBrightpass);
    bindAttrib(gl, this.triBuf, 0, 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.effectsFbo.tex);
    gl.uniform1i(this.uBrightpass.u_src, 0);
    gl.uniform1f(this.uBrightpass.u_threshold, GLOBAL_FX_PARAMS.bloomThreshold);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(this.progBlur);
    bindAttrib(gl, this.triBuf, 0, 2);
    gl.uniform1i(this.uBlur.u_src, 0);
    const passes: [Fbo, Fbo][] = [
      [this.brightFbo, this.blurFboA],
      [this.blurFboA, this.blurFboB],
      [this.blurFboB, this.blurFboA],
    ];
    const dirs: [number, number][] = [
      [1, 0],
      [0, 1],
      [1, 0],
    ];
    for (let i = 0; i < passes.length; i++) {
      const [src, dst] = passes[i]!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(this.uBlur.u_texel, 1 / src.w, 1 / src.h);
      gl.uniform2f(this.uBlur.u_direction, dirs[i]![0], dirs[i]![1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    const bloomResult = this.blurFboA;

    // 5. Composite: scene x lightmap, alpha-mix the ground-effect layer, additive bloom on top.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.fullW, this.fullH);
    gl.disable(gl.BLEND);
    gl.useProgram(this.progComposite);
    bindAttrib(gl, this.triBuf, 0, 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lightFbo.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.effectsFbo.tex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, bloomResult.tex);
    gl.uniform1i(this.uComposite.u_scene, 0);
    gl.uniform1i(this.uComposite.u_light, 1);
    gl.uniform1i(this.uComposite.u_effects, 2);
    gl.uniform1i(this.uComposite.u_bloom, 3);
    gl.uniform1f(this.uComposite.u_bloomStrength, GLOBAL_FX_PARAMS.bloomStrength);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    deleteFbo(gl, this.lightFbo);
    deleteFbo(gl, this.effectsFbo);
    deleteFbo(gl, this.brightFbo);
    deleteFbo(gl, this.blurFboA);
    deleteFbo(gl, this.blurFboB);
    gl.deleteTexture(this.sceneTex);
    gl.deleteTexture(this.noiseTex);
    gl.deleteBuffer(this.quadBuf);
    gl.deleteBuffer(this.triBuf);
    gl.deleteProgram(this.progElemental);
    gl.deleteProgram(this.progLight);
    gl.deleteProgram(this.progParticle);
    gl.deleteProgram(this.progComposite);
    gl.deleteProgram(this.progBrightpass);
    gl.deleteProgram(this.progBlur);
  }
}

export { ELEMENT_KINDS, DEFAULT_ELEMENT_PARAMS, EFFECT_PARAMS, GLOBAL_FX_PARAMS };
export type { ElementKind };
