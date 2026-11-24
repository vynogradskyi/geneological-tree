// Published viewer: use only the uploaded snapshot, never local edits or an API.
window.GenealogyStorage = {
  async open(seed) {
    return {mode: 'readonly', state: structuredClone(seed)};
  },
  photoSource(state, person) {
    return person.photo;
  },
};
