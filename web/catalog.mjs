export const DEFAULT_DOG = 'saved_wispy-black-dog-20261116';

export function normalize(value) {
  return value.toLowerCase().replaceAll('đ', 'd').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export function filterDogs(dogs, { query = '', type = '', stage = '', saved = false } = {}) {
  const search = normalize(query.trim());
  return dogs.filter(dog => (!type || dog.typeId === type)
    && (!stage || dog.ageStage === stage)
    && (!saved || dog.custom)
    && normalize(`${dog.name} ${dog.id} ${dog.variantLabel}`).includes(search));
}

export function initialDog(dogs, requested, remembered) {
  return [requested, remembered, DEFAULT_DOG].map(id => dogs.find(dog => dog.id === id)).find(Boolean) || dogs[0];
}

export function recall(storage) {
  try { return storage.getItem('dog-motion-lab.selection'); } catch { return null; }
}

export function remember(storage, id) {
  try { storage.setItem('dog-motion-lab.selection', id); } catch { /* Browsing works with storage disabled. */ }
}
