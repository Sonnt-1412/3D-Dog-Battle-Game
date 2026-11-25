<<<<<<< HEAD
import { Pawtown } from './game/engine.mjs';

const get = id => document.getElementById(id);
const world = get('world');
const intro = get('intro');
const start = get('start');
const hud = get('hud');
const pauseScreen = get('pause-screen');
const resume = get('resume');
const view = get('view');
const viewLabel = get('view-label');
const lookHint = get('look-hint');
const stamina = get('stamina');
const staminaFill = get('stamina-fill');
const joystick = get('joystick');
const knob = get('stick-knob');
const sprint = get('sprint');
let game;
let stickPointer = null;
let sprintPointer = null;

function showError(message) {
  start.disabled = true;
  get('fatal-message').textContent = message;
  pauseScreen.hidden = true;
  hud.hidden = true;
  get('fatal').hidden = false;
  get('reload').focus();
}

function modeChanged(mode) {
  document.body.dataset.mode = mode;
  intro.hidden = mode !== 'intro';
  hud.hidden = mode !== 'playing';
  pauseScreen.hidden = mode !== 'paused';
  stickPointer = null;
  sprintPointer = null;
  knob.style.transform = '';
  sprint.classList.remove('active');
  if (mode === 'paused') resume.focus();
}

function changeView(camera) {
  document.body.dataset.view = camera;
  const first = camera === 'first';
  viewLabel.textContent = first ? 'Góc nhìn thứ nhất' : 'Góc nhìn thứ ba';
  view.setAttribute('aria-label', first ? 'Chuyển sang góc nhìn thứ ba' : 'Chuyển sang góc nhìn thứ nhất');
}

function play(event) {
  game?.play(event.pointerType !== 'touch' && !matchMedia('(pointer: coarse)').matches);
}

start.addEventListener('click', play);
resume.addEventListener('click', play);
get('reset').addEventListener('click', event => { game.reset(); play(event); });
get('pause').addEventListener('click', () => game.pause());
get('view').addEventListener('click', () => { game.toggleView(); world.focus({ preventScroll: true }); });
get('bark').addEventListener('click', () => game.bark());
get('jump').addEventListener('pointerdown', event => {
  if (event.button === 0) game.jump();
});
get('jump').addEventListener('click', event => {
  if (event.detail === 0) game.jump();
});
get('reload').addEventListener('click', () => location.reload());

function moveStick(event) {
  if (stickPointer === null || event.pointerId !== stickPointer.id) return;
  const { x, y, range } = stickPointer;
  const dx = event.clientX - x;
  const dy = event.clientY - y;
  const divisor = Math.max(range, Math.hypot(dx, dy));
  game.stick.x = dx / divisor;
  game.stick.z = -dy / divisor;
  knob.style.transform = `translate(${dx / divisor * range}px, ${dy / divisor * range}px)`;
}

joystick.addEventListener('pointerdown', event => {
  if (event.button !== 0 || stickPointer || game.mode !== 'playing') return;
  const { left, top, width, height } = joystick.getBoundingClientRect();
  stickPointer = { id: event.pointerId, x: left + width / 2, y: top + height / 2, range: width * 0.31 };
  joystick.setPointerCapture(event.pointerId);
  moveStick(event);
});
joystick.addEventListener('pointermove', moveStick);
sprint.addEventListener('pointerdown', event => {
  if (event.button !== 0 || sprintPointer !== null || game.mode !== 'playing') return;
  sprintPointer = event.pointerId;
  sprint.setPointerCapture(event.pointerId);
  sprint.classList.add('active');
  game.touchSprint = true;
});

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  joystick.addEventListener(type, event => {
    if (event.pointerId !== stickPointer?.id) return;
    stickPointer = null;
    game.stick.x = 0;
    game.stick.z = 0;
    knob.style.transform = '';
  });
  sprint.addEventListener(type, event => {
    if (event.pointerId !== sprintPointer) return;
    sprintPointer = null;
    game.touchSprint = false;
    sprint.classList.remove('active');
  });
}
<<<<<<< HEAD
||||||| parent of 6218043 (ok)
=======
import { Pawtown } from './game/engine.mjs';
import { ROSTER, initialDog, portrait, recall, remember } from './roster.mjs';

