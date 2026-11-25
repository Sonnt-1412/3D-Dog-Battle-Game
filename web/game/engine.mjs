import * as THREE from 'three';
import { loadDog } from './assets.mjs';
import { cameraReach, damping, integrateVelocity, moveOnStage, movementIntent, turnTo, updateStamina } from './physics.mjs';
import { SPAWN } from './terrain.mjs';
import { addForestLighting, loadForest } from './world.mjs';

const STEP = 1 / 60;
const PLAY_INTERVAL = STEP * 1000;
const PREVIEW_INTERVAL = 1000 / 24;
const PREVIEW_HEADING = -0.58;
const MOVEMENT_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight',
]);
const WALK_SPEED = 3.9;

export class Pawtown {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.mode = 'intro';
    this.mobile = matchMedia('(pointer: coarse)').matches;
    this.keys = new Set();
    this.stick = { x: 0, z: 0 };
    this.touchSprint = false;
    this.position = new THREE.Vector3();
    this.previousPosition = this.position.clone();
    this.renderPosition = this.position.clone();
    this.cameraTarget = new THREE.Vector3();
    this.cameraRight = new THREE.Vector3();
    this.cameraOffset = new THREE.Vector3();
    this.cameraAlternative = new THREE.Vector3();
    this.lastTime = null;
    this.nextFrame = -Infinity;
    this.quality = 1;
    this.frameCount = 0;
    this.frameDuration = 0;
    this.invalidated = true;
    this.reset();

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: !this.mobile, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(51, 1, 0.07, 105);
    addForestLighting(this.scene, this.mobile);

