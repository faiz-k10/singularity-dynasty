// The ray-traced black hole behind the Dynasty Board's 3D view (DynastyOrbit.js). One full-screen WebGL pass per frame:
// every pixel's light ray is traced backwards through a Schwarzschild black hole's gravity (the "Starless" / Interstellar method:
// a photon's path bends with acceleration -1.5 h^2 r / |r|^5, units of the Schwarzschild radius), so the far side of the
// accretion disk wraps over and under the shadow, the photon ring appears by itself and the stars behind are lensed into an
// Einstein ring. The disk follows the Novikov-Thorne temperature profile, is Doppler-beamed (the side coming toward you
// blazes, the receding side dims) and gravitationally redshifted, and its turbulent gas turns with Keplerian speed (inner
// orbits faster). Filmic tone curve, grain and vignette at the end. The camera is the SAME pinhole camera DynastyOrbit's data
// layer projects with, so the players drawn on top sit exactly on this disk.
// Returns null when WebGL isn't available (the caller then draws its flat 2D hole).

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;      // drawing buffer size (px)
uniform vec2 uCss;      // the canvas in CSS px
uniform vec2 uCenter;   // the hole's centre on screen, CSS px
uniform float uSc;      // CSS px per world unit at the hole (the data layer's projection scale)
uniform float uFocal;   // camera distance from the hole, world units
uniform float uRs;      // Schwarzschild radius, world units
uniform float uAz, uEl, uTime;
uniform float uRin, uRout;   // the visible disk, in Schwarzschild radii

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float noise3(vec3 p){
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hash3(i), b = hash3(i + vec3(1, 0, 0)), c = hash3(i + vec3(0, 1, 0)), d = hash3(i + vec3(1, 1, 0));
  float e = hash3(i + vec3(0, 0, 1)), g = hash3(i + vec3(1, 0, 1)), h = hash3(i + vec3(0, 1, 1)), k = hash3(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
float fbm3(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * noise3(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
// the disk's gas at (log radius, angle), sampled on a circle so it wraps round with no seam; k = features per radian
float ringNoise(float lr, float ang, float k, float lk){ return fbm3(vec3(cos(ang) * k, sin(ang) * k, lr * lk)); }

// the stars behind, by direction (so the lensing bends them): sparse sharp points in three sizes and a faint dust band
vec3 sky(vec3 d){
  vec3 c = vec3(0.0);
  for (int k = 0; k < 3; k++){
    float sc = k == 0 ? 90.0 : k == 1 ? 210.0 : 420.0;
    vec3 q = d * sc, id = floor(q), f = fract(q) - 0.5;
    float h = hash3(id);
    if (h > (k == 0 ? 0.965 : 0.93)){
      vec3 o = vec3(hash3(id + 1.3), hash3(id + 2.7), hash3(id + 4.1)) - 0.5;
      float dd = length(f - o * 0.6);
      float b = smoothstep(0.09, 0.0, dd) * (k == 0 ? 1.6 : k == 1 ? 0.7 : 0.35);
      vec3 tint = mix(vec3(1.0, 0.78, 0.62), vec3(0.72, 0.82, 1.0), hash3(id + 9.0));
      c += tint * b;
    }
  }
  float band = exp(-pow(d.z * 2.4 + 0.35 * sin(atan(d.y, d.x) * 2.0), 2.0) * 3.0);
  c += vec3(0.05, 0.035, 0.03) * band * (0.4 + fbm3(d * 6.0)); // sampled by direction, so no seam where the angle wraps
  return c;
}

// disk colour by temperature (1 = the hottest point of an unshifted disk): deep red -> the site's ember -> amber -> white-hot ->
// a blue-white that only the beamed side reaches
vec3 heat(float t){
  vec3 a = vec3(0.32, 0.03, 0.01), b = vec3(0.91, 0.39, 0.25), c = vec3(1.0, 0.72, 0.38), d = vec3(1.0, 0.95, 0.86), e = vec3(0.80, 0.88, 1.0);
  if (t < 0.45) return mix(a, b, t / 0.45);
  if (t < 0.75) return mix(b, c, (t - 0.45) / 0.3);
  if (t < 1.05) return mix(c, d, (t - 0.75) / 0.3);
  return mix(d, e, clamp((t - 1.05) / 0.5, 0.0, 1.0));
}

vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

// light emitted where the ray crosses the disk at q (rs units), heading along v
vec4 disk(vec3 q, vec3 v){
  float r = length(q.xy);
  if (r < uRin || r > uRout) return vec4(0.0);
  float nt = pow(uRin / r, 0.75) * pow(max(1.0 - sqrt(uRin / r), 0.0), 0.25) * 2.3; // Novikov-Thorne shape, peak ~1
  float beta = min(sqrt(0.5 / (r - 1.0)), 0.75);
  vec3 vel = normalize(vec3(-q.y, q.x, 0.0)) * beta;                 // counter-clockwise orbit
  float cosT = dot(normalize(vel), -normalize(v));                   // toward the camera = approaching
  float D = 1.0 / ((1.0 / sqrt(1.0 - beta * beta)) * (1.0 - beta * cosT));
  float g = D * sqrt(1.0 - 1.0 / r);                                 // Doppler x gravitational shift
  float phiW = atan(q.y, q.x) - uAz;                                  // the disk's own angle, so its gas turns with the scene
  float omega = 1.6 * pow(r, -1.5);                                   // Keplerian: inner gas laps the outer
  // gas sheared along its orbit: long filaments in angle, broken up by a second warped layer so they never read as plain rings
  float ang = phiW - uTime * omega * 1.2, lr = log(r);
  float warp = ringNoise(lr + 3.1, ang, 1.2, 5.4) - 0.5;                       // bends the filaments so they never read as rings
  float turb = ringNoise(lr + warp * 0.25, ang + warp * 1.1, 2.0, 9.0) * 0.7 + ringNoise(lr + warp * 0.35, ang + warp * 1.6, 6.0, 22.0) * 0.5;
  float streaks = 0.28 + 1.35 * smoothstep(0.32, 0.82, turb);           // dark lanes and bright filaments
  float edge = smoothstep(uRin, uRin * 1.08, r) * (1.0 - smoothstep(uRout * 0.45, uRout, r));
  float gg = clamp(g, 0.35, 1.7);
  float I = pow(nt, 1.8) * pow(gg, 3.0) * streaks * edge;
  vec3 col = heat(nt * pow(gg, 1.1) * 0.82) * I * 1.3;
  float a = clamp(I * 0.85, 0.0, 0.9);
  return vec4(col, a);
}

void main(){
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * uCss;
  float u = (css.x - uCenter.x) / uSc, w = (uCenter.y - css.y) / uSc;
  float ce = cos(uEl), se = sin(uEl);
  vec3 R = vec3(1.0, 0.0, 0.0), U = vec3(0.0, se, ce), T = vec3(0.0, -ce, se);
  vec3 dir = normalize(R * u + U * w - T * uFocal);
  vec3 p = T * uFocal / uRs, v = dir;

  vec3 col = vec3(0.0); float alpha = 0.0; bool hole = false; float rmin = 1e9;
  vec3 hv = cross(p, v); float h2 = dot(hv, hv), b = sqrt(h2);

  if (b > uRout * 1.25){
    // far from the hole: a straight line is exact enough for the disk; the stars get the weak-field bend (2 rs / b)
    float t = -p.z / v.z;
    if (t > 0.0){ vec4 e = disk(p + v * t, v); col += e.rgb * e.a; alpha += e.a; }
    vec3 toC = normalize(-p - v * dot(-p, v));
    v = normalize(v + toC * (2.0 / b));
  } else {
    // jump straight to a sphere well outside the disk, then march the bent path
    vec3 toC0 = normalize(-p - v * dot(-p, v)); // toward the hole, square to the ray
    float tc = dot(-p, v), R0 = uRout * 1.3;
    float t0 = tc - sqrt(max(R0 * R0 - b * b, 0.0));
    if (t0 > 0.0) p += v * t0;
    for (int i = 0; i < 260; i++){
      float r2 = dot(p, p), r = sqrt(r2);
      rmin = min(rmin, r);
      if (r < 1.0){ hole = true; break; }
      if (r > R0 * 1.05 && dot(p, v) > 0.0) break;
      float dt = clamp(0.07 * r * (r - 0.9), 0.012, 1.6);
      vec3 acc = -1.5 * h2 * p / (r2 * r2 * r);
      v += acc * dt;
      vec3 pn = p + v * dt;
      if (p.z * pn.z < 0.0){
        vec3 q = mix(p, pn, p.z / (p.z - pn.z));
        vec4 e = disk(q, v);
        col += (1.0 - alpha) * e.rgb * e.a;
        alpha += (1.0 - alpha) * e.a;
        if (alpha > 0.985) break;
      }
      p = pn;
    }
    // the march starts and ends on the sphere R0; the weak bend picked up outside it (2/b of it in all, both ends) is added here,
    // so a star moves smoothly across the switch to straight rays at b = 1.25 uRout instead of jumping
    if (!hole) v = normalize(normalize(v) + toC0 * (2.0 / b) * (1.0 - sqrt(max(1.0 - (b * b) / (R0 * R0), 0.0))));
    v = normalize(v);
  }
  if (!hole) col += (1.0 - alpha) * sky(v) * 0.9;
  // the photon sphere's faint glow just outside the shadow
  col += vec3(1.0, 0.55, 0.3) * 0.18 * exp(-max(rmin - 1.5, 0.0) * 5.0) * (hole ? 0.0 : 1.0);

  col = aces(col * 0.8);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, 1.35);                                           // the filmic curve greys bright fire; put the colour back
  vec2 sv = css / uCss - 0.5;
  col *= 1.0 - smoothstep(0.35, 0.85, length(sv * vec2(1.0, 1.3))) * 0.55;       // vignette
  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.028;          // film grain
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(0.95)), 1.0);
}`;

export function createBlackHole(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  if (!gl || gl.isContextLost()) return null;
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn("[blackhole]", gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn("[blackhole]", gl.getProgramInfoLog(prog)); return null; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ["uRes", "uCss", "uCenter", "uSc", "uFocal", "uRs", "uAz", "uEl", "uTime", "uRin", "uRout"]) U[n] = gl.getUniformLocation(prog, n);
  return {
    // draws one frame; o = { cssW, cssH, cx, cy, sc, focal, rs, az, el, time, rin, rout }
    render(o) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform2f(U.uCss, o.cssW, o.cssH);
      gl.uniform2f(U.uCenter, o.cx, o.cy);
      gl.uniform1f(U.uSc, o.sc);
      gl.uniform1f(U.uFocal, o.focal);
      gl.uniform1f(U.uRs, o.rs);
      gl.uniform1f(U.uAz, o.az);
      gl.uniform1f(U.uEl, o.el);
      gl.uniform1f(U.uTime, o.time);
      gl.uniform1f(U.uRin, o.rin);
      gl.uniform1f(U.uRout, o.rout);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    // the same frame, timed: waits for the GPU to finish (a short stall), so the caller runs it only now and then
    timed(o) { const t = performance.now(); this.render(o); gl.finish(); return performance.now() - t; },
    // frees the program; the context itself stays with its canvas (a remount, e.g. React's development double-mount, reuses it)
    dispose() { gl.deleteBuffer(buf); gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs); },
    lost: () => gl.isContextLost(),
  };
}
