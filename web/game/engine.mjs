<<<<<<< HEAD
import * as THREE from 'three';
import { loadDog } from './assets.mjs';
import { damping, integrateVelocity, moveOnStage, movementIntent, turnTo, updateStamina } from './physics.mjs';
import { createStage } from './world.mjs';

const STEP = 1 / 60;
const PREVIEW_INTERVAL = 1000 / 30;
const PREVIEW_HEADING = -0.58;
const LOOK_LIMIT = Math.PI / 2 - 0.06;
const MOVEMENT_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight',
]);
const WALK_SPEED = 3.9;

export class Pawtown {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.mode = 'intro';
    this.view = 'first';
    this.keys = new Set();
    this.stick = { x: 0, z: 0 };
    this.touchSprint = false;
    this.position = new THREE.Vector3();
    this.previousPosition = this.position.clone();
    this.renderPosition = this.position.clone();
    this.cameraTarget = new THREE.Vector3();
    this.cameraRight = new THREE.Vector3();
    this.lastTime = null;
    this.previewTime = -Infinity;
    this.invalidated = true;
    this.reset();

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.045, 110);
    this.camera.rotation.order = 'YXZ';
    this.stage = createStage(this.scene);
    this.scene.add(new THREE.HemisphereLight('#edf4ff', '#a3917c', 2.5));
    const key = new THREE.DirectionalLight('#fff0db', 3.5);
    key.position.set(4, 4, 6);
    const rim = new THREE.DirectionalLight('#ffd4aa', 2.5);
    rim.position.set(-3, 3, -6);
    this.scene.add(key, rim);

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
    this.actor = await loadDog(dog);
    this.actor.root.rotation.order = 'YXZ';
    this.scene.add(this.actor.root);
    this.invalidated = true;
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const touch = matchMedia('(pointer: coarse)').matches;
    const pixelBudget = touch ? 900000 : 2500000;
    this.renderer.setDrawingBufferSize(width, height, Math.min(
      window.devicePixelRatio || 1, touch ? 1 : 1.25, Math.sqrt(pixelBudget / (width * height)),
    ));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.invalidated = true;
  }

  reset() {
    this.position.set(0, 0, 0);
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
    this.pitch = -0.055;
    this.heading = Math.PI;
    this.accumulator = 0;
    this.staminaPercent = -1;
    this.invalidated = true;
  }

  play(captureMouse = true) {
    if (!this.actor || this.mode === 'playing') return;
    this.mode = 'playing';
    this.invalidated = true;
    this.callbacks.mode(this.mode);
    this.canvas.focus({ preventScroll: true });
    if (captureMouse) this.captureMouse();
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
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.callbacks.mode(this.mode);
  }

  clearInput() {
    this.keys.clear();
    this.stick.x = 0;
    this.stick.z = 0;
    this.touchSprint = false;
    this.drag = null;
  }

  async captureMouse() {
    if (!this.canvas.requestPointerLock || this.requestingLock || document.pointerLockElement === this.canvas) return;
    this.requestingLock = true;
    try {
      await this.canvas.requestPointerLock();
    } catch {
      // Drag remains available when the browser denies pointer capture.
    } finally {
      this.requestingLock = false;
    }
  }

  toggleView() {
    if (this.mode !== 'playing') return;
    this.view = this.view === 'first' ? 'third' : 'first';
    this.callbacks.view(this.view);
    this.invalidated = true;
  }

  look(dx, dy, sensitivity) {
    const yaw = this.yaw - dx * sensitivity;
    this.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sensitivity, -LOOK_LIMIT, LOOK_LIMIT);
  }

  jump() {
    if (this.mode !== 'playing' || this.position.y > 0 || this.verticalSpeed > 0) return;
    this.verticalSpeed = 4.6;
  }

  bark() {
    if (this.mode === 'playing' && this.view === 'third') this.actor.animation.play('Bark');
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
      if (event.code === 'KeyV') this.toggleView();
      if (event.code === 'KeyB') this.bark();
      if (event.code === 'KeyR') this.reset();
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.pause());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });

    let locked = false;
    document.addEventListener('pointerlockchange', () => {
      const previouslyLocked = locked;
      locked = document.pointerLockElement === this.canvas;
      if (locked && this.mode !== 'playing') document.exitPointerLock();
      if (locked) this.drag = null;
      if (previouslyLocked && !locked) this.pause();
      this.callbacks.capture(locked);
    });
    document.addEventListener('mousemove', event => {
      if (locked && this.mode === 'playing') this.look(event.movementX, event.movementY, 0.0022);
    });
    this.canvas.addEventListener('pointerdown', event => {
      if (this.mode !== 'playing' || locked || this.drag || event.button !== 0) return;
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', event => {
      if (this.mode !== 'playing' || this.drag?.id !== event.pointerId) return;
      this.look(event.clientX - this.drag.x, event.clientY - this.drag.y, 0.005);
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.canvas.addEventListener(type, event => {
        if (this.drag?.id === event.pointerId) this.drag = null;
      });
    }
  }

  updateMovement(dt) {
    const keys = this.keys;
    const intent = movementIntent({
      x: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + this.stick.x,
      z: Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) + this.stick.z,
    }, this.yaw);
    if (this.stamina < 0.015) this.exhausted = true;
    if (this.stamina > 0.28) this.exhausted = false;
    const running = !this.exhausted && (this.touchSprint || keys.has('ShiftLeft') || keys.has('ShiftRight'));
    const speed = WALK_SPEED * (running ? 1.65 : 1) * intent.strength;

    this.previousPosition.copy(this.position);
    const x = integrateVelocity(this.velocityX, intent.x * speed, 12, dt);
    const z = integrateVelocity(this.velocityZ, intent.z * speed, 12, dt);
    this.velocityX = x.value;
    this.velocityZ = z.value;
    moveOnStage(this.position, x.distance, z.distance);
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
    const height = this.actor?.height ?? 0.66;
    let desiredFov;
    if (this.mode === 'intro') {
      camera.position.set(1.28, 0.79, 2.4);
      camera.lookAt(0, camera.aspect < 1 ? 0.15 : 0.4, 0);
      if (camera.aspect > 1.12) {
        this.cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
        camera.position.addScaledVector(this.cameraRight, -0.33 * Math.min(camera.aspect, 2.4));
      }
      desiredFov = camera.aspect < 0.85
        ? Math.max(43, THREE.MathUtils.radToDeg(2 * Math.atan(0.15 / camera.aspect))) : 35;
    } else if (this.view === 'first') {
      camera.position.set(position.x, position.y + height * 0.87, position.z);
      camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      desiredFov = this.sprinting ? 74 : 68;
    } else {
      const pitch = THREE.MathUtils.clamp(0.23 - this.pitch, 0.06, 0.74);
      const range = 2.75;
      const distance = Math.cos(pitch) * range;
      this.cameraTarget.set(position.x, position.y + height * 0.58, position.z);
      camera.position.set(position.x + Math.sin(this.yaw) * distance,
        this.cameraTarget.y + Math.sin(pitch) * range, position.z + Math.cos(this.yaw) * distance);
      camera.lookAt(this.cameraTarget);
      desiredFov = 56;
    }
    const fov = this.invalidated ? desiredFov : THREE.MathUtils.lerp(camera.fov, desiredFov, damping(12, dt));
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    this.stage.sky.position.copy(camera.position);
  }

  frame(time) {
    if (this.mode === 'paused' && !this.invalidated) {
      this.lastTime = null;
      return;
    }
    if (this.mode === 'intro' && !this.invalidated && time - this.previewTime < PREVIEW_INTERVAL - 0.5) return;
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
    }
    if (this.mode === 'intro') this.previewTime = time;

    const heading = this.mode === 'intro' ? PREVIEW_HEADING : this.heading;
    if (this.actor) {
      this.actor.root.visible = this.mode === 'intro' || this.view === 'third';
      if (this.actor.root.visible) {
        this.actor.root.position.copy(this.renderPosition);
        this.actor.root.rotation.y = heading;
        if (this.mode !== 'paused') {
          const tilt = THREE.MathUtils.clamp(-this.verticalSpeed * 0.045, -0.22, 0.22);
          this.actor.root.rotation.x = THREE.MathUtils.lerp(this.actor.root.rotation.x, tilt, damping(16, dt));
          this.actor.animation.update(dt, this.distanceSpeed);
        }
      }
    }
    this.stage.shadowPosition.copy(this.renderPosition);
    this.stage.shadowForward.set(Math.sin(heading), Math.cos(heading));
    this.updateCamera(dt);
    this.invalidated = false;
    this.renderer.render(this.scene, this.camera);
  }
}
<<<<<<< HEAD
||||||| parent of 6218043 (ok)
=======
import * as THREE from 'three';
import { loadDog } from './assets.mjs';
import { damping, integrateVelocity, moveOnStage, movementIntent, turnTo, updateStamina } from './physics.mjs';
import { createStage } from './world.mjs';

