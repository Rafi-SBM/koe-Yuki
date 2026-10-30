// Fragment Shader for Fluid Ethereal Glow & Chromatic Waves
uniform float u_time;
uniform float u_intensity;
uniform float u_mode;
uniform vec3 u_color_primary;
uniform vec3 u_color_secondary;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplacement;
varying float vFresnel;

void main() {
  // Normalize base coordinates
  vec3 normal = normalize(vNormal);
  
  // Dynamic wave crest factor driven by vertex displacement and audio
  float waveFactor = smoothstep(-0.15, 0.35, vDisplacement);
  
  // Fresnel glow intensity
  float fresnelPow = pow(vFresnel, 2.2);
  float outerGlow = pow(vFresnel, 3.8) * 1.6;

  // Base inner liquid core
  vec3 deepCore = mix(u_color_primary * 0.45, u_color_primary * 1.1, clamp(vDisplacement + 0.3, 0.0, 1.0));
  
  // Surface wave highlights using secondary accent color
  vec3 waveHighlights = mix(u_color_primary, u_color_secondary, waveFactor);
  
  // Chromatic accent shimmer
  float shimmer = sin(vPosition.y * 8.0 + u_time * 2.5) * 0.5 + 0.5;
  vec3 chromaticAccent = mix(u_color_secondary * 1.3, vec3(1.0), shimmer * 0.35 * u_intensity);

  // Combine layers
  vec3 finalColor = mix(deepCore, waveHighlights, waveFactor * 0.75);
  finalColor += outerGlow * u_color_secondary * 1.4;
  finalColor += fresnelPow * chromaticAccent * (0.6 + u_intensity * 0.8);

  // State-specific color boosts
  if (u_mode > 0.5 && u_mode < 1.5) {
    // Listening mode: subtle harmonic pulse
    finalColor += u_color_secondary * (0.15 + 0.25 * sin(u_time * 4.0));
  } else if (u_mode > 1.5 && u_mode < 2.5) {
    // Thinking mode: energetic rotating hue glow
    finalColor += mix(u_color_primary, u_color_secondary, sin(u_time * 5.0) * 0.5 + 0.5) * 0.3;
  } else if (u_mode > 2.5) {
    // Speaking mode: bright active resonance
    finalColor += u_color_secondary * (u_intensity * 0.8);
  }

  // Alpha transparency for ethereal soft liquid edge
  float alpha = clamp(0.72 + fresnelPow * 0.28 + u_intensity * 0.15, 0.0, 1.0);

  gl_FragColor = vec4(finalColor, alpha);
}
