/* Homepage-only search: local inline data, native destinations, no stored state. */
(() => {
  'use strict';
  const normalise = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();

  function initialise() {
    const form = document.querySelector('[data-home-search-form]');
    const data = document.getElementById('home-search-data');
    const input = document.getElementById('home-knowledge-query');
    const results = document.getElementById('home-search-results');
    const status = document.getElementById('home-search-status');
    if (!form || !data || !input || !results || !status || form.dataset.ready) return;
    let records;
    try {
      records = JSON.parse(data.textContent);
      if (!Array.isArray(records)) return;
      records = records.filter(record => record && typeof record.title === 'string' && /^\.\/[a-zA-Z0-9_-]+\/index\.html$/.test(record.url));
    } catch (_) { return; }
    if (!records.length) return;
    form.dataset.ready = 'true';
    const index = records.map((record, position) => ({ record, position,
      title: normalise(record.title), aliases: (Array.isArray(record.aliases) ? record.aliases : []).map(normalise),
      text: normalise([record.title, ...(Array.isArray(record.aliases) ? record.aliases : []), record.summary, record.subjectLabel].join(' ')) }));
    form.hidden = false;
    status.textContent = `可查找 ${records.length.toLocaleString('zh-CN')} 条知识笔记。`;

    function search(submitted = false) {
      const query = normalise(input.value);
      results.replaceChildren();
      results.hidden = true;
      if (!query) {
        status.textContent = submitted ? '请输入想了解的概念或关键词。' : `可查找 ${records.length.toLocaleString('zh-CN')} 条知识笔记。`;
        return;
      }
      const terms = query.split(' ');
      const matches = index.filter(item => terms.every(term => item.text.includes(term)));
      const score = item => (item.title === query ? 100 : 0) + (item.aliases.includes(query) ? 80 : 0)
        + (item.title.startsWith(query) ? 30 : 0) + (item.title.includes(query) ? 20 : 0)
        + terms.filter(term => item.title.includes(term)).length * 5;
      matches.sort((a, b) => score(b) - score(a) || a.position - b.position);
      const shown = matches.slice(0, 12);
      const fragment = document.createDocumentFragment();
      for (const { record } of shown) {
        const item = document.createElement('li');
        const anchor = document.createElement('a');
        anchor.setAttribute('href', record.url);
        const title = document.createElement('strong');
        title.textContent = record.title;
        const subject = document.createElement('span');
        subject.textContent = record.subjectLabel || '';
        anchor.append(title, subject);
        if (record.summary) {
          const summary = document.createElement('p');
          summary.textContent = record.summary;
          anchor.appendChild(summary);
        }
        item.appendChild(anchor);
        fragment.appendChild(item);
      }
      results.appendChild(fragment);
      results.hidden = shown.length === 0;
      status.textContent = matches.length ? `找到 ${matches.length} 条笔记${matches.length > shown.length ? `，显示前 ${shown.length} 条；可添加关键词缩小范围` : ''}。`
        : '没有找到匹配的笔记。请换一个关键词，或从下方学科知识库继续查阅。';
    }
    input.addEventListener('input', () => search());
    form.addEventListener('submit', event => { event.preventDefault(); search(true); });
    document.querySelectorAll('a[href="#knowledge-search"]').forEach(anchor => {
      anchor.addEventListener('click', () => window.requestAnimationFrame(() => input.focus({ preventScroll: true })));
    });

    const explore = document.querySelector('.home-explore');
    if (explore) {
      explore.querySelectorAll('a').forEach(anchor => anchor.addEventListener('click', () => { explore.open = false; }));
      document.addEventListener('click', event => { if (!explore.contains(event.target)) explore.open = false; });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && explore.open) {
          explore.open = false;
          explore.querySelector('summary').focus();
        }
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
})();
