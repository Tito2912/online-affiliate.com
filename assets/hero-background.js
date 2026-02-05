const DEFAULT_HOST_ID = "particles-js";

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function parseHexColor(input, fallback) {
  const raw = String(input ?? "").trim();
  const match = raw.match(/^#([0-9a-f]{3,8})$/i);
  if (!match) return fallback;

  let hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split("")
      .map((c) => `${c}${c}`)
      .join("");
  }

  if (hex.length === 8) hex = hex.slice(0, 6);
  if (hex.length !== 6) return fallback;

  const num = Number.parseInt(hex, 16);
  if (!Number.isFinite(num)) return fallback;

  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

function getCssVarColor(varName, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName);
  return parseHexColor(value, fallback);
}

function getCssVarNumber(varName, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName);
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(shader) || "Shader compile failed";
    gl.deleteShader(shader);
    throw new Error(err);
  }

  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const err = gl.getProgramInfoLog(program) || "Program link failed";
    gl.deleteProgram(program);
    throw new Error(err);
  }

  return program;
}

function getBgMode(input) {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return "topo";

  const normalized = raw.replace(/[^a-z0-9_-]/g, "");
  const map = new Map([
    ["a", "aurora"],
    ["aurora", "aurora"],
    ["nebula", "aurora"],
    ["tunnel", "tunnel"],
    ["warp", "tunnel"],
    ["hyperspace", "tunnel"],
    ["topo", "topo"],
    ["topographic", "topo"],
    ["contours", "topo"],
    ["prism", "prism"],
    ["holo", "prism"],
    ["liquid", "liquid"],
    ["ink", "liquid"],
    ["blob", "liquid"],
    ["blobs", "liquid"],
    ["metaballs", "liquid"],
  ]);

  return map.get(normalized) || "aurora";
}

function buildFragmentShaderSource(overlay) {
  return `
    precision mediump float;

    uniform vec2 uResolution;
    uniform float uTime;
    uniform vec2 uMouse;
    uniform vec3 uAccentA;
    uniform vec3 uAccentB;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);

      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));

      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.55;
      mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = rot * p * 2.02;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution.xy;
      vec2 p = uv * 2.0 - 1.0;
      p.x *= uResolution.x / uResolution.y;

      float t = uTime;

      float vign = smoothstep(1.35, 0.15, length(p));

      vec2 warp = vec2(
        fbm(p * 1.15 + vec2(0.0, t * 0.06)),
        fbm(p * 1.25 + vec2(7.2, -t * 0.05))
      );

      float bands = fbm(vec2(p.x * 0.9, p.y * 2.8) + warp * 0.9 + vec2(0.0, t * 0.28));
      float aur = smoothstep(0.25, 0.95, bands) * vign;

      vec3 colA = uAccentA;
      vec3 colB = uAccentB;
      vec3 colC = vec3(0.35, 0.70, 1.00);

      float mixAB = clamp(fbm(p * 0.9 + warp + t * 0.02), 0.0, 1.0);
      vec3 aurCol = mix(colA, colB, mixAB);
      aurCol = mix(aurCol, colC, bands * 0.35);

      vec3 base = vec3(0.03, 0.04, 0.07);
      vec3 col = base;

      col += aurCol * aur * 0.75;
      col += aurCol * pow(aur, 3.0) * 0.85;

      ${overlay}

      if (uMouse.x >= 0.0) {
        vec2 mp = uMouse * 2.0 - 1.0;
        mp.x *= uResolution.x / uResolution.y;
        float md = length(p - mp);
        float glow = exp(-md * 3.2);
        col += aurCol * glow * 0.55;
      }

      float grain = (hash21(gl_FragCoord.xy) - 0.5) * 0.05;
      col += grain;

      col *= vign;
      col = clamp(col, 0.0, 1.0);
      col = pow(col, vec3(0.9));

      gl_FragColor = vec4(col, 1.0);
    }
  `;
}