const $ = id => document.getElementById(id);
let game, dogs = [], selected, storage, toastTimer, hurtTimer;
try { storage = window.localStorage; } catch { /* Selection works without storage. */ }

function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200);
}

function modeChanged(mode) {
  document.body.dataset.mode = mode;
  $('choose-title').hidden = mode !== 'choose'; $('picker').hidden = mode !== 'choose';
  $('hud').hidden = mode === 'choose'; $('pause-screen').hidden = !['paused', 'caught'].includes(mode);
  $('joystick').classList.remove('active'); $('stick-knob').style.transform = '';
  $('pause-title').textContent = mode === 'caught' ? 'Bạn bị dồn vào góc' : 'Ẩn trong bóng tối';
  $('pause-description').textContent = mode === 'caught'
    ? 'Thử lại từ mái hiên. Né vòng đỏ trước khi họ ném và giữ đủ sức để chạy.'
    : 'Quan sát hướng tuần tra trước khi bước tiếp.';
  $('resume').innerHTML = (mode === 'caught' ? 'Về nơi trú' : 'Tiếp tục') + '<span>↗</span>';
  if (['paused', 'caught'].includes(mode)) $('resume').focus();
}

function chooseDog(dog) {
  selected = dog;
  remember(storage, dog.id);
  const url = new URL(location.href); url.searchParams.set('dog', dog.id); history.replaceState(null, '', url);
  $('selected-name').textContent = dog.name;
  $('selected-tag').textContent = dog.tag;
  $('selected-description').textContent = dog.description;
  $('player-name').textContent = dog.name;
  $('player-portrait').innerHTML = portrait(dog);
  $('model-error').hidden = true;
  for (const button of $('roster').children) button.setAttribute('aria-pressed', String(button.dataset.id === dog.id));
  game.select(dog);
}

