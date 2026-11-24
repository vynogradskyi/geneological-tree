// Real family records are local-only. A clean checkout uses synthetic examples.
window.GENEALOGY_READY = new Promise((resolve, reject) => {
  function load(path, fallback) {
    const script = document.createElement('script');
    script.src = path;
    script.onload = () => window.GENEALOGY?.data ? resolve(window.GENEALOGY) : fallback();
    script.onerror = fallback;
    document.head.append(script);
  }
  load('web/family-data.js', () => load('web/example-data.js', () => reject(new Error('Nie udało się odczytać danych przykładowych.'))));
});
