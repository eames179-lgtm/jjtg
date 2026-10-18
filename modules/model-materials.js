import * as THREE from "three";

export function isIOSDevice(device = globalThis.navigator) {
  return Boolean(
    device &&
      (/iPad|iPhone|iPod/.test(device.userAgent || "") ||
        (device.platform === "MacIntel" && device.maxTouchPoints > 1)),
  );
}

export function needsCompatibleLighting(renderer) {
  return isIOSDevice() ||
    !(renderer.extensions.has("EXT_color_buffer_float") ||
      renderer.extensions.has("EXT_color_buffer_half_float"));
}

// Keep model textures and lighting, but avoid the PBR/HDR environment path on
// iOS WebKit. A bad environment sample can turn the entire PBR material black,
// even when direct lights are present; setting envMapIntensity to zero is not
// enough to remove that shader path.
export function createModelMaterialAdapter(compatibleLighting) {
  const replacements = new WeakMap();

  function adaptMaterial(source, envMapIntensity) {
    if (!source.isMeshStandardMaterial) return source;
    if (!compatibleLighting) {
      if (envMapIntensity !== undefined) source.envMapIntensity = envMapIntensity;
      return source;
    }
    if (replacements.has(source)) return replacements.get(source);

    const material = new THREE.MeshPhongMaterial();
    // Copy shared render state (alpha, sides, depth, vertex colors, etc.).
    THREE.Material.prototype.copy.call(material, source);
    material.color.copy(source.color);
    material.emissive.copy(source.emissive);
    material.normalScale.copy(source.normalScale);
    for (const property of [
      "map", "alphaMap", "lightMap", "lightMapIntensity", "aoMap",
      "aoMapIntensity", "emissiveMap", "emissiveIntensity", "normalMap",
      "normalMapType", "bumpMap", "bumpScale", "displacementMap",
      "displacementScale", "displacementBias", "flatShading", "wireframe",
      "wireframeLinewidth", "fog",
    ]) {
      material[property] = source[property];
    }
    // Approximate the source's broad, matte highlights without an HDR sampler.
    const roughness = Math.max(0.05, source.roughness);
    material.shininess = Math.min(100, Math.max(1, 2 / roughness ** 4 - 2));
    material.specular.setRGB(0.04, 0.04, 0.04);
    if (source.specularColor) material.specular.multiply(source.specularColor);
    material.specular.multiplyScalar(source.specularIntensity ?? 1);

    replacements.set(source, material);
    return material;
  }

  return function prepareModel(root, { envMapIntensity } = {}) {
    root.traverse((object) => {
      if (!object.isMesh) return;
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => adaptMaterial(material, envMapIntensity))
        : adaptMaterial(object.material, envMapIntensity);
    });
  };
}