function drawMap(state, world) {
  const canvas = $('minimap'), context = canvas.getContext('2d');
  const size = canvas.width, center = size / 2, scale = size / 98;
  const x = value => center + value * scale, z = value => center + value * scale;
  context.clearRect(0, 0, size, size);
  context.save(); context.beginPath(); context.arc(center, center, center - 4, 0, Math.PI * 2); context.clip();
  context.fillStyle = '#202c35'; context.fillRect(0, 0, size, size);
  context.fillStyle = '#414e57'; context.fillRect(x(-6), 0, 12 * scale, size); context.fillRect(0, z(-4), size, 8 * scale);
  context.beginPath(); context.arc(x(0), z(-3), 11 * scale, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#25414d'; context.beginPath(); context.ellipse(x(-26), z(5), 9 * scale, 12 * scale, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#345361'; context.beginPath(); context.arc(x(0), z(-4), 3.4 * scale, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#59636b';
  for (const house of world.buildingFootprints) context.fillRect(x(house.x - house.width / 2), z(house.z - house.depth / 2), house.width * scale, house.depth * scale);
  for (const resident of state.residents) {
    if (resident.hostile && resident.awareness > 0.15) {
      context.fillStyle = resident.state === 'windup' ? '#d37b5550' : '#ba6b5530';
      const angle = Math.PI / 2 - resident.heading;
      context.beginPath(); context.moveTo(x(resident.x), z(resident.z));
      context.arc(x(resident.x), z(resident.z), 8 * scale, angle - 1.05, angle + 1.05); context.closePath(); context.fill();
    }
    context.fillStyle = resident.hostile ? '#c8836c' : '#9bacb5';
    context.beginPath(); context.arc(x(resident.x), z(resident.z), resident.hostile ? 3.5 : 2.7, 0, Math.PI * 2); context.fill();
  }
  for (const refuge of world.refuges) {
    context.strokeStyle = '#86b4ae'; context.lineWidth = 2;
    context.beginPath(); context.arc(x(refuge.x), z(refuge.z), refuge.radius * scale, 0, Math.PI * 2); context.stroke();
  }
  context.translate(x(state.x), z(state.z)); context.rotate(Math.PI - state.heading);
  context.fillStyle = '#cbd9dc'; context.strokeStyle = '#62828c'; context.lineWidth = 2;
  context.beginPath(); context.moveTo(0, -8); context.lineTo(-5.5, 5); context.lineTo(0, 2); context.lineTo(5.5, 5); context.closePath(); context.fill(); context.stroke();
  context.restore();
}

function renderHUD(state, world) {
  $('stamina-fill').style.transform = `scaleX(${state.stamina})`;
  $('stamina-track').setAttribute('aria-valuenow', Math.round(state.stamina * 100));
  $('treat-count').textContent = state.treats;
  $('quest-count').textContent = `${Math.min(3, state.treats)}/3`;
  $('quest-title').textContent = state.completed ? 'Đã trở về an toàn' : state.treats >= 3 ? 'Quay về nơi trú' : 'Tìm 3 phần thức ăn';
  $('quest-hint').textContent = state.completed ? 'Bạn có thể tiếp tục khám phá hoặc nghỉ lại.' : state.treats >= 3 ? 'Tìm vòng đèn xanh trên bản đồ.' : 'Tránh người gác. Giữ sức để chạy.';
  document.querySelector('.quest').classList.toggle('complete', state.completed);
  $('health-status').setAttribute('aria-label', `Thể lực ${state.health} trên 3`);
  for (const [index, pip] of [...$('health-status').querySelectorAll('i')].entries()) pip.classList.toggle('lost', index >= state.health);
  const safety = state.safe ? 'safe' : state.windup ? 'windup' : state.danger ? 'chase' : state.alert > 0.15 ? 'alert' : 'quiet';
  document.body.dataset.safety = safety;
  $('danger-label').textContent = state.safe ? 'TRONG VÙNG TRÚ ẨN' : state.windup ? 'NÉ ĐÒN — RỜI VÒNG ĐỎ' : state.danger ? 'BỊ TRUY ĐUỔI' : state.alert > 0.15 ? 'ĐANG BỊ CHÚ Ý' : 'ẨN MÌNH TRONG ĐÊM';
  $('awareness-fill').style.transform = `scaleX(${state.safe ? 0 : state.alert})`;
  $('interact').disabled = !state.near && !state.safe;
  $('interact-label').textContent = state.safe ? 'Nghỉ' : state.near ? `Nghe ${state.near}` : 'Tương tác';
  $('near-prompt').hidden = (!state.near && !state.safe) || state.talking;
  $('near-label').textContent = state.safe ? 'Nghỉ dưới mái hiên' : state.near ? `Nghe ${state.near}` : '';
  if (!state.talking) $('dialogue').hidden = true;
  drawMap(state, world);
}

function play() {
  if ($('start').disabled) return;
  game.setMode('playing'); $('start').blur(); $('world').focus({ preventScroll: true });
}
$('start').addEventListener('click', play);
$('pause').addEventListener('click', () => game?.setMode('paused'));
$('resume').addEventListener('click', () => { if (game?.mode === 'caught') game.restart(); else game?.setMode('playing'); $('world').focus({ preventScroll: true }); });
$('change-dog').addEventListener('click', () => game?.setMode('choose'));
$('bark').addEventListener('click', () => game?.bark());
$('jump').addEventListener('click', () => game?.jump());
$('interact').addEventListener('click', () => game?.interact());
window.addEventListener('keydown', event => {
  if (game?.mode !== 'choose' || event.repeat) return;
  if (event.code === 'Enter') { event.preventDefault(); play(); }
  if (/^Digit\d$/.test(event.code)) {
    const index = (Number(event.code.slice(-1)) + 9) % 10;
    if (dogs[index]) chooseDog(dogs[index]);
  }
});

let stickPointer = null;
function moveStick(event) {
  if (event.pointerId !== stickPointer || !game) return;
  const bounds = $('joystick').getBoundingClientRect();
  const dx = event.clientX - bounds.left - bounds.width / 2;
  const dy = event.clientY - bounds.top - bounds.height / 2;
  const length = Math.hypot(dx, dy), factor = Math.min(1, 34 / Math.max(1, length));
  $('stick-knob').style.transform = `translate(${dx * factor}px, ${dy * factor}px)`;
  game.stick = { x: dx * factor / 34, z: -dy * factor / 34 };
}
$('joystick').addEventListener('pointerdown', event => {
  stickPointer = event.pointerId; $('joystick').setPointerCapture(event.pointerId);
  $('joystick').classList.add('active'); moveStick(event);
});
$('joystick').addEventListener('pointermove', moveStick);
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('joystick').addEventListener(type, () => {
  stickPointer = null; if (game) game.stick = { x: 0, z: 0 };
  $('stick-knob').style.transform = ''; $('joystick').classList.remove('active');
});
$('touch-sprint').addEventListener('pointerdown', event => {
  if (game) game.touchSprint = true; $('touch-sprint').setPointerCapture(event.pointerId);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('touch-sprint').addEventListener(type, () => { if (game) game.touchSprint = false; });

try {
  const response = await fetch('/catalog.json');
  if (!response.ok) throw new Error('Không tải được danh sách nhân vật. Kiểm tra kết nối và thử lại nhé.');
  const catalog = await response.json();
  dogs = ROSTER.map(character => {
    const asset = catalog.dogs.find(dog => dog.id === character.id);
    if (!asset) throw new Error(`Thiếu nhân vật ${character.name}.`);
    return { ...asset, ...character };
  });
  game = new Pawtown($('world'), {
    mode: modeChanged, frame: renderHUD, toast,
    damage() {
      clearTimeout(hurtTimer); $('hit-overlay').classList.add('active');
      hurtTimer = setTimeout(() => $('hit-overlay').classList.remove('active'), 450);
    },
    loading(loading) {
      $('start').disabled = loading;
      $('start-label').textContent = loading ? 'Đang chuẩn bị…' : 'Bước vào đêm';
      $('picker').classList.toggle('loading', loading);
    },
    error(message) {
      $('model-error').textContent = message; $('model-error').hidden = false;
      $('start').disabled = true; $('start-label').textContent = 'Hãy chọn lại bạn chó';
    },
    dialogue(name, text) {
      $('speaker').textContent = name; $('speech').textContent = text; $('dialogue').hidden = false;
    },
  });
  for (const [index, dog] of dogs.entries()) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'dog-card';
    button.dataset.id = dog.id; button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `<span class="card-number">${index === 9 ? '0' : index + 1}</span>${portrait(dog)}<strong></strong><span class="selection-dot"></span>`;
    button.querySelector('strong').textContent = dog.name;
    button.addEventListener('click', () => chooseDog(dog)); $('roster').append(button);
  }
  chooseDog(initialDog(dogs, new URL(location.href).searchParams.get('dog'), recall(storage)));
  game.addAmbientDogs(dogs);
  if (new URL(location.href).searchParams.has('debug')) {
    window.__pawtown = Object.freeze({ snapshot: () => game.snapshot(), renderer: () => game.renderer.info.render });
  }
} catch (error) {
  console.error(error); $('fatal-message').textContent = error.message || 'Trình duyệt chưa sẵn sàng cho đồ họa 3D. Hãy bật tăng tốc đồ họa và tải lại.';
  $('fatal').hidden = false;
}
>>>>>>> 6218043 (ok)
||||||| parent of c01158c (Simplify Pawtown to a single-dog FPS playground)
=======

async function boot() {
  try {
    game = new Pawtown(world, {
      mode: modeChanged,
      view: changeView,
      error: showError,
      capture(locked) { lookHint.textContent = locked ? 'Di chuột để nhìn' : 'Kéo chuột để nhìn'; },
      stamina(percent) {
        stamina.setAttribute('aria-valuenow', percent);
        staminaFill.style.transform = `scaleX(${percent / 100})`;
      },
    });
  } catch (error) {
    console.error(error);
    showError('Trình duyệt cần WebGL 2 để hiển thị sân chơi.');
    return;
  }
  try {
    const response = await fetch('/catalog.json');
    if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
    const { dogs } = await response.json();
    await game.load(dogs[0]);
    get('start-label').textContent = 'Vào sân';
    start.disabled = false;
  } catch (error) {
    console.error(error);
    showError('Tải mẫu chó thất bại. Hãy tải lại trang để thử lại.');
  }
}

boot();
>>>>>>> c01158c (Simplify Pawtown to a single-dog FPS playground)