const STEP = 1 / 60;
const PREVIEW_INTERVAL = 1000 / 30;
const PREVIEW_HEADING = -0.58;
const LOOK_LIMIT = Math.PI / 2 - 0.06;
const MOVEMENT_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight',
]);
const WALK_SPEED = 3.9;

export class Pawtown {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.mode = 'intro';
    this.view = 'first';
    this.keys = new Set();
    this.stick = { x: 0, z: 0 };
    this.touchSprint = false;
    this.position = new THREE.Vector3();
    this.previousPosition = this.position.clone();
    this.renderPosition = this.position.clone();
    this.cameraTarget = new THREE.Vector3();
    this.cameraRight = new THREE.Vector3();
    this.lastTime = null;
    this.previewTime = -Infinity;
    this.invalidated = true;
    this.reset();

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.045, 110);
    this.camera.rotation.order = 'YXZ';
    this.stage = createStage(this.scene);
    this.scene.add(new THREE.HemisphereLight('#edf4ff', '#a3917c', 2.5));
    const key = new THREE.DirectionalLight('#fff0db', 3.5);
    key.position.set(4, 4, 6);
    const rim = new THREE.DirectionalLight('#ffd4aa', 2.5);
    rim.position.set(-3, 3, -6);
    this.scene.add(key, rim);

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
    this.actor = await loadDog(dog);
    this.actor.root.rotation.order = 'YXZ';
    this.scene.add(this.actor.root);
    this.invalidated = true;
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const touch = matchMedia('(pointer: coarse)').matches;
    const pixelBudget = touch ? 900000 : 2500000;
    this.renderer.setDrawingBufferSize(width, height, Math.min(
      window.devicePixelRatio || 1, touch ? 1 : 1.25, Math.sqrt(pixelBudget / (width * height)),
    ));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.invalidated = true;
  }

  reset() {
    this.position.set(0, 0, 0);
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
    this.pitch = -0.055;
    this.heading = Math.PI;
    this.accumulator = 0;
    this.staminaPercent = -1;
    this.invalidated = true;
  }

  play(captureMouse = true) {
    if (!this.actor || this.mode === 'playing') return;
    this.mode = 'playing';
    this.invalidated = true;
    this.callbacks.mode(this.mode);
    this.canvas.focus({ preventScroll: true });
    if (captureMouse) this.captureMouse();
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
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.callbacks.mode(this.mode);
  }

  clearInput() {
    this.keys.clear();
    this.stick.x = 0;
    this.stick.z = 0;
    this.touchSprint = false;
    this.drag = null;
  }

  async captureMouse() {
    if (!this.canvas.requestPointerLock || this.requestingLock || document.pointerLockElement === this.canvas) return;
    this.requestingLock = true;
    try {
      await this.canvas.requestPointerLock();
    } catch {
      // Drag remains available when the browser denies pointer capture.
    } finally {
      this.requestingLock = false;
    }
  }

  toggleView() {
    if (this.mode !== 'playing') return;
    this.view = this.view === 'first' ? 'third' : 'first';
    this.callbacks.view(this.view);
    this.invalidated = true;
  }

  look(dx, dy, sensitivity) {
    const yaw = this.yaw - dx * sensitivity;
    this.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sensitivity, -LOOK_LIMIT, LOOK_LIMIT);
  }

  jump() {
    if (this.mode !== 'playing' || this.position.y > 0 || this.verticalSpeed > 0) return;
    this.verticalSpeed = 4.6;
  }

  bark() {
    if (this.mode === 'playing' && this.view === 'third') this.actor.animation.play('Bark');
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
      if (event.code === 'KeyV') this.toggleView();
      if (event.code === 'KeyB') this.bark();
      if (event.code === 'KeyR') this.reset();
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.pause());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });

    let locked = false;
    document.addEventListener('pointerlockchange', () => {
      const previouslyLocked = locked;
      locked = document.pointerLockElement === this.canvas;
      if (locked && this.mode !== 'playing') document.exitPointerLock();
      if (locked) this.drag = null;
      if (previouslyLocked && !locked) this.pause();
      this.callbacks.capture(locked);
    });
    document.addEventListener('mousemove', event => {
      if (locked && this.mode === 'playing') this.look(event.movementX, event.movementY, 0.0022);
    });
    this.canvas.addEventListener('pointerdown', event => {
      if (this.mode !== 'playing' || locked || this.drag || event.button !== 0) return;
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', event => {
      if (this.mode !== 'playing' || this.drag?.id !== event.pointerId) return;
      this.look(event.clientX - this.drag.x, event.clientY - this.drag.y, 0.005);
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.canvas.addEventListener(type, event => {
        if (this.drag?.id === event.pointerId) this.drag = null;
      });
    }
  }

  updateMovement(dt) {
    const keys = this.keys;
    const intent = movementIntent({
      x: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + this.stick.x,
      z: Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) + this.stick.z,
    }, this.yaw);
    if (this.stamina < 0.015) this.exhausted = true;
    if (this.stamina > 0.28) this.exhausted = false;
    const running = !this.exhausted && (this.touchSprint || keys.has('ShiftLeft') || keys.has('ShiftRight'));
    const speed = WALK_SPEED * (running ? 1.65 : 1) * intent.strength;

    this.previousPosition.copy(this.position);
    const x = integrateVelocity(this.velocityX, intent.x * speed, 12, dt);
    const z = integrateVelocity(this.velocityZ, intent.z * speed, 12, dt);
    this.velocityX = x.value;
    this.velocityZ = z.value;
    moveOnStage(this.position, x.distance, z.distance);
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
    const height = this.actor?.height ?? 0.66;
    let desiredFov;
    if (this.mode === 'intro') {
      camera.position.set(1.28, 0.79, 2.4);
      camera.lookAt(0, camera.aspect < 1 ? 0.15 : 0.4, 0);
      if (camera.aspect > 1.12) {
        this.cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
        camera.position.addScaledVector(this.cameraRight, -0.33 * Math.min(camera.aspect, 2.4));
      }
      desiredFov = camera.aspect < 0.85
        ? Math.max(43, THREE.MathUtils.radToDeg(2 * Math.atan(0.15 / camera.aspect))) : 35;
    } else if (this.view === 'first') {
      camera.position.set(position.x, position.y + height * 0.87, position.z);
      camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      desiredFov = this.sprinting ? 74 : 68;
    } else {
      const pitch = THREE.MathUtils.clamp(0.23 - this.pitch, 0.06, 0.74);
      const range = 2.75;
      const distance = Math.cos(pitch) * range;
      this.cameraTarget.set(position.x, position.y + height * 0.58, position.z);
      camera.position.set(position.x + Math.sin(this.yaw) * distance,
        this.cameraTarget.y + Math.sin(pitch) * range, position.z + Math.cos(this.yaw) * distance);
      camera.lookAt(this.cameraTarget);
      desiredFov = 56;
    }
    const fov = this.invalidated ? desiredFov : THREE.MathUtils.lerp(camera.fov, desiredFov, damping(12, dt));
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    this.stage.sky.position.copy(camera.position);
  }

  frame(time) {
    if (this.mode === 'paused' && !this.invalidated) {
      this.lastTime = null;
      return;
    }
    if (this.mode === 'intro' && !this.invalidated && time - this.previewTime < PREVIEW_INTERVAL - 0.5) return;
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
    }
    if (this.mode === 'intro') this.previewTime = time;

    const heading = this.mode === 'intro' ? PREVIEW_HEADING : this.heading;
    if (this.actor) {
      this.actor.root.visible = this.mode === 'intro' || this.view === 'third';
      if (this.actor.root.visible) {
        this.actor.root.position.copy(this.renderPosition);
        this.actor.root.rotation.y = heading;
        if (this.mode !== 'paused') {
          const tilt = THREE.MathUtils.clamp(-this.verticalSpeed * 0.045, -0.22, 0.22);
          this.actor.root.rotation.x = THREE.MathUtils.lerp(this.actor.root.rotation.x, tilt, damping(16, dt));
          this.actor.animation.update(dt, this.distanceSpeed);
        }
      }
    }
    this.stage.shadowPosition.copy(this.renderPosition);
    this.stage.shadowForward.set(Math.sin(heading), Math.cos(heading));
    this.updateCamera(dt);
    this.invalidated = false;
    this.renderer.render(this.scene, this.camera);
  }
}
>>>>>>> 6218043 (ok)
||||||| parent of ab5136b (still fix)
=======
||||||| parent of 6218043 (ok)
=======
import * as THREE from 'three';
import { DogAssets } from './assets.mjs';
import { createWorld } from './world.mjs';
import { createResidents } from './residents.mjs';
import { damping, integrateVelocity, movementIntent, moveWithCollisions,
  nearestResident, turnTo, updateStamina, blocked } from './physics.mjs';
