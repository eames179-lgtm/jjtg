import * as THREE from "three";

export function createPickupEffectSystem(scene) {
  const particles = [];

  function createBurst(position) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(18 * 3);
    const velocities = [];
    for (let i = 0; i < 18; i++) {
      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          2 + Math.random() * 7,
          (Math.random() - 0.5) * 8,
        ),
      );
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x86fff3,
      size: 1.2,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.position.copy(position);
    scene.add(points);
    particles.push({ points, velocities, life: 1 });
  }

  function update(dt) {
    for (let p = particles.length - 1; p >= 0; p--) {
      const effect = particles[p];
      effect.life -= dt * 0.95;
      const positions = effect.points.geometry.attributes.position;
      effect.velocities.forEach((velocity, i) => {
        positions.array[i * 3] += velocity.x * dt;
        positions.array[i * 3 + 1] += velocity.y * dt;
        positions.array[i * 3 + 2] += velocity.z * dt;
        velocity.y -= 8 * dt;
      });
      positions.needsUpdate = true;
      effect.points.material.opacity = Math.max(effect.life, 0);
      if (effect.life <= 0) {
        scene.remove(effect.points);
        effect.points.geometry.dispose();
        effect.points.material.dispose();
        particles.splice(p, 1);
      }
    }
  }

  return { createBurst, update };
}