function getFragmentShaderSource(mode) {
  const overlays = {
    aurora: `
      // Aurora ridges (no stars / no twinkle)
      float rid = 1.0 - abs(2.0 * fbm(p * 1.35 + warp * 0.65 + vec2(t * 0.12, -t * 0.08)) - 1.0);
      rid = pow(clamp(rid, 0.0, 1.0), 3.0) * vign;
      col += aurCol * rid * 0.18;
    `,
    tunnel: `
      // Hyper tunnel (more graphic / high contrast)
      col = base;
      float r = length(p);
      float inv = 1.0 / (r + 0.18);
      float a = atan(p.y, p.x);
      float f = fbm(vec2(a * 0.65, inv * 0.35) + vec2(t * 0.11, -t * 0.09));
      float swirl = a + f * 2.6 + t * 0.35;
      float spokes = pow(abs(sin(swirl * 6.0)), 12.0);
      float rings = pow(abs(sin(inv * 1.35 - t * 0.85 + f * 3.0)), 9.0);
      float pulse = (spokes * 0.9 + rings * 0.85) * smoothstep(1.45, 0.0, r);
      vec3 tcol = mix(colA, colB, clamp(f, 0.0, 1.0));
      col += tcol * pulse * 0.55;
      col += vec3(1.0) * pow(pulse, 2.6) * 0.08;
    `,
    topo: `
      // Topographic contours
      float h = fbm(p * 1.0 + warp * 0.55 + vec2(0.0, t * 0.06));
      float c1 = abs(fract(h * 10.0) - 0.5);
      float lines = smoothstep(0.28, 0.0, c1);
      float c2 = abs(fract((h + bands) * 6.0) - 0.5);
      lines += smoothstep(0.24, 0.0, c2) * 0.6;
      lines *= vign;
      vec3 lineCol = mix(vec3(0.75, 0.9, 1.0), aurCol, 0.25);
      col += lineCol * lines * 0.22;
    `,
    prism: `
      // Holographic prism interference
      vec2 q = p + warp * 0.7;
      float ph = fbm(q * 1.8 + vec2(t * 0.2, -t * 0.17));
      float stripes = abs(sin((q.x * 1.2 + q.y * 0.9 + ph * 1.6) * 4.8 + t * 0.85));
      float prism = pow(stripes, 7.0) * vign;
      vec3 prismCol = mix(aurCol, vec3(1.0), 0.12);
      col += prismCol * prism * 0.28;
    `,
    liquid: `
      // Liquid blobs (metaballs-ish)
      col = base;
      vec2 q = p + warp * 0.35;
      float field = 0.0;
      for (int i = 0; i < 6; i++) {
        float fi = float(i);
        float h = hash21(vec2(fi, fi * 1.37));
        float ang = t * 0.22 + h * 6.2831 + fi * 1.7;
        float rad = 0.34 + 0.10 * sin(t * 0.17 + fi);
        vec2 c = vec2(cos(ang), sin(ang)) * rad;
        float d2 = dot(q - c, q - c);
        field += exp(-d2 * 6.5);
      }
      field += 0.25 * exp(-dot(q, q) * 1.3);

      float blob = smoothstep(0.62, 1.28, field);
      float rim = smoothstep(0.02, 0.0, abs(field - 1.02));

      vec3 lcol = mix(colA, colB, clamp(field * 0.55, 0.0, 1.0));
      col += lcol * blob * 0.55;
      col += vec3(1.0) * pow(rim, 1.4) * 0.10;
    `,
  };

  const key = Object.prototype.hasOwnProperty.call(overlays, mode) ? mode : "aurora";
  return buildFragmentShaderSource(overlays[key]);
}

