/* Progressive enhancement only: document links and native <details> own navigation. */
(() => {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const normalise = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const directNodes = parent => Array.from(parent ? parent.children : []).filter(child => child.matches('[data-map-node]'));
  const ownLink = node => Array.from(node.children).find(child => child.matches('a.topic-map-link')) || node;
  const box = (element, origin) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left - origin.left, top: rect.top - origin.top,
      right: rect.right - origin.left, bottom: rect.bottom - origin.top,
      width: rect.width, height: rect.height, cx: rect.left - origin.left + rect.width / 2,
      cy: rect.top - origin.top + rect.height / 2 };
  };
  const point = value => Math.round(value * 10) / 10;
  const route = coordinates => coordinates.map((pair, index) => `${index ? 'L' : 'M'}${point(pair[0])} ${point(pair[1])}`).join(' ');

  function enhance(map) {
    if (map.dataset.mapReady) return;
    map.dataset.mapReady = 'true';
    const nodes = Array.from(map.querySelectorAll('[data-map-node]'));
    const branches = Array.from(map.querySelectorAll('[data-map-branch]'));
    const details = Array.from(map.querySelectorAll('details.topic-map-detail'));
    const layout = map.querySelector('.topic-map-layout');
    const root = map.querySelector('.topic-map-root');
    const lines = map.querySelector('.topic-map-lines');
    const tools = map.querySelector('.topic-map-tools');
    const search = map.querySelector('[data-map-search]');
    const status = map.querySelector('[data-map-status]');
    const expand = map.querySelector('[data-map-expand]');
    const collapse = map.querySelector('[data-map-collapse]');
    const searchable = nodes.map(node => ({ node, text: normalise(node.dataset.mapSearchText || node.textContent) }));
    let frame = 0;
    map.classList.add('is-map-enhanced');

    function redraw() {
      frame = 0;
      if (!layout || !root || !lines) return;
      const origin = layout.getBoundingClientRect();
      const rootBox = box(root, origin);
      const branchBoxes = branches.map(branch => ({ branch, title: branch.querySelector('.topic-map-branch-title'),
        container: branch.querySelector('.topic-map-nodes') })).filter(item => item.title);
      // The narrow layout uses CSS tree rails, including when JavaScript is unavailable.
      const desktop = branchBoxes.length && box(branchBoxes[0].title, origin).left > rootBox.right + 8;
      lines.replaceChildren();
      map.classList.remove('has-map-lines');
      if (!desktop || origin.width <= 0 || origin.height <= 0) return;
      const paths = [];
      for (const item of branchBoxes) {
        const titleBox = box(item.title, origin);
        const rootRail = rootBox.right + (titleBox.left - rootBox.right) / 2;
        paths.push(route([[rootBox.right, rootBox.cy], [rootRail, rootBox.cy], [rootRail, titleBox.cy], [titleBox.left, titleBox.cy]]));
        const children = directNodes(item.container);
        if (!children.length) continue;
        const containerBox = box(item.container, origin);
        const chapterRail = titleBox.right + (containerBox.left - titleBox.right) / 2;
        for (const child of children) {
          const target = box(ownLink(child), origin);
          const outer = box(child, origin);
          // A row's upper gutter lets a second-column edge pass above, never across, a card.
          const upperRail = outer.top - 10;
          paths.push(route([[titleBox.right, titleBox.cy], [chapterRail, titleBox.cy],
            [chapterRail, upperRail], [target.cx, upperRail], [target.cx, outer.top]]));
        }
      }
      const fragment = document.createDocumentFragment();
      for (const d of paths) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        fragment.appendChild(path);
      }
      lines.setAttribute('viewBox', `0 0 ${point(origin.width)} ${point(origin.height)}`);
      lines.setAttribute('preserveAspectRatio', 'none');
      lines.appendChild(fragment);
      map.classList.add('has-map-lines');
    }
    function scheduleDraw() {
      if (!frame) frame = window.requestAnimationFrame(redraw);
    }
    function updateSearch() {
      const query = normalise(search && search.value);
      const terms = query.split(' ').filter(Boolean);
      let found = 0;
      for (const item of searchable) {
        const match = terms.length > 0 && terms.every(term => item.text.includes(term));
        item.node.classList.toggle('is-map-match', match);
        if (match) found += 1;
      }
      for (const branch of branches) branch.classList.toggle('has-map-match', Boolean(branch.querySelector('.is-map-match')));
      if (status) status.textContent = terms.length ? `匹配 ${found} / ${nodes.length} 个知识节点；已标出匹配项，全部节点仍可浏览。` : `${branches.length} 个分支 · ${nodes.length} 个知识节点`;
    }
    function setDetails(open) {
      for (const detail of details) detail.open = open;
      scheduleDraw();
    }
    if (tools) tools.hidden = false;
    if (search) search.addEventListener('input', updateSearch);
    if (expand) { expand.disabled = details.length === 0; expand.addEventListener('click', () => setDetails(true)); }
    if (collapse) { collapse.disabled = details.length === 0; collapse.addEventListener('click', () => setDetails(false)); }
    for (const detail of details) detail.addEventListener('toggle', scheduleDraw);
    if (typeof ResizeObserver !== 'undefined' && layout) {
      const observer = new ResizeObserver(scheduleDraw);
      observer.observe(layout);
      for (const branch of branches) observer.observe(branch);
    }
    window.addEventListener('resize', scheduleDraw, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleDraw);
    updateSearch();
    scheduleDraw();
  }
  function initialise() { document.querySelectorAll('[data-topic-map]').forEach(enhance); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
})();
