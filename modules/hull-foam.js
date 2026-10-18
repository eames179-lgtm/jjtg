import * as THREE from "three";
import { HULL_FOAM } from "./config.js";
import { oceanWaveGLSL, sampleOceanHeight } from "./ocean.js";
import { foamPatternGLSL } from "./foam-noise.js";

export function createHullFoamSystem(scene) {
  let foam;
  let vessel;
  let localVertices = [];
  let worldVertices = [];
  let triangles = [];
  let distances;
  const inverse = new THREE.Matrix4();
  const transform = new THREE.Matrix4();
  const normal = new THREE.Vector3();
  const edge = new THREE.Vector3();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();

  function create(texture) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: HULL_FOAM.idleOpacity },
        uSurfaceY: { value: HULL_FOAM.surfaceY },
        uFoam: { value: texture },
        uColor: { value: new THREE.Color(0xe6f8ff) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        uniform float uTime;
        uniform float uSurfaceY;
        varying float vAcross;
        varying vec2 vWorldXZ;
        ${oceanWaveGLSL}
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          world.y = oceanField(world.xz, uTime).x + uSurfaceY;
          vAcross = uv.x;
          vWorldXZ = world.xz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        uniform sampler2D uFoam;
        uniform vec3 uColor;
        varying float vAcross;
        varying vec2 vWorldXZ;
        ${foamPatternGLSL}
        void main() {
          vec2 foam = foamPattern(uFoam, vWorldXZ * 0.55
            + vec2(uTime * 0.025, -uTime * 0.04), uTime);
          float cells = smoothstep(0.06, 0.52, foam.x) * mix(0.55, 1.15, foam.y);
          float outer = 1.0 - smoothstep(0.08, 1.0,
            vAcross + (foam.y - 0.5) * 0.32);
          float inner = smoothstep(0.0, 0.14, vAcross);
          float alpha = inner * outer * mix(0.18, 1.0, cells) * uOpacity;
          if (alpha < 0.015) discard;
          gl_FragColor = vec4(uColor, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    foam = new THREE.Mesh(new THREE.BufferGeometry(), material);
    foam.name = "HullContactFoam";
    foam.frustumCulled = false;
    foam.renderOrder = 3;
    scene.add(foam);
  }

  function setVessel(object) {
    vessel = object;
    vessel.updateWorldMatrix(true, true);
    inverse.copy(vessel.matrixWorld).invert();
    const waterline = new THREE.Vector3()
      .setFromMatrixPosition(vessel.matrixWorld).setY(0).applyMatrix4(inverse).y;
    const meshes = [];
    vessel.traverse((child) => {
      if (child.isMesh) meshes.push(child);
    });
    const hulls = meshes.filter((mesh) => /hull/i.test(mesh.name));
    const unique = new Map();
    localVertices = [];
    triangles = [];

    function vertexIndex(point) {
      const key = `${point.x.toFixed(5)},${point.y.toFixed(5)},${point.z.toFixed(5)}`;
      if (!unique.has(key)) {
        unique.set(key, localVertices.length);
        localVertices.push(point.clone());
      }
      return unique.get(key);
    }

    // Split long hull faces once so the contact line can follow local waves.
    function addTriangle(a, b, c, depth = 0) {
      if (Math.min(a.y, b.y, c.y) > waterline + 3
        || Math.max(a.y, b.y, c.y) < waterline - 3) return;
      const ab = a.distanceToSquared(b);
      const bc = b.distanceToSquared(c);
      const ca = c.distanceToSquared(a);
      if (depth < 10 && Math.max(ab, bc, ca) > HULL_FOAM.segmentLength ** 2) {
        if (ab >= bc && ab >= ca) {
          const mid = a.clone().lerp(b, 0.5);
          addTriangle(a, mid, c, depth + 1);
          addTriangle(mid, b, c, depth + 1);
        } else if (bc >= ca) {
          const mid = b.clone().lerp(c, 0.5);
          addTriangle(a, b, mid, depth + 1);
          addTriangle(a, mid, c, depth + 1);
        } else {
          const mid = c.clone().lerp(a, 0.5);
          addTriangle(a, b, mid, depth + 1);
          addTriangle(mid, b, c, depth + 1);
        }
        return;
      }
      triangles.push([vertexIndex(a), vertexIndex(b), vertexIndex(c)]);
    }

    for (const mesh of hulls.length ? hulls : meshes) {
      transform.multiplyMatrices(inverse, mesh.matrixWorld);
      const { position } = mesh.geometry.attributes;
      const indices = mesh.geometry.index;
      const count = indices ? indices.count : position.count;
      for (let i = 0; i < count; i += 3) {
        const points = [0, 1, 2].map((j) => new THREE.Vector3()
          .fromBufferAttribute(position, indices ? indices.getX(i + j) : i + j)
          .applyMatrix4(transform));
        addTriangle(...points);
      }
    }
    worldVertices = localVertices.map(() => new THREE.Vector3());
    distances = new Float32Array(localVertices.length);
    const positions = new Float32Array(triangles.length * 4 * 3);
    const uvs = new Float32Array(triangles.length * 4 * 2);
    const indices = [];
    for (let i = 0; i < triangles.length; i++) {
      const v = i * 4;
      uvs.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8);
      indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3)
      .setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);
    foam.geometry.dispose();
    foam.geometry = geometry;
  }

  function intersectEdge(a, b, target, time) {
    const p = worldVertices[a];
    const q = worldVertices[b];
    let lo = 0;
    let hi = 1;
    let dLo = distances[a];
    let dHi = distances[b];
    // Refine against the actual wave rather than a flat mean water plane.
    for (let step = 0; step < 4; step++) {
      const t = THREE.MathUtils.lerp(lo, hi, dLo / (dLo - dHi));
      target.copy(p).lerp(q, t);
      const d = target.y - sampleOceanHeight(target.x, target.z, time);
      if (Math.abs(d) < 0.002) break;
      if ((d > 0) === (dLo > 0)) {
        lo = t;
        dLo = d;
      } else {
        hi = t;
        dHi = d;
      }
    }
  }

  function update(speed, time) {
    if (!foam || !vessel) return;
    vessel.updateWorldMatrix(true, false);
    for (let i = 0; i < localVertices.length; i++) {
      const p = worldVertices[i].copy(localVertices[i]).applyMatrix4(vessel.matrixWorld);
      distances[i] = p.y - sampleOceanHeight(p.x, p.z, time);
    }
    const motion = THREE.MathUtils.smoothstep(speed / 26, 0, 0.9);
    const width = HULL_FOAM.width * THREE.MathUtils.lerp(0.75, 1.3, motion);
    const position = foam.geometry.attributes.position;
    let segments = 0;
    for (const [a, b, c] of triangles) {
      const aboveA = distances[a] > 0;
      const aboveB = distances[b] > 0;
      const aboveC = distances[c] > 0;
      if (aboveA === aboveB && aboveB === aboveC) continue;
      let hits = 0;
      if (aboveA !== aboveB) {
        intersectEdge(a, b, start, time);
        hits++;
      }
      if (aboveB !== aboveC) {
        intersectEdge(b, c, hits ? end : start, time);
        hits++;
      }
      if (aboveC !== aboveA) intersectEdge(c, a, hits ? end : start, time);
      normal.subVectors(worldVertices[b], worldVertices[a]);
      edge.subVectors(worldVertices[c], worldVertices[a]);
      normal.cross(edge).setY(0);
      if (normal.lengthSq() < 1e-10 || start.distanceToSquared(end) < 1e-8) continue;
      normal.normalize();
      const v = segments++ * 4;
      position.setXYZ(v, start.x - normal.x * 0.1, 0, start.z - normal.z * 0.1);
      position.setXYZ(v + 1, start.x + normal.x * width, 0, start.z + normal.z * width);
      position.setXYZ(v + 2, end.x - normal.x * 0.1, 0, end.z - normal.z * 0.1);
      position.setXYZ(v + 3, end.x + normal.x * width, 0, end.z + normal.z * width);
    }
    position.needsUpdate = true;
    foam.geometry.setDrawRange(0, segments * 6);
    foam.visible = segments > 0;
    foam.material.uniforms.uTime.value = time;
    foam.material.uniforms.uSurfaceY.value = HULL_FOAM.surfaceY;
    foam.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(
      HULL_FOAM.idleOpacity, HULL_FOAM.movingOpacity, motion,
    );
  }

  return { create, setVessel, update };
}
