// Shared by surface, hull, bow and wake foam. World-space inputs keep the
// pattern continuous across mesh sections and stable as the camera moves.
export const foamNoiseGLSL = `
  vec2 foamHash(vec2 p) {
    vec3 h = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    h += dot(h, h.yzx + 33.33);
    return fract((h.xx + h.yz) * h.zy);
  }

  float foamNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(foamHash(cell).x, foamHash(cell + vec2(1.0, 0.0)).x, f.x),
      mix(foamHash(cell + vec2(0.0, 1.0)).x, foamHash(cell + vec2(1.0)).x, f.x), f.y);
  }

  float foamFbm(vec2 p) {
    // Rotate between octaves so the lattice does not line up into rows.
    mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
    float value = 0.57 * foamNoise(p);
    p = turn * p * 2.03 + vec2(17.1, 9.2);
    value += 0.28 * foamNoise(p);
    p = turn * p * 2.07 + vec2(8.3, 21.7);
    return value + 0.15 * foamNoise(p);
  }
`;

// Fragment-only helpers: explicit gradients prevent randomized patch offsets
// from selecting blurry mip levels at triangle boundaries. Inspired by the
// three-patch construction of Heitz/Neyret (HPG 2018); this lightweight version
// sharpens weights instead of requiring histogram-transform lookup textures.
export const foamPatternGLSL = `
  ${foamNoiseGLSL}

  float foamPatch(sampler2D map, vec2 p, vec2 id, vec2 dx, vec2 dy) {
    vec2 random = foamHash(id);
    vec2 flip = step(vec2(0.5), random) * 2.0 - 1.0;
    mat2 turn = random.x < 0.5
      ? mat2(0.0, 1.0, -1.0, 0.0) : mat2(1.0, 0.0, 0.0, 1.0);
    return textureGrad(map, (turn * p) * flip + random,
      (turn * dx) * flip, (turn * dy) * flip).r;
  }

  float foamStochastic(sampler2D map, vec2 p) {
    vec2 dx = dFdx(p);
    vec2 dy = dFdy(p);
    vec2 grid = mat2(1.0, 0.0, -0.57735027, 1.15470054) * p * 2.0;
    vec2 cell = floor(grid);
    vec2 f = fract(grid);
    vec2 a;
    vec2 b;
    vec2 c;
    vec3 weights;
    if (f.x + f.y < 1.0) {
      a = cell;
      b = cell + vec2(1.0, 0.0);
      c = cell + vec2(0.0, 1.0);
      weights = vec3(1.0 - f.x - f.y, f.x, f.y);
    } else {
      a = cell + vec2(1.0);
      b = cell + vec2(0.0, 1.0);
      c = cell + vec2(1.0, 0.0);
      weights = vec3(f.x + f.y - 1.0, 1.0 - f.x, 1.0 - f.y);
    }
    // Keep bubbles crisp through transitions without hard patch boundaries.
    weights *= weights;
    weights *= weights;
    weights /= dot(weights, vec3(1.0));
    return dot(weights, vec3(foamPatch(map, p, a, dx, dy),
      foamPatch(map, p, b, dx, dy), foamPatch(map, p, c, dx, dy)));
  }

  vec2 foamPattern(sampler2D map, vec2 p, float time) {
    // Slow, continuous domain warping breaks up shapes inside the source image,
    // too. Never reseed per frame: foam should stretch rather than flicker.
    vec2 evolution = vec2(time * 0.027, -time * 0.019);
    vec2 warp = vec2(foamNoise(p * 0.43 + evolution),
      foamNoise(p * 0.43 + vec2(19.7, 73.1) - evolution * 0.71));
    vec2 warped = p + (warp - 0.5) * 1.25;
    float patches = foamNoise(warped * 0.61 + vec2(7.3, 41.9));
    return vec2(foamStochastic(map, warped), patches);
  }
`;