    this.bindInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.renderer.setAnimationLoop(null);
      this.pause();
      this.callbacks.error('Thiết bị đã mất kết nối với đồ họa 3D. Hãy tải lại trang.');
    });
    this.renderer.setAnimationLoop(time => this.frame(time));
  }

  async load(dog) {
    [this.actor, this.forest] = await Promise.all([
      Promise.resolve(dog).then(loadDog),
      loadForest(this.scene, this.mobile),
    ]);
    this.actor.root.rotation.order = 'YXZ';
    this.actor.root.traverse(part => {
      if (!part.isMesh) return;
      part.receiveShadow = true;
      part.material.envMap = this.forest.environment;
      part.material.envMapIntensity = 0.72;
      if (part.material.name.includes('detailed coat')) {
        part.material.color.multiplyScalar(1.24);
      }
    });
    this.scene.add(this.actor.root);
    this.invalidated = true;
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const pixelBudget = this.mobile ? 680_000 : 1_750_000;
    const ratio = this.quality * Math.min(window.devicePixelRatio || 1, this.mobile ? 1.42 : 1.25,
      Math.sqrt(pixelBudget / (width * height)));
    this.renderer.setDrawingBufferSize(width, height, ratio);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.invalidated = true;
  }

  reset() {
    this.position.set(SPAWN.x, 0, SPAWN.z);
    this.previousPosition.copy(this.position);
    this.renderPosition.copy(this.position);
    this.velocityX = 0;
    this.velocityZ = 0;
    this.verticalSpeed = 0;
    this.distanceSpeed = 0;
    this.stamina = 1;
    this.exhausted = false;
    this.sprinting = false;
    this.yaw = 0;
    this.pitch = 0.19;
    this.zoom = 4.35;
    this.cameraYaw = this.yaw;
    this.cameraPitch = this.pitch;
    this.cameraZoom = this.zoom;
    this.cameraClearance = 1;
    this.heading = Math.PI;
    this.accumulator = 0;
    this.staminaPercent = -1;
    this.invalidated = true;
  }

  play() {
    if (!this.actor || this.mode === 'playing') return;
    this.mode = 'playing';
    this.lastTime = null;
    this.frameCount = 0;
    this.frameDuration = 0;
    this.invalidated = true;
    this.callbacks.mode(this.mode);
    this.canvas.focus({ preventScroll: true });
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.clearInput();
    this.velocityX = 0;
    this.velocityZ = 0;
    this.sprinting = false;
    this.accumulator = 0;
    this.invalidated = true;
    this.callbacks.mode(this.mode);
  }

  clearInput() {
    this.keys.clear();
    this.stick.x = 0;
    this.stick.z = 0;
    this.touchSprint = false;
    this.drag = null;
  }

  jump() {
    if (this.mode !== 'playing' || this.position.y > 0 || this.verticalSpeed > 0) return;
    this.verticalSpeed = 4.6;
  }

  bark() {
    if (this.mode === 'playing') this.actor.animation.play('Bark');
  }

  bindInput() {
    window.addEventListener('keydown', event => {
      if (this.mode !== 'playing') return;
      if (MOVEMENT_KEYS.has(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
        return;
      }
      if (event.code === 'Space') event.preventDefault();
      if (event.repeat) return;
      if (event.code === 'Escape') this.pause();
      if (event.code === 'Space') this.jump();
      if (event.code === 'KeyB') this.bark();
      if (event.code === 'KeyR') this.reset();
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.pause());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });

    this.canvas.addEventListener('pointerdown', event => {
      if (this.mode !== 'playing' || this.drag || event.button !== 0) return;
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', event => {
      if (this.mode !== 'playing' || this.drag?.id !== event.pointerId) return;
      this.yaw -= (event.clientX - this.drag.x) * 0.006;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (event.clientY - this.drag.y) * 0.004, 0.11, 0.79);
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.canvas.addEventListener(type, event => {
        if (this.drag?.id === event.pointerId) this.drag = null;
      });
    }
    this.canvas.addEventListener('wheel', event => {
      if (this.mode !== 'playing') return;
      event.preventDefault();
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 160 : 1;
      this.zoom = THREE.MathUtils.clamp(this.zoom + event.deltaY * scale * 0.0075, 2.8, 8.7);
    }, { passive: false });
  }

  updateMovement(dt) {
    const keys = this.keys;
    const intent = movementIntent({
      x: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + this.stick.x,
      z: Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) + this.stick.z,
    }, this.cameraYaw);
    if (this.stamina < 0.015) this.exhausted = true;
    if (this.stamina > 0.28) this.exhausted = false;
    const running = !this.exhausted && (this.touchSprint || keys.has('ShiftLeft') || keys.has('ShiftRight'));
    const speed = WALK_SPEED * (running ? 1.65 : 1) * intent.strength;

    this.previousPosition.copy(this.position);
    const x = integrateVelocity(this.velocityX, intent.x * speed, 12, dt);
    const z = integrateVelocity(this.velocityZ, intent.z * speed, 12, dt);
    this.velocityX = x.value;
    this.velocityZ = z.value;
    moveOnStage(this.position, x.distance, z.distance, this.forest.colliders);
    const movedX = this.position.x - this.previousPosition.x;
    const movedZ = this.position.z - this.previousPosition.z;
    this.distanceSpeed = Math.hypot(movedX, movedZ) / dt;
    this.sprinting = running && intent.strength > 0.1 && this.distanceSpeed > 0.15;
    this.stamina = updateStamina(this.stamina, this.sprinting, this.distanceSpeed > 0.15, dt, 1.2);
    if (this.distanceSpeed > 0.15) this.heading = turnTo(this.heading, Math.atan2(movedX, movedZ), 14, dt);

    if (this.verticalSpeed || this.position.y > 0) {
      this.verticalSpeed -= 15 * dt;
      this.position.y = Math.max(0, this.position.y + this.verticalSpeed * dt);
      if (!this.position.y) this.verticalSpeed = 0;
    }
  }

  updateCamera(dt) {
    const camera = this.camera;
    const position = this.renderPosition;
    const height = this.actor.height;
    let desiredFov;
    if (this.mode === 'intro') {
      camera.position.set(position.x + 1.25, position.y + 1.02, position.z + 2.85);
      camera.lookAt(position.x, position.y + (camera.aspect < 1 ? 0.22 : 0.67), position.z - 0.65);
      if (camera.aspect > 1.12) {
        this.cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
        camera.position.addScaledVector(this.cameraRight, -0.45 * Math.min(camera.aspect, 2.4));
      }
      desiredFov = camera.aspect < 0.85
        ? Math.max(54, THREE.MathUtils.radToDeg(2 * Math.atan(0.24 / camera.aspect))) : 43;
    } else {
      const ease = damping(16, dt);
      this.cameraYaw = turnTo(this.cameraYaw, this.yaw, 19, dt);
      this.cameraPitch = THREE.MathUtils.lerp(this.cameraPitch, this.pitch, ease);
      this.cameraZoom = THREE.MathUtils.lerp(this.cameraZoom, this.zoom, ease);
      const pitch = this.cameraPitch;
      const range = this.cameraZoom;
      const distance = Math.cos(pitch) * range;
      this.cameraTarget.set(position.x, position.y + height * 0.80, position.z);
      this.cameraOffset.set(Math.sin(this.cameraYaw) * distance, Math.sin(pitch) * range,
        Math.cos(this.cameraYaw) * distance);
      const { heightAt, colliders } = this.forest;
      let reach = cameraReach(this.cameraTarget, this.cameraOffset, heightAt, colliders);
      if (reach * range < 1.25) {
        for (const yaw of [-0.62, 0.62, -1.15, 1.15]) {
          this.cameraAlternative.set(Math.sin(this.cameraYaw + yaw) * distance, this.cameraOffset.y,
            Math.cos(this.cameraYaw + yaw) * distance);
          const alternative = cameraReach(this.cameraTarget, this.cameraAlternative, heightAt, colliders);
          if (alternative > reach) {
            reach = alternative;
            this.cameraOffset.copy(this.cameraAlternative);
          }
          if (reach * range > 2) break;
        }
      }
      this.cameraClearance = Math.min(reach, THREE.MathUtils.lerp(this.cameraClearance, reach, ease));
      camera.position.copy(this.cameraTarget).addScaledVector(this.cameraOffset, this.cameraClearance);
      camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 0.2);
      camera.lookAt(this.cameraTarget);
      desiredFov = this.sprinting ? 55 : 51;
    }
    const fov = this.invalidated ? desiredFov : THREE.MathUtils.lerp(camera.fov, desiredFov, damping(12, dt));
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    this.forest.sky.position.copy(camera.position);
  }

  frame(time) {
    if (!this.actor) return;
    if (this.mode === 'paused' && !this.invalidated) {
      this.lastTime = null;
      return;
    }
    const interval = this.mode === 'intro' ? PREVIEW_INTERVAL : PLAY_INTERVAL;
    if (!this.invalidated && time + 0.6 < this.nextFrame) return;
    this.nextFrame = this.invalidated ? time + interval : Math.max(time - interval * 0.5, this.nextFrame) + interval;
    const dt = this.lastTime === null ? STEP : Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;

    if (this.mode === 'playing') {
      this.accumulator += dt;
      while (this.accumulator >= STEP) {
        this.updateMovement(STEP);
        this.accumulator -= STEP;
      }
      this.renderPosition.lerpVectors(this.previousPosition, this.position, this.accumulator / STEP);
      const stamina = Math.round(this.stamina * 100);
      if (stamina !== this.staminaPercent) {
        this.staminaPercent = stamina;
        this.callbacks.stamina(stamina);
      }
      this.adjustResolution(dt);
    }
    const jumpHeight = this.renderPosition.y;
    this.renderPosition.y += this.forest.heightAt(this.renderPosition.x, this.renderPosition.z);
    const heading = this.mode === 'intro' ? PREVIEW_HEADING : this.heading;
    this.actor.root.position.copy(this.renderPosition);
    this.actor.root.rotation.y = heading;
    if (this.mode !== 'paused') {
      const tilt = THREE.MathUtils.clamp(-this.verticalSpeed * 0.045, -0.22, 0.22);
      this.actor.root.rotation.x = THREE.MathUtils.lerp(this.actor.root.rotation.x, tilt, damping(16, dt));
      this.actor.animation.update(dt, this.distanceSpeed);
    }
    this.forest.shadow.position.copy(this.renderPosition);
    this.forest.shadow.forward.set(Math.sin(heading), Math.cos(heading));
    this.forest.shadow.lift = jumpHeight;
    this.updateCamera(dt);
    this.renderPosition.y = jumpHeight;
    this.forest.updateDetail(this.camera.position);
    this.invalidated = false;
    this.renderer.render(this.scene, this.camera);
  }

  adjustResolution(dt) {
    this.frameDuration += dt;
    if (++this.frameCount < 48) return;
    const ms = this.frameDuration * 1000 / this.frameCount;
    this.frameCount = 0;
    this.frameDuration = 0;
    const target = ms > 21 ? Math.max(0.58, this.quality - 0.12)
      : ms < 17.6 ? Math.min(1, this.quality + 0.06) : this.quality;
    if (target === this.quality) return;
    this.quality = target;
    this.resize();
  }
}