import { createThreat, lineOfSight, refugeAt, segmentHitsSphere } from './threats.mjs';
import { createRain } from './weather.mjs';

export class Pawtown {
  constructor(canvas, callbacks = {}) {
    this.callbacks = callbacks;
    this.canvas = canvas;
    this.mode = 'choose'; this.elapsed = 0; this.lastTime = null;
    this.position = new THREE.Vector3(0, 0, 7);
    this.velocity = { x: 0, z: 0 }; this.heading = 0; this.verticalSpeed = 0;
    this.keys = new Set(); this.stick = { x: 0, z: 0 }; this.touchSprint = false;
    this.stamina = 1; this.exhausted = false; this.friends = new Set(); this.treats = 0;
    this.cameraYaw = 0; this.cameraPitch = 0.35; this.cameraDistance = 7;
    this.gestureUntil = 0; this.talkUntil = 0; this.selectionToken = 0;
    this.assets = new DogAssets(); this.ambient = [];
    this.health = 3; this.invulnerableUntil = 0; this.staggerUntil = 0; this.noiseUntil = 0;
    this.knockback = { x: 0, z: 0 }; this.movementSpeed = 0; this.sprinting = false;
    this.escapes = 0; this.completed = false; this.accumulator = 0;
    this.previousPosition = this.position.clone(); this.renderPosition = this.position.clone();
    this.previousHeading = this.heading; this.turnRate = 0;
    this.lastHUDTime = -Infinity;
    this.lastRest = -Infinity;
    this._cameraTarget = new THREE.Vector3(); this._cameraDesired = new THREE.Vector3();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#111b27');
    this.scene.fog = new THREE.Fog('#182430', 18, 76);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.08, 180);
    this.camera.position.set(3.4, 2.7, 13);
    this.scene.add(new THREE.HemisphereLight('#9db7d2', '#1d252d', 0.95));
    this.sun = new THREE.DirectionalLight('#abc7e1', 1.35);
    this.sun.position.set(-16, 25, 12); this.sun.castShadow = true;
    const shadowSize = matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(this.sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 80 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.world = createWorld(this.scene);
    this.residentSystem = createResidents(this.scene, this.world.colliders);
    this.hostiles = this.residentSystem.residents.filter(resident => resident.hostile);
    this.residentBodies = this.residentSystem.residents.map(resident => ({ type: 'circle', x: resident.x, z: resident.z, radius: 0.24 }));
    this.collisionBodies = [...this.world.colliders, ...this.residentBodies];
    this.rain = createRain(this.scene, matchMedia('(pointer: coarse)').matches ? 260 : 420);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), new THREE.MeshBasicMaterial({ color: '#a1b7c8', fog: false }));
    moon.position.set(-33, 39, -55); this.scene.add(moon);
    const projectileMaterial = new THREE.MeshStandardMaterial({ color: '#8a939a', roughness: 1 });
    const projectileGeometry = new THREE.IcosahedronGeometry(0.1, 0);
    this.projectiles = Array.from({ length: 8 }, () => {
      const mesh = new THREE.Mesh(projectileGeometry, projectileMaterial); mesh.visible = false; this.scene.add(mesh);
      return { mesh, active: false, age: 0, duration: 0.7, from: new THREE.Vector3(), target: new THREE.Vector3(), previous: new THREE.Vector3() };
    });
    this.player = new THREE.Group(); this.scene.add(this.player);
    this.player.position.copy(this.position);
    this.createTreats(); this.bindInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.setMode('paused');
      callbacks.error?.('Thiết bị tạm ngừng hiển thị 3D. Bạn hãy tải lại để tiếp tục.');
    });
    this.renderer.setAnimationLoop(time => this.frame(time));
  }

  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    this.camera.aspect = width / Math.max(1, height); this.camera.updateProjectionMatrix();
  }

  async select(dog) {
    const token = ++this.selectionToken;
    this.callbacks.loading?.(true);
    try {
      const actor = await this.assets.acquire(dog);
      if (token !== this.selectionToken) { actor.release(); return false; }
      this.actor?.release(); this.actor = actor; this.dog = dog;
      this.cameraDistance = THREE.MathUtils.clamp(actor.height * 7, 4.5, 7);
      this.player.add(actor.root);
      this.gestureUntil = 0; this.actor.play('Idle');
      this.callbacks.loading?.(false);
      return true;
    } catch (error) {
      if (token === this.selectionToken) {
        this.callbacks.loading?.(false);
        this.callbacks.error?.('Chưa tải được bạn chó này. Hãy thử lại hoặc chọn một bạn khác.');
      }
      console.error(error); return false;
    }
  }

  async addAmbientDogs(dogs) {
    for (const [index, id] of ['labrador', 'corgi'].entries()) {
      const dog = dogs.find(item => item.id === id);
      if (!dog) continue;
      try {
        const actor = await this.assets.acquire(dog);
        actor.root.scale.multiplyScalar(0.8);
        actor.height *= 0.8; actor.animation.height *= 0.8;
        actor.root.traverse(node => { if (node.isMesh) node.castShadow = false; });
        this.scene.add(actor.root); actor.play('Walk');
        this.ambient.push({ actor, index, x: index ? -11 : 10, z: index ? 11 : 3, heading: 0, fearUntil: 0 });
      } catch (error) { console.warn('Ambient dog unavailable', error); }
    }
  }

  createTreats() {
    const points = [[2, 12], [-3, 11], [-9, 5], [9, 4], [-9, -10], [11, -13],
      [-12, 13], [8, 18], [-3, -15], [3, -15], [-14, -13], [14, 0]];
    const material = new THREE.MeshStandardMaterial({ color: '#a99470', emissive: '#3f3523', emissiveIntensity: 0.45, roughness: 0.9 });
    const joint = new THREE.SphereGeometry(0.09, 6, 5);
    this.pickups = points.map(([x, z], index) => {
      const root = new THREE.Group(); root.position.set(x, 0.5, z); this.scene.add(root);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 6), material);
      bar.rotation.z = Math.PI / 2; root.add(bar);
      for (const side of [-1, 1]) for (const end of [-1, 1]) {
        const ball = new THREE.Mesh(joint, material); ball.position.set(side * 0.17, 0, end * 0.065); root.add(ball);
      }
      return { root, x, z, index, collected: false };
    });
  }

  resetRun() {
    this.health = 3; this.stamina = 1; this.exhausted = false; this.treats = 0;
    this.completed = false; this.escapes = 0; this.noiseUntil = 0;
    this.invulnerableUntil = this.elapsed + 1.5; this.staggerUntil = 0;
    this.knockback.x = 0; this.knockback.z = 0; this.movementSpeed = 0;
    this.position.set(0, 0, 7); this.previousPosition.copy(this.position); this.renderPosition.copy(this.position);
    this.verticalSpeed = 0; this.heading = 0; this.previousHeading = 0;
    for (const pickup of this.pickups) { pickup.collected = false; pickup.root.visible = true; }
    for (const projectile of this.projectiles) { projectile.active = false; projectile.mesh.visible = false; }
    for (const resident of this.residentSystem.residents) {
      Object.assign(resident.threat, createThreat()); resident.aim.visible = false; resident.marker.visible = false;
    }
  }

  setMode(mode) {
    if (mode === 'playing' && !this.actor) return;
    const previousMode = this.mode;
    this.mode = mode; this.keys.clear(); this.stick = { x: 0, z: 0 }; this.touchSprint = false;
    this.velocity.x = 0; this.velocity.z = 0; this.accumulator = 0;
    if (mode === 'choose') this.resetRun();
    if (mode === 'playing' && previousMode === 'choose') {
      this.heading = this.cameraYaw + Math.PI; this.previousHeading = this.heading;
    }
    this.player.position.copy(this.position); this.player.rotation.y = this.heading;
    this.callbacks.mode?.(mode);
  }

  restart() { this.resetRun(); this.setMode('playing'); }

  jump() {
    if (this.mode === 'playing' && this.position.y < 0.01 && this.elapsed > this.staggerUntil) this.verticalSpeed = 5.0;
  }
  bark() {
    if (this.mode !== 'playing' || !this.actor || this.gestureUntil > this.elapsed) return;
    this.actor.play('Bark'); this.gestureUntil = this.elapsed + 1;
    this.noiseUntil = this.elapsed + 1.2;
    this.callbacks.toast?.('Tiếng sủa có thể khiến người gác chú ý.');
  }
  interact() {
    if (this.mode !== 'playing') return;
    if (refugeAt(this.position)) {
      if (this.elapsed - this.lastRest < 8) { this.callbacks.toast?.(`Chờ ${Math.ceil(8 - (this.elapsed - this.lastRest))} giây để nghỉ lại. Bạn đang ở nơi an toàn.`); return; }
      this.health = 3; this.stamina = 1; this.lastRest = this.elapsed;
      this.actor.play('Lie_Idle');
      this.callbacks.toast?.('Đã nghỉ dưới mái hiên. Thể lực và năng lượng được hồi phục.');
      return;
    }
    const resident = nearestResident(this.position, this.residentSystem.residents.filter(person => !person.hostile));
    if (!resident) { this.callbacks.toast?.('Tìm người thân thiện hoặc trở về vùng đèn xanh để nghỉ.'); return; }
    this.friends.add(resident.id); this.residentSystem.greet(resident, this.position);
    this.talkUntil = this.elapsed + 6;
    this.callbacks.dialogue?.(resident.name, resident.greeting);
  }

  damage(sourceX, sourceZ) {
    if (this.mode !== 'playing' || this.elapsed < this.invulnerableUntil || refugeAt(this.position)) return false;
    this.health = Math.max(0, this.health - 1);
    this.invulnerableUntil = this.elapsed + 1.8; this.staggerUntil = this.elapsed + 0.45;
    const dx = this.position.x - sourceX, dz = this.position.z - sourceZ;
    const distance = Math.max(0.1, Math.hypot(dx, dz));
    this.knockback.x = dx / distance * 3.2; this.knockback.z = dz / distance * 3.2;
    this.callbacks.damage?.(this.health);
    if (this.health === 0) this.setMode('caught');
    else this.callbacks.toast?.('Bị trúng đòn — chạy về vùng đèn xanh để hồi phục!');
    return true;
  }

  launchAttack(event) {
    if (this.mode !== 'playing') return;
    if (event.kind === 'shove') {
      if (Math.hypot(this.position.x - event.x, this.position.z - event.z) < 1.65 && this.position.y < 0.65)
        this.damage(event.x, event.z);
      return;
    }
    const projectile = this.projectiles.find(item => !item.active);
    if (!projectile) return;
    projectile.active = true; projectile.age = 0;
    projectile.from.set(event.x, 1.4, event.z);
    projectile.target.set(event.aimX, Math.min(0.45, (this.actor?.height || 0.7) * 0.45), event.aimZ);
    projectile.duration = Math.max(0.5, Math.hypot(event.aimX - event.x, event.aimZ - event.z) / 9);
    projectile.mesh.position.copy(projectile.from); projectile.previous.copy(projectile.from); projectile.mesh.visible = true;
  }

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) {
      if (!projectile.active) continue;
      projectile.age += dt;
      const t = Math.min(1, projectile.age / projectile.duration);
      projectile.previous.copy(projectile.mesh.position);
      projectile.mesh.position.lerpVectors(projectile.from, projectile.target, t);
      projectile.mesh.position.y += Math.sin(t * Math.PI) * 1.25;
      projectile.mesh.rotation.x += dt * 7; projectile.mesh.rotation.z += dt * 5;
      const center = { x: this.position.x, y: this.position.y + this.actor.height * 0.45, z: this.position.z };
      const hit = segmentHitsSphere(projectile.previous, projectile.mesh.position, center, Math.max(0.24, this.actor.height * 0.34));
      const obstacle = projectile.mesh.position.y < 1.6 && blocked(projectile.mesh.position.x, projectile.mesh.position.z, 0.05, this.world.colliders);
      if (hit) this.damage(projectile.from.x, projectile.from.z);
      if (hit || obstacle || t === 1) { projectile.active = false; projectile.mesh.visible = false; }
    }
  }

  bindInput() {
    const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
    window.addEventListener('keydown', event => {
      if (event.code === 'Escape') {
        if (this.mode === 'playing') this.setMode('paused');
        else if (this.mode === 'paused') this.setMode('playing');
        return;
      }
      if (this.mode !== 'playing') return;
      if (movementKeys.has(event.code) || event.code === 'Space') event.preventDefault();
      this.keys.add(event.code);
      if (event.repeat) return;
      if (event.code === 'Space') this.jump();
      if (event.code === 'KeyB') this.bark();
      if (event.code === 'KeyE') this.interact();
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => { if (this.mode === 'playing') this.setMode('paused'); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'playing') this.setMode('paused');
    });
    let drag = null;
    this.canvas.addEventListener('contextmenu', event => event.preventDefault());
    this.canvas.addEventListener('pointerdown', event => {
      if (this.mode !== 'playing') return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      this.cameraYaw -= (event.clientX - drag.x) * 0.006;
      this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + (event.clientY - drag.y) * 0.004, 0.12, 0.9);
      drag.x = event.clientX; drag.y = event.clientY;
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.canvas.addEventListener(type, () => { drag = null; });
    this.canvas.addEventListener('wheel', event => {
      if (this.mode !== 'playing') return;
      event.preventDefault(); this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + event.deltaY * 0.008, 4, 12);
    }, { passive: false });
  }

  updatePlayer(dt) {
    const key = (...codes) => codes.some(code => this.keys.has(code)) ? 1 : 0;
    const input = { x: key('KeyD', 'ArrowRight') - key('KeyA', 'ArrowLeft') + this.stick.x,
      z: key('KeyW', 'ArrowUp') - key('KeyS', 'ArrowDown') + this.stick.z };
    const intent = movementIntent(input, this.cameraYaw);
    if (this.stamina < 0.015) this.exhausted = true;
    if (this.stamina > 0.28) this.exhausted = false;
    const sprint = (key('ShiftLeft', 'ShiftRight') || this.touchSprint) && !this.exhausted;
    this.sprinting = Boolean(sprint && intent.strength > 0.1);
    const speed = this.dog.speed * (sprint ? 1.65 : 1) * intent.strength * (this.elapsed < this.staggerUntil ? 0.35 : 1);
    const x = integrateVelocity(this.velocity.x, intent.x * speed, 10, dt);
    const z = integrateVelocity(this.velocity.z, intent.z * speed, 10, dt);
    this.velocity.x = x.value; this.velocity.z = z.value;
    for (const [index, resident] of this.residentSystem.residents.entries()) {
      this.residentBodies[index].x = resident.x; this.residentBodies[index].z = resident.z;
    }
    const next = moveWithCollisions(this.position, {
      x: x.distance + this.knockback.x * dt, z: z.distance + this.knockback.z * dt,
    }, this.collisionBodies);
    this.knockback.x *= Math.exp(-7 * dt); this.knockback.z *= Math.exp(-7 * dt);
    const actualSpeed = Math.hypot(next.x - this.position.x, next.z - this.position.z) / Math.max(dt, 0.001);
    this.position.x = next.x; this.position.z = next.z;
    this.previousHeading = this.heading;
    if (Math.hypot(this.velocity.x, this.velocity.z) > 0.1) this.heading = turnTo(this.heading, Math.atan2(this.velocity.x, this.velocity.z), 12, dt);
    this.turnRate = Math.atan2(Math.sin(this.heading - this.previousHeading), Math.cos(this.heading - this.previousHeading)) / dt;
    this.verticalSpeed -= 14 * dt;
    this.position.y = Math.max(0, this.position.y + this.verticalSpeed * dt);
    if (!this.position.y) this.verticalSpeed = 0;
    this.stamina = updateStamina(this.stamina, Boolean(sprint), actualSpeed > 0.15, dt, this.dog.stamina);
    this.movementSpeed += (actualSpeed - this.movementSpeed) * damping(10, dt);
    for (const pickup of this.pickups) {
      if (!pickup.collected && Math.hypot(pickup.x - this.position.x, pickup.z - this.position.z) < 0.75) {
        pickup.collected = true; pickup.root.visible = false; this.treats++;
        this.callbacks.toast?.(`Đã nhặt thức ăn · ${Math.min(3, this.treats)}/3`);
        this.stamina = Math.min(1, this.stamina + 0.13);
      }
    }
  }

  updateCamera(dt) {
    const desired = this._cameraDesired;
    const target = this._cameraTarget;
    if (this.mode === 'choose') {
      const height = this.actor?.height || 0.72;
      const framing = Math.sqrt(height / 0.72);
      desired.set(1.7 * framing, 0.95 + height * 0.7, 7 + 3.5 * framing);
      target.set(-0.1, height * 0.48, 6.8);
    } else {
      desired.set(this.renderPosition.x + Math.sin(this.cameraYaw) * this.cameraDistance,
        1.05 + this.cameraDistance * Math.sin(this.cameraPitch),
        this.renderPosition.z + Math.cos(this.cameraYaw) * this.cameraDistance);
      target.set(this.renderPosition.x, 0.75 + (this.actor?.height || 0.7) * 0.3, this.renderPosition.z);
      const dx = desired.x - target.x, dz = desired.z - target.z;
      const distance = Math.hypot(dx, dz);
      for (let step = 0.8; step < distance; step += 0.25) {
        const t = step / distance;
        if (blocked(target.x + dx * t, target.z + dz * t, 0.15, this.world.colliders)) {
          const fraction = Math.max(0.17, (step - 0.3) / distance);
          desired.x = target.x + dx * fraction; desired.z = target.z + dz * fraction;
          desired.y = target.y + (desired.y - target.y) * Math.max(0.5, fraction); break;
        }
      }
    }
    this.camera.position.lerp(desired, damping(6, dt));
    this.camera.lookAt(target);
    const desiredFov = this.sprinting && this.mode === 'playing' ? 54 : 50;
    this.camera.fov += (desiredFov - this.camera.fov) * damping(5, dt); this.camera.updateProjectionMatrix();
    this.sun.position.set(this.position.x - 16, 25, this.position.z + 12);
    this.sun.target.position.set(this.position.x, 0, this.position.z);
    this.sun.target.updateMatrixWorld();
  }

  simulate(dt) {
    this.elapsed += dt;
    this.previousPosition.copy(this.position);
    if (this.mode === 'playing' && this.actor) this.updatePlayer(dt);
    const events = this.residentSystem.tick(dt, this.elapsed, this.position, {
      active: this.mode === 'playing', safe: Boolean(refugeAt(this.position)),
      sprinting: this.sprinting, noise: this.elapsed < this.noiseUntil,
    });
    for (const event of events) {
      if (event.type === 'attack') this.launchAttack(event);
      if (event.type === 'escaped') this.escapes++;
    }
    if (this.mode === 'playing' && this.actor) {
      this.updateProjectiles(dt);
      if (this.treats >= 3 && refugeAt(this.position) && !this.completed) {
        this.completed = true; this.callbacks.toast?.('Đã mang đủ thức ăn về nơi trú. Bạn đã vượt qua đêm này.');
      }
    }
  }

  frame(time) {
    const dt = this.lastTime === null ? 1 / 60 : Math.min(0.15, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    const active = this.mode === 'playing' || this.mode === 'choose';
    const step = 1 / 60;
    if (active) {
      this.accumulator = Math.min(0.15, this.accumulator + dt);
      while (this.accumulator >= step) {
        this.simulate(step); this.accumulator -= step;
        if (!['playing', 'choose'].includes(this.mode)) { this.accumulator = 0; break; }
      }
    }
    if (this.mode === 'playing') this.renderPosition.lerpVectors(this.previousPosition, this.position, this.accumulator / step);
    else this.renderPosition.copy(this.position);
    this.player.position.copy(this.renderPosition); this.player.rotation.y = this.heading;
    if (active) {
      this.world.tick(this.elapsed, dt); this.rain.update(this.elapsed, this.position);
      this.actor?.animate(dt, this.mode === 'playing' ? this.movementSpeed : 0);
      if (this.actor) {
        const hurt = this.elapsed < this.staggerUntil;
        this.actor.root.rotation.z += ((hurt ? Math.sin(this.elapsed * 35) * 0.09 : -Math.max(-2, Math.min(2, this.turnRate)) * 0.025) - this.actor.root.rotation.z) * damping(12, dt);
      }
      for (const dog of this.ambient) {
        const t = this.elapsed * 0.13 + dog.index * 1.7;
        const center = dog.index ? -11 : 10;
        let targetX = center + Math.sin(t) * 1.8, targetZ = (dog.index ? 9 : 1) + Math.cos(t) * 2;
        let nearest = null, nearestDistance = Infinity;
        for (const person of this.hostiles) {
          const distance = Math.hypot(person.x - dog.x, person.z - dog.z);
          if (distance < nearestDistance) { nearestDistance = distance; nearest = person; }
        }
        if (this.mode === 'playing' && nearestDistance < (nearest?.threat.state === 'patrol' ? 3.4 : 7)) dog.fearUntil = this.elapsed + 1.5;
        const fleeing = this.mode === 'playing' && dog.fearUntil > this.elapsed;
        if (fleeing && nearest) { targetX = dog.x + (dog.x - nearest.x); targetZ = dog.z + (dog.z - nearest.z); }
        const dx = targetX - dog.x, dz = targetZ - dog.z, distance = Math.hypot(dx, dz);
        const speed = fleeing ? 2.7 : Math.min(0.85, distance * 2);
        const next = moveWithCollisions(dog, { x: dx / Math.max(0.01, distance) * speed * dt,
          z: dz / Math.max(0.01, distance) * speed * dt }, this.world.colliders, 0.22);
        const actualSpeed = Math.hypot(next.x - dog.x, next.z - dog.z) / Math.max(dt, 0.001);
        if (actualSpeed > 0.02) dog.heading = turnTo(dog.heading, Math.atan2(next.x - dog.x, next.z - dog.z), 8, dt);
        dog.x = next.x; dog.z = next.z;
        dog.actor.root.position.set(dog.x, 0, dog.z); dog.actor.root.rotation.y = dog.heading;
        dog.actor.animate(dt, actualSpeed);
      }
      for (const pickup of this.pickups) if (!pickup.collected) {
        pickup.root.rotation.y = this.elapsed * 0.35;
        pickup.root.position.y = 0.35 + Math.sin(this.elapsed * 1.5 + pickup.index) * 0.025;
      }
    }
    this.updateCamera(dt); this.renderer.render(this.scene, this.camera);
    if (time - this.lastHUDTime >= 80) {
      this.lastHUDTime = time; this.callbacks.frame?.(this.snapshot(), this.world);
    }
  }

  snapshot() {
    const refuge = refugeAt(this.position);
    const near = this.mode === 'playing' ? nearestResident(this.position, this.residentSystem.residents.filter(person => !person.hostile)) : null;
    const threatening = this.residentSystem.residents.filter(person => person.hostile && ['chase', 'windup', 'recover'].includes(person.threat.state));
    const alert = Math.max(0, ...this.residentSystem.residents.filter(person => person.hostile).map(person => person.threat.awareness));
    const winding = threatening.some(person => person.threat.state === 'windup');
    return { mode: this.mode, dog: this.dog?.id, x: this.position.x, y: this.position.y, z: this.position.z,
      heading: this.heading, stamina: this.stamina, treats: this.treats, friends: this.friends.size,
      health: this.health, alert, danger: !refuge && threatening.length > 0, windup: winding,
      safe: Boolean(refuge), refuge: refuge?.name || '', escapes: this.escapes, completed: this.completed,
      activeProjectiles: this.projectiles.filter(item => item.active).length,
      weights: this.actor?.animation.weights || [1, 0, 0, 0],
      clip: this.actor?.clip(), ready: Boolean(this.actor), near: near?.name || '',
      talking: this.talkUntil > this.elapsed, elapsed: this.elapsed,
      residents: this.residentSystem.residents.map(person => ({ name: person.name, x: person.x, z: person.z,
        greeted: this.friends.has(person.id), hostile: Boolean(person.hostile), state: person.threat.state,
        awareness: person.threat.awareness, heading: person.heading })) };
  }
}
>>>>>>> 6218043 (ok)
>>>>>>> ab5136b (still fix)
