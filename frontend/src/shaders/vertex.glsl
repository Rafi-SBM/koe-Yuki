// Vertex Shader for Fluid Audio Reactive Sphere
uniform float u_time;
uniform float u_intensity;
uniform float u_mode; // 0: IDLE, 1: LISTENING, 2: THINKING, 3: SPEAKING
uniform float u_frequency_low;
uniform float u_frequency_mid;
uniform float u_frequency_high;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplacement;
varying float vFresnel;

// Simplex 3D Noise Implementation
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

  // Permutations
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  // Gradients
  float n_ = 0.142857142857; // 1.0/7.0
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  // Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix contributions
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// Fractal Brownian Motion for rich organic liquid turbulence
float fbm(vec3 p) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 4; i++) {
    val += amp * snoise(p * freq);
    freq *= 2.1;
    amp *= 0.45;
  }
  return val;
}

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;

  // Calculate speed and noise frequencies based on state mode
  float speed = 0.6;
  float baseDistortion = 0.12;
  float audioReact = u_intensity * 0.45;

  if (u_mode > 0.5 && u_mode < 1.5) {
    // Mode 1: LISTENING - responsive pulsing to microphone
    speed = 1.2;
    baseDistortion = 0.18 + u_intensity * 0.5;
  } else if (u_mode > 1.5 && u_mode < 2.5) {
    // Mode 2: THINKING - swirling fast vortex
    speed = 2.4;
    baseDistortion = 0.28 + sin(u_time * 3.0) * 0.08;
  } else if (u_mode > 2.5) {
    // Mode 3: SPEAKING - dramatic dynamic morphing waves
    speed = 1.8;
    baseDistortion = 0.25 + u_intensity * 0.75 + u_frequency_mid * 0.3;
  }

  // Sample multi-frequency noise field
  vec3 noiseCoord = position * 1.6 + vec3(0.0, 0.0, u_time * speed * 0.35);
  
  // Swirl effect for thinking mode
  if (u_mode > 1.5 && u_mode < 2.5) {
    float angle = u_time * 2.0 + position.y * 1.5;
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    noiseCoord.xz = rot * noiseCoord.xz;
  }

  float noiseVal = fbm(noiseCoord);
  float highDetail = snoise(position * 3.5 + vec3(u_time * speed * 0.8)) * 0.25;
  
  float displacement = (noiseVal + highDetail) * (baseDistortion + audioReact);
  vDisplacement = displacement;

  // Displace vertex along normal
  vec3 newPosition = position + normal * displacement;

  vec4 modelViewPos = modelViewMatrix * vec4(newPosition, 1.0);
  gl_Position = projectionMatrix * modelViewPos;

  // Compute Fresnel rim term
  vec3 viewDir = normalize(-modelViewPos.xyz);
  vFresnel = clamp(1.0 - dot(viewDir, vNormal), 0.0, 1.0);
}
