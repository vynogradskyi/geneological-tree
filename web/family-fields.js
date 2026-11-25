/* Cached, bounded-resolution color fields. No portraits or family facts are drawn. */
window.GenealogyFields = (() => {
  const padding = 420, opacity = .24;
  function rasterSize(width, height) {
    const scale = Math.min(.4, 1400 / width, 1000 / height, Math.sqrt(1000000 / (width * height)));
    return {width:Math.max(1, Math.floor(width * scale)), height:Math.max(1, Math.floor(height * scale)), scale};
  }
  function plan(model, theme) {
    const blobs = [], nodes = model.nodes;
    // Broad parent corridors carry the same color transitions as the actual lines.
    for (const edge of model.edges) if (edge.kind === 'parent') {
      const {from, to} = theme.edge(edge), stops = window.GenealogyColors.stops(from, to);
      for (const points of edge.paths) {
        const length = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
        const steps = Math.min(24, Math.max(2, Math.ceil(length / 160)));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps, u = 1 - t;
          const point = [0, 1].map(axis => u ** 3 * points[0][axis] + 3 * u ** 2 * t * points[1][axis] + 3 * u * t ** 2 * points[2][axis] + t ** 3 * points[3][axis]);
          blobs.push({x:point[0], y:point[1], rx:210, ry:210, color:stops[Math.round(t * 4)][1]});
        }
      }
    }
    for (const [id, node] of Object.entries(nodes).sort((a, b) => a[1].y - b[1].y || a[0].localeCompare(b[0]))) {
      blobs.push({x:node.x + node.w / 2, y:node.y + node.h / 2, rx:node.w * 1.65, ry:node.h * .95, color:theme.people[id].color});
    }
    return {width:model.width + padding * 2, height:model.height + padding * 2, padding, blobs};
  }
  function create(canvas) {
    const ctx = canvas.getContext('2d');
    let signature = '', pending = null, scheduled = false;
    function render() {
      scheduled = false;
      const field = pending, size = rasterSize(field.width, field.height);
      canvas.width = size.width; canvas.height = size.height;
      Object.assign(canvas.style, {left:-padding + 'px', top:-padding + 'px', width:field.width + 'px', height:field.height + 'px', opacity});
      ctx.setTransform(size.scale, 0, 0, size.scale, padding * size.scale, padding * size.scale);
      for (const blob of field.blobs) {
        ctx.save(); ctx.translate(blob.x, blob.y); ctx.scale(blob.rx, blob.ry);
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        gradient.addColorStop(0, blob.color + 'b3'); gradient.addColorStop(.35, blob.color + '80');
        gradient.addColorStop(.7, blob.color + '33'); gradient.addColorStop(1, blob.color + '00');
        ctx.fillStyle = gradient; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
      }
    }
    return {update(model, theme) {
      if (!ctx) return;
      const field = plan(model, theme), next = JSON.stringify(field);
      if (next === signature) return;
      signature = next; pending = field;
      if (!scheduled) { scheduled = true; requestAnimationFrame(render); }
    }};
  }
  return {plan, rasterSize, create, opacity};
})();
