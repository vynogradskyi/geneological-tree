/* View-only generation ruler. Numbers come from layout ranks, never dates. */
window.GenealogyGenerations = (() => {
  function rows(model) {
    const groups = new Map();
    for (const [id, node] of Object.entries(model.nodes)) {
      const rank = model.ranks[id];
      if (!Number.isFinite(rank)) continue;
      if (!groups.has(rank)) groups.set(rank, []);
      groups.get(rank).push(node.y + node.h / 2);
    }
    if (!groups.size) return [];
    const oldest = Math.max(...groups.keys()), youngest = Math.min(...groups.keys());
    return [...groups].sort(([a], [b]) => b - a).map(([rank, centers]) => ({
      rank, number: oldest - rank + 1, total: oldest - youngest + 1,
      y: centers.reduce((sum, y) => sum + y, 0) / centers.length,
    }));
  }

  function visible(levels, {y, scale, height, top = 40, spacing = 32}) {
    if (!(scale > 0) || !Number.isFinite(y)) return [];
    const gaps = levels.slice(1).map((row, i) => Math.abs(row.y - levels[i].y)).filter(gap => gap > 0);
    const stride = gaps.length ? Math.max(1, Math.ceil(spacing / (Math.min(...gaps) * scale))) : 1;
    const inView = levels.map(row => ({...row, screenY: y + row.y * scale}))
      .filter(row => row.screenY >= top && row.screenY <= height - 12);
    const marked = inView.filter(row => (row.number - 1) % stride === 0);
    return marked.length ? marked : inView.slice(0, 1);
  }

  function create({element, model, t}) {
    let levels = [], ticks = new Map();
    function refresh() {
      levels = rows(model); ticks = new Map();
      element.setAttribute('aria-label', t('Pokolenia od najstarszego do najmłodszego'));
      const heading = document.createElement('span');
      heading.className = 'generation-heading'; heading.textContent = t('Pok.');
      heading.setAttribute('aria-hidden', 'true');
      const list = document.createElement('ol');
      list.className = 'generation-levels';
      for (const row of levels) {
        const tick = document.createElement('li');
        tick.className = 'generation-tick'; tick.value = row.number;
        tick.dataset.generation = row.number;
        tick.textContent = row.number;
        tick.setAttribute('aria-label', t('Pokolenie {number} z {total}', row));
        tick.hidden = true; list.append(tick); ticks.set(row.number, tick);
      }
      element.replaceChildren(heading, list);
    }
    function update(view) {
      const positions = new Map(visible(levels, {...view, height: element.clientHeight}).map(row => [row.number, row.screenY]));
      for (const [number, tick] of ticks) {
        tick.hidden = !positions.has(number);
        if (!tick.hidden) tick.style.top = positions.get(number) + 'px';
      }
    }
    refresh();
    return {refresh, update};
  }
  return {rows, visible, create};
})();
