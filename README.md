# Blue Archive — Ocean Research

Mobile-first Three.js exploration game using the supplied map, player, helm, media, sound, and water-normal assets.

## Run

```powershell
npm start
```

Then open <http://localhost:5173>. A local server is required because browsers do not load GLB modules correctly from a `file://` URL.

## Content editing

Trigger popup content lives in the `<template>` blocks near the bottom of `index.html`. Replace the sample media paths or the paired `data-ko` / `data-en` strings there. Replace the placeholder Google Forms URL in `completion-template` before deployment.

## Ocean rendering

The ocean is a custom WebGL implementation; it does not require Water Pro or new dependencies.

- `modules/ocean.js`: six wind-aligned wave bands with bent wave fronts, shared by GPU displacement and CPU buoyancy. Four advected, wind-stretched normal layers supply irregular wavelets; the broad swell stays gentle to avoid a visible crosshatch. Turquoise scattering, angle-dependent absorption, Fresnel planar reflection, sun highlights, sparse wind-broken foam and horizon haze shade the surface. A stretched grid concentrates triangles near the camera.
- `modules/bow.js`: animated bow foam and spray; `modules/wake.js`: a subdivided, wave-following stern trail.
- `modules/hull-foam.js`: a thin contact-foam ribbon where the hull intersects the waves, following heave, pitch and roll even at rest. It uses the existing foam texture and increases width/opacity with speed. Adjust `HULL_FOAM.width`, `idleOpacity` and `movingOpacity` in `modules/config.js` to tune it.
- `modules/ocean-foam.js`: a 30 Hz foam history field centered on the camera, using two 512px targets (256px on compact devices). Wave height, crest sharpness and local current convergence seed irregular patches; foam drifts and decays over time independently of the normal/ripple strength. `OCEAN_FOAM` in `modules/config.js` controls amount, crest height, coverage, drift speed, lifetime and bubble texture scale. These are visual whitecaps, not a fluid simulation.
- `modules/foam-noise.js`: shared world-space foam noise for the ocean, hull, bow and wake. Three randomly offset/rotated/reflected texture patches blend on a triangular lattice; slow domain warping also distorts repeating shapes inside the source image. A separate noise field varies density and ribbon edges, and three-octave fBm seeds the ocean history. Explicit texture gradients keep mip selection stable across patch boundaries. This is a lightweight stochastic blend, without histogram lookup textures; it uses three foam texture reads per fragment instead of the previous one or two. Evaluate the extra shader cost on target mobile devices.
- `modules/scene.js`: sky, exposure, environment lighting and sunset. Hull motion is isolated from steering in `main.js`.
- `modules/model-materials.js`: iPhone/iPad browsers (including iPad desktop mode), and devices without half-float color buffers, use Phong model materials with direct/hemisphere lighting instead of GPU-generated HDR environment lighting. Original colors, textures, transparency and double-sided faces are preserved; metallic reflections are approximated. This applies to both the ship and map, including sunset. Their ocean reflection target also uses RGBA8. Other devices retain PBR lighting; the sun disc is excluded when baking the environment because a directional light already supplies it.

Coarse-pointer devices or devices reporting four or fewer CPU threads use a 160-segment grid, 512px reflections and a 1.25 pixel-ratio cap. Other devices use 256 segments, 1024px reflections and a 1.75 cap. These are starting presets, not measured performance guarantees. Edit `oceanQuality` and `waves` in `modules/ocean.js` to tune them.

The existing normal/foam textures use up to 8x anisotropic filtering. Fine normal layers fade by pixel footprint to reduce distant shimmer; texture-driven current distortion and different layer scales avoid obvious repeating tiles. Water colors are local to the ocean material, leaving the ship and sky exposure unchanged.

This is a layered analytical wave approximation, not an FFT ocean simulation. Reflections use the mean water plane. Shoreline depth/refraction and underwater rendering are not included. Check actual appearance and frame rate on target desktop/mobile browsers before release.
