import '/vendor/model-viewer.min.js';
import { filterDogs, initialDog, recall, remember } from './catalog.mjs';

const element = id => document.getElementById(id);
const viewer = element('viewer');
const ModelViewer = customElements.get('model-viewer');
ModelViewer.meshoptDecoderLocation = '/vendor/meshopt_decoder.js';
ModelViewer.modelCacheSize = 2;
const filters = { query: '', type: '', stage: '', saved: false };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let playing = !reduceMotion;
let dogs = [];
let selected;
let storage;
try { storage = window.localStorage; } catch { /* Storage is optional. */ }

function updateList() {
  const visible = filterDogs(dogs, filters);
  const fragment = document.createDocumentFragment();
  for (const dog of visible) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dog-option';
    button.dataset.id = dog.id;
    button.setAttribute('aria-pressed', String(dog.id === selected?.id));
    const name = document.createElement('strong');
    name.textContent = dog.typeName;
    const detail = document.createElement('span');
    detail.textContent = dog.variantLabel;
    const marker = document.createElement('span');
    marker.className = 'dog-marker';
    marker.textContent = dog.custom ? 'S' : dog.ageStage === 'puppy' ? 'P' : 'D';
    const text = document.createElement('span');
    text.append(name, detail);
    button.append(marker, text);
    button.addEventListener('click', () => selectDog(dog));
    fragment.append(button);
  }
  element('dog-list').replaceChildren(fragment);
  element('result-count').textContent = visible.length;
  element('empty').hidden = Boolean(visible.length);
}

function selectDog(dog) {
  selected = dog;
  remember(storage, dog.id);
  const url = new URL(location.href);
  url.searchParams.set('dog', dog.id);
  history.replaceState(null, '', url);
  element('model-name').textContent = dog.typeName;
  element('model-kind').textContent = dog.custom ? 'A SAVED COMPANION' : 'FROM THE COLLECTION';
  element('model-variant').textContent = dog.variantLabel;
  element('stage-badge').textContent = dog.ageStage.toUpperCase();
  element('loading-label').textContent = 'Meeting your companion…';
  element('loading').hidden = false;
  element('progress').value = 0;
  element('error').hidden = true;
  element('play').disabled = true;
  element('animation').disabled = true;
  viewer.alt = `Animated model: ${dog.name}`;
  viewer.src = dog.asset;
  updateList();
}

viewer.addEventListener('progress', event => {
  element('progress').value = event.detail.totalProgress;
});
viewer.addEventListener('load', () => {
  element('loading').hidden = true;
  element('error').hidden = true;
  const clips = viewer.availableAnimations;
  const fragment = document.createDocumentFragment();
  for (const clip of clips) {
    const option = new Option(clip.replaceAll('_', ' '), clip);
    fragment.append(option);
  }
  const animation = element('animation');
  animation.replaceChildren(fragment);
  animation.disabled = clips.length === 0;
  element('play').disabled = clips.length === 0;
  animation.value = clips.includes('Idle') ? 'Idle' : clips[0] || '';
  viewer.animationName = animation.value;
  viewer.timeScale = Number(element('speed').value);
  if (playing) viewer.play(); else viewer.pause();
  element('play').textContent = playing ? 'Pause' : 'Play';
});
viewer.addEventListener('error', () => {
  element('loading').hidden = true;
  element('error').hidden = false;
  element('error-message').textContent = 'This model could not be loaded. Check your connection and try again.';
});
element('retry').addEventListener('click', () => {
  if (selected) { viewer.removeAttribute('src'); selectDog(selected); }
  else location.reload();
});
element('animation').addEventListener('change', event => {
  viewer.animationName = event.target.value;
  if (playing) viewer.play(); else viewer.pause();
});
element('play').addEventListener('click', () => {
  playing = !playing;
  if (playing) viewer.play(); else viewer.pause();
  element('play').textContent = playing ? 'Pause' : 'Play';
});
element('speed').addEventListener('change', event => { viewer.timeScale = Number(event.target.value); });
element('rotate').addEventListener('click', event => {
  viewer.autoRotate = !viewer.autoRotate;
  event.currentTarget.setAttribute('aria-pressed', String(viewer.autoRotate));
});
element('reset').addEventListener('click', () => {
  viewer.cameraOrbit = '35deg 78deg auto';
  viewer.cameraTarget = 'auto auto auto';
  viewer.fieldOfView = 'auto';
  viewer.jumpCameraToGoal();
});
element('search').addEventListener('input', event => { filters.query = event.target.value; updateList(); });
for (const key of ['type', 'stage']) {
  element(key).addEventListener('change', event => { filters[key] = event.target.value; updateList(); });
}
for (const [id, saved] of [['all-models', false], ['saved-models', true]]) {
  element(id).addEventListener('click', () => {
    filters.saved = saved;
    element('all-models').setAttribute('aria-pressed', String(!saved));
    element('saved-models').setAttribute('aria-pressed', String(saved));
    updateList();
  });
}

try {
  const response = await fetch('/catalog.json');
  if (!response.ok) throw new Error(`Catalog returned ${response.status}`);
  const catalog = await response.json();
  dogs = catalog.dogs;
  if (!Array.isArray(dogs) || !dogs.length) throw new Error('The catalog is empty');
  for (const type of catalog.types) element('type').append(new Option(type.name, type.id));
  element('collection-count').textContent = `${catalog.types.length} breeds · ${dogs.length} models`;
  selectDog(initialDog(dogs, new URL(location.href).searchParams.get('dog'), recall(storage)));
} catch (error) {
  element('loading').hidden = true;
  element('error').hidden = false;
  element('error-message').textContent = 'The collection could not be loaded. Check your connection and try again.';
  element('collection-count').textContent = 'Collection unavailable';
  console.error(error);
}
