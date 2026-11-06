/* Forester concept graph. Data is embedded by the page as window.TriGraphData. */
(function () {
  'use strict';

  function start() {
    var root = document.getElementById('graph-root');
    if (!root) return;

    var data = window.TriGraphData;
    if (!data || !Array.isArray(data.notes) || !data.notes.length) {
      root.textContent = '概念图谱暂时无法显示。';
      return;
    }

    var clusters = data.clusters || {};
    var nodes = data.notes.filter(function (note) {
      return note && typeof note.id === 'string' && note.id;
    }).map(function (note) {
      return {
        id: note.id, title: note.title || note.id,
        aliases: Array.isArray(note.aliases) ? note.aliases : [],
        cluster: note.cluster || '', moc: !!note.moc,
        x: 0, y: 0, vx: 0, vy: 0, degree: 0
      };
    });
    var byId = Object.create(null);
    nodes = nodes.filter(function (node) {
      if (byId[node.id]) return false;
      byId[node.id] = node;
      return true;
    });
    var seenEdges = Object.create(null);
    var edges = (Array.isArray(data.edges) ? data.edges : []).filter(function (pair) {
      if (!Array.isArray(pair) || pair.length < 2 || !byId[pair[0]] || !byId[pair[1]] || pair[0] === pair[1]) return false;
      var key = [pair[0], pair[1]].sort().join('\u0000');
      if (seenEdges[key]) return false;
      seenEdges[key] = true;
      byId[pair[0]].degree++;
      byId[pair[1]].degree++;
      return true;
    });

    // Explicit files work in both file:// previews and HTTP deployments.
    // A page can override this with data-note-href-template="../{id}/index.html".
    var hrefTemplate = root.getAttribute('data-note-href-template') || '../{id}/index.html';
    function noteHref(node) {
      return hrefTemplate.replace(/\{id\}/g, encodeURIComponent(node.id));
    }

    root.replaceChildren();
    var toolbar = document.createElement('div');
    toolbar.className = 'tri-graph-toolbar';
    var searchLabel = document.createElement('label');
    searchLabel.className = 'tri-graph-search-label';
    searchLabel.textContent = '在图谱中高亮笔记 ';
    var search = document.createElement('input');
    search.type = 'search';
    search.className = 'tri-graph-search';
    search.placeholder = '标题或别名';
    searchLabel.appendChild(search);
    toolbar.appendChild(searchLabel);
    var searchStatus = document.createElement('span');
    searchStatus.className = 'tri-graph-search-status';
    searchStatus.setAttribute('aria-live', 'polite');
    toolbar.appendChild(searchStatus);
    var controls = document.createElement('div');
    controls.className = 'tri-graph-controls';
    function control(label, symbol) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'tri-graph-control';
      button.setAttribute('aria-label', label);
      button.title = label;
      button.textContent = symbol;
      controls.appendChild(button);
      return button;
    }
    var zoomIn = control('放大图谱', '+');
    var zoomOut = control('缩小图谱', '−');
    var reset = control('重置图谱视角', '⌂');
    toolbar.appendChild(controls);
    root.appendChild(toolbar);

    var stage = document.createElement('div');
    stage.className = 'tri-graph-stage';
    stage.style.position = 'relative';
    stage.style.width = '100%';
    stage.style.height = 'clamp(420px, 62vh, 620px)';
    var canvas = document.createElement('canvas');
    canvas.className = 'tri-graph-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', (data.label || '学科') + '概念图谱。下方提供可用键盘操作的全部笔记链接。');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    stage.appendChild(canvas);
    var tip = document.createElement('div');
    tip.className = 'tri-graph-tip';
    tip.hidden = true;
    tip.style.position = 'absolute';
    tip.style.pointerEvents = 'none';
    stage.appendChild(tip);
    root.appendChild(stage);

    // The Forester page provides a static, keyboard-accessible note directory
    // outside this root, so it remains available when scripts are disabled.
    var groups = Object.create(null);
    nodes.forEach(function (node) {
      (groups[node.cluster] || (groups[node.cluster] = [])).push(node);
    });

    var ctx = canvas.getContext('2d');
    if (!ctx) {
      root.textContent = '图谱画布不可用，请使用下方笔记目录浏览。';
      return;
    }

    var width = 0, height = 0, alpha = 1, raf = 0, query = '';
    var view = { x: 0, y: 0, k: 1 };
    var hovered = null, pointer = null;
    function radius(node) { return (node.moc ? 9 : 6) + Math.min(node.degree, 8) * 0.55; }
    function clusterColor(node) {
      return (clusters[node.cluster] && clusters[node.cluster].color) || '#64748b';
    }
    function matches(node) {
      if (!query) return true;
      return (node.id + ' ' + node.title + ' ' + node.aliases.join(' ')).toLocaleLowerCase().indexOf(query) !== -1;
    }

    function layout() {
      var keys = Object.keys(groups);
      keys.forEach(function (key, groupIndex) {
        var group = groups[key];
        group.forEach(function (node, i) {
          var fraction = group.length === 1 ? 0.5 : 0.08 + 0.84 * i / (group.length - 1);
          var angle = ((groupIndex + fraction) / keys.length) * Math.PI * 2 - Math.PI / 2;
          var scale = node.moc ? 0.23 : 0.34;
          node.x = width / 2 + Math.cos(angle) * width * scale;
          node.y = height / 2 + Math.sin(angle) * height * scale;
          node.vx = 0; node.vy = 0;
        });
      });
      alpha = 1;
    }

    function resize() {
      var oldW = width, oldH = height;
      width = Math.max(260, Math.round(stage.getBoundingClientRect().width));
      height = Math.max(320, Math.round(stage.getBoundingClientRect().height));
      if (width === oldW && height === oldH) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!oldW) layout();
      else {
        nodes.forEach(function (node) {
          node.x = (node.x - oldW / 2) * width / oldW + width / 2;
          node.y = (node.y - oldH / 2) * height / oldH + height / 2;
        });
        alpha = Math.max(alpha, 0.25);
      }
      schedule();
    }

    function tick() {
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var a = nodes[i], b = nodes[j];
          var dx = b.x - a.x, dy = b.y - a.y;
          var dist2 = dx * dx + dy * dy || 1;
          if (dist2 > 280 * 280) continue;
          var dist = Math.sqrt(dist2);
          var force = dist < 40 ? (40 - dist) * 0.12 : 2400 / dist2;
          var fx = dx / dist * force, fy = dy / dist * force;
          a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
        }
      }
      edges.forEach(function (edge) {
        var a = byId[edge[0]], b = byId[edge[1]];
        var dx = b.x - a.x, dy = b.y - a.y;
        var dist = Math.hypot(dx, dy) || 1;
        var force = (dist - 165) * 0.003;
        var fx = dx / dist * force, fy = dy / dist * force;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      });
      nodes.forEach(function (node) {
        node.vx += (width / 2 - node.x) * 0.0008;
        node.vy += (height / 2 - node.y) * 0.0008;
        if (!pointer || pointer.node !== node) {
          node.x += Math.max(-7, Math.min(7, node.vx * alpha));
          node.y += Math.max(-7, Math.min(7, node.vy * alpha));
        }
        node.vx *= 0.84;
        node.vy *= 0.84;
      });
      alpha *= 0.983;
    }

    function label(ctx, node) {
      var title = node.title;
      var first = '', second = '';
      for (var i = 0; i < title.length; i++) {
        if (ctx.measureText(first + title[i]).width <= 130) first += title[i];
        else { second = title.slice(i); break; }
      }
      var y = node.y - radius(node) - 7;
      if (second) {
        while (second.length > 1 && ctx.measureText(second + '…').width > 130) second = second.slice(0, -1);
        if (first.length + second.length < title.length) second += '…';
        ctx.fillText(first, node.x, y - 10);
        ctx.fillText(second, node.x, y + 3);
      } else ctx.fillText(first, node.x, y);
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(view.x, view.y);
      ctx.scale(view.k, view.k);
      edges.forEach(function (edge) {
        var a = byId[edge[0]], b = byId[edge[1]];
        var hot = hovered && (a.id === hovered.id || b.id === hovered.id);
        ctx.strokeStyle = hot ? 'rgba(5, 150, 105, .55)' : 'rgba(71, 85, 105, .19)';
        ctx.lineWidth = hot ? 1.7 : 1;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });
      nodes.forEach(function (node) {
        var r = radius(node), hot = hovered === node;
        ctx.globalAlpha = matches(node) ? 1 : 0.16;
        if (hot || node.moc) {
          ctx.beginPath(); ctx.arc(node.x, node.y, r + 6, 0, Math.PI * 2);
          ctx.fillStyle = hot ? 'rgba(15, 23, 42, .12)' : 'rgba(15, 23, 42, .06)';
          ctx.fill();
        }
        ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = clusterColor(node); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.font = (node.moc ? '600 12px' : '500 11px') + ' system-ui, sans-serif';
        ctx.fillStyle = hot ? '#0f172a' : '#334155';
        ctx.textAlign = 'center';
        if (hot || node.moc || (query && matches(node))) label(ctx, node);
      });
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function frame() {
      raf = 0;
      if (alpha > 0.025) tick();
      draw();
      if (alpha > 0.025) schedule();
    }
    function schedule() { if (!raf) raf = window.requestAnimationFrame(frame); }
    function toWorld(clientX, clientY) {
      var rect = canvas.getBoundingClientRect();
      return { x: (clientX - rect.left - view.x) / view.k,
               y: (clientY - rect.top - view.y) / view.k };
    }
    function hit(clientX, clientY) {
      var p = toWorld(clientX, clientY);
      for (var i = nodes.length - 1; i >= 0; i--) {
        var node = nodes[i], dx = node.x - p.x, dy = node.y - p.y;
        if (dx * dx + dy * dy <= Math.pow(radius(node) + 10, 2)) return node;
      }
      return null;
    }
    function showTip(node, ev) {
      if (!node || ev.pointerType === 'touch') { tip.hidden = true; return; }
      tip.textContent = node.title + ' · ' + ((clusters[node.cluster] && clusters[node.cluster].name) || node.cluster) + ' · ' + node.degree + ' 条关联';
      var rect = canvas.getBoundingClientRect();
      tip.style.left = Math.max(8, Math.min(ev.clientX - rect.left + 14, width - 235)) + 'px';
      tip.style.top = Math.max(8, Math.min(ev.clientY - rect.top + 14, height - 48)) + 'px';
      tip.hidden = false;
    }
    function zoom(factor, x, y) {
      x = x === undefined ? width / 2 : x;
      y = y === undefined ? height / 2 : y;
      var next = Math.max(0.45, Math.min(2.5, view.k * factor));
      var scale = next / view.k;
      view.x = x - (x - view.x) * scale;
      view.y = y - (y - view.y) * scale;
      view.k = next;
      schedule();
    }

    canvas.addEventListener('pointerdown', function (ev) {
      if (pointer || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
      var node = hit(ev.clientX, ev.clientY);
      pointer = { id: ev.pointerId, node: node, x: ev.clientX, y: ev.clientY,
                  startX: ev.clientX, startY: ev.clientY, moved: false };
      canvas.setPointerCapture(ev.pointerId);
      canvas.style.cursor = 'grabbing';
      ev.preventDefault();
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (pointer && pointer.id === ev.pointerId) {
        if (Math.hypot(ev.clientX - pointer.startX, ev.clientY - pointer.startY) > 6) pointer.moved = true;
        if (pointer.moved) {
          if (pointer.node) {
            var p = toWorld(ev.clientX, ev.clientY);
            pointer.node.x = p.x; pointer.node.y = p.y;
            alpha = Math.max(alpha, 0.35);
          } else {
            view.x += ev.clientX - pointer.x;
            view.y += ev.clientY - pointer.y;
          }
          schedule();
        }
        pointer.x = ev.clientX; pointer.y = ev.clientY;
        return;
      }
      hovered = hit(ev.clientX, ev.clientY);
      canvas.style.cursor = hovered ? 'pointer' : 'grab';
      showTip(hovered, ev);
      schedule();
    });
    function finishPointer(ev, cancelled) {
      if (!pointer || pointer.id !== ev.pointerId) return;
      if (Math.hypot(ev.clientX - pointer.startX, ev.clientY - pointer.startY) > 6) pointer.moved = true;
      var target = !cancelled && !pointer.moved ? pointer.node : null;
      pointer = null;
      canvas.style.cursor = 'grab';
      tip.hidden = true;
      if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
      if (target) window.location.assign(noteHref(target));
    }
    canvas.addEventListener('pointerup', function (ev) { finishPointer(ev, false); });
    canvas.addEventListener('pointercancel', function (ev) { finishPointer(ev, true); });
    canvas.addEventListener('pointerleave', function () {
      if (!pointer) { hovered = null; tip.hidden = true; schedule(); }
    });
    canvas.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var rect = canvas.getBoundingClientRect();
      zoom(ev.deltaY < 0 ? 1.12 : 1 / 1.12, ev.clientX - rect.left, ev.clientY - rect.top);
    }, { passive: false });
    search.addEventListener('input', function () {
      query = search.value.trim().toLocaleLowerCase();
      searchStatus.textContent = query ? '高亮 ' + nodes.filter(matches).length + ' 个节点' : '';
      schedule();
    });
    zoomIn.addEventListener('click', function () { zoom(1.2); });
    zoomOut.addEventListener('click', function () { zoom(1 / 1.2); });
    reset.addEventListener('click', function () {
      view.x = 0; view.y = 0; view.k = 1;
      schedule();
    });

    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    else window.addEventListener('resize', resize);
    resize();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