function startWebglAurora(canvas, { animate, speed, accentA, accentB, mode }) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });

  if (!gl) return null;

  const vsSource = `
    attribute vec2 aPos;
    void main() {
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const fsSource = getFragmentShaderSource(mode);

  let program = null;
  try {
    program = createProgram(gl, vsSource, fsSource);
  } catch (err) {
    console.warn("[bg] shader error", err);
    return null;
  }
  if (!program) return null;

  gl.useProgram(program);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);

  const posLoc = gl.getAttribLocation(program, "aPos");
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(program, "uResolution");
  const uTime = gl.getUniformLocation(program, "uTime");
  const uMouse = gl.getUniformLocation(program, "uMouse");
  const uAccentA = gl.getUniformLocation(program, "uAccentA");
  const uAccentB = gl.getUniformLocation(program, "uAccentB");

  gl.uniform3f(uAccentA, accentA[0], accentA[1], accentA[2]);
  gl.uniform3f(uAccentB, accentB[0], accentB[1], accentB[2]);

  let width = 0;
  let height = 0;
  let rafId = 0;
  const pixelRatio = () => Math.min(2, window.devicePixelRatio || 1);

  function resize() {
    const dpr = pixelRatio();
    const nextW = Math.floor(window.innerWidth * dpr);
    const nextH = Math.floor(window.innerHeight * dpr);
    if (nextW === width && nextH === height) return;
    width = nextW;
    height = nextH;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  }

  let mouseX = -2;
  let mouseY = -2;
  function onPointerMove(e) {
    mouseX = clamp01(e.clientX / Math.max(1, window.innerWidth));
    mouseY = 1 - clamp01(e.clientY / Math.max(1, window.innerHeight));
  }
  function onPointerLeave() {
    mouseX = -2;
    mouseY = -2;
  }

  function render(nowMs) {
    if (document.hidden) return;

    resize();
    gl.uniform2f(uResolution, width, height);
    gl.uniform1f(uTime, (nowMs / 1000) * speed);
    gl.uniform2f(uMouse, mouseX, mouseY);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(nowMs) {
    rafId = requestAnimationFrame(frame);
    render(nowMs);
  }

  const onLost = (e) => {
    e.preventDefault();
    stop();
  };

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;

    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("webglcontextlost", onLost);

    if (buffer) gl.deleteBuffer(buffer);
    buffer && gl.bindBuffer(gl.ARRAY_BUFFER, null);

    if (program) gl.deleteProgram(program);
    program = null;
  }

  resize();
  render(0);

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerleave", onPointerLeave, { passive: true });
  canvas.addEventListener("webglcontextlost", onLost);

  if (animate) {
    rafId = requestAnimationFrame(frame);
  }

  return stop;
}

export function setupHeroBackground({ hostId = DEFAULT_HOST_ID } = {}) {
  const host = document.getElementById(hostId);
  if (!host) return () => {};

  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

  let forceMotion = host.getAttribute("data-bg-force") === "true" || document.body?.dataset?.bgForce === "true";
  const params = new URLSearchParams(window.location.search);
  const mode = getBgMode(
    params.get("bg") || params.get("bgMode") || host.getAttribute("data-bg-mode") || document.body?.dataset?.bgMode
  );
  const urlForce = ["1", "true", "yes", "on"].includes(String(params.get("bgForce") ?? "").toLowerCase());
  const urlDebug = ["1", "true", "yes", "on"].includes(String(params.get("bgDebug") ?? "").toLowerCase());
  if (urlForce) {
    forceMotion = true;
    if (document.body) document.body.dataset.bgForce = "true";
    host.dataset.bgUrlForce = "true";
  }
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  // Dev ergonomics: surface motion on localhost even if the OS prefers reduced motion.
  if (reduceMotion && !forceMotion && isLocalhost) {
    forceMotion = true;
    if (document.body) document.body.dataset.bgForce = "true";
    host.dataset.bgDevForce = "true";
  }

  const urlMotionRaw = String(params.get("bgMotion") ?? "").toLowerCase();
  const urlMotionOff = ["0", "false", "no", "off"].includes(urlMotionRaw);
  const attrMotionOff =
    host.getAttribute("data-bg-motion") === "off" || document.body?.dataset?.bgMotion === "off";

  const animate = forceMotion ? true : !(urlMotionOff || attrMotionOff);

  const accentA = getCssVarColor("--accent", [0.486, 0.227, 0.929]);
  const accentB = getCssVarColor("--accent2", [0.133, 0.773, 0.369]);

  const rawSpeed = host.getAttribute("data-bg-speed") || document.body?.dataset?.bgSpeed;
  const speedNum = Number(rawSpeed);
  const speedFallback = getCssVarNumber("--bg-speed", 0.7);
  const speed = Number.isFinite(speedNum) && speedNum > 0 ? speedNum : speedFallback;

  host.dataset.bgMotion = animate ? "on" : "off";
  host.dataset.bgSpeed = String(speed);
  host.dataset.bgMode = mode;

  if (reduceMotion) host.dataset.bgReducedMotion = "true";

  let debugEl = null;
  function setDebug(text) {
    if (!urlDebug) return;
    if (!debugEl) {
      debugEl = document.createElement("div");
      debugEl.style.cssText =
        "position:fixed;left:12px;bottom:12px;z-index:9999;padding:8px 10px;border-radius:12px;" +
        "background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);" +
        "color:#fff;font:12px/1.25 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;backdrop-filter:blur(8px);";
      debugEl.setAttribute("aria-hidden", "true");
      document.body.appendChild(debugEl);
    }
    debugEl.textContent = text;
  }

  const canvas = document.createElement("canvas");
  canvas.className = "hero-bg-canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  let stop = null;
  try {
    stop = startWebglAurora(canvas, { animate, speed, accentA, accentB, mode });
  } catch (err) {
    console.warn("[bg] init failed", err);
  }

  if (!stop) {
    host.dataset.bgRenderer = "css";
    setDebug(
      `BG css · mode:${host.dataset.bgMode} · motion:${host.dataset.bgMotion} · speed:${host.dataset.bgSpeed}` +
        (host.dataset.bgReducedMotion ? " · reduced-motion" : "")
    );
    canvas.remove();
    return () => {};
  }

  host.dataset.bgRenderer = "webgl";
  setDebug(
    `BG webgl · mode:${host.dataset.bgMode} · motion:${host.dataset.bgMotion} · speed:${host.dataset.bgSpeed}` +
      (host.dataset.bgReducedMotion ? " · reduced-motion" : "")
  );

  return () => {
    try {
      stop?.();
    } finally {
      canvas.remove();
      debugEl?.remove();
    }
  };
}
