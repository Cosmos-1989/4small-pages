/* Small, optional enhancements to the Forester-generated pages. */
(() => {
  'use strict';
  const KEY = 'sanjiaodi-v2';
  const OLD_KEY = 'sanjiaodi-v1';

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && typeof saved === 'object' && saved.problems && typeof saved.problems === 'object') return saved;
      const old = JSON.parse(localStorage.getItem(OLD_KEY));
      if (old && old.problems && typeof old.problems === 'object') {
        const problems = {};
        for (const [id, record] of Object.entries(old.problems)) {
          problems[id] = {
            solved: Boolean(record.ac),
            lastPick: Array.isArray(record.lastPick) ? record.lastPick : null,
            tries: Number(record.tries) || 0,
            reviewed: Boolean(record.ac && !record.lastPick),
            revealed: Array.isArray(record.revealed) ? record.revealed.map(index => Number(index) + 1).filter(Number.isInteger) : []
          };
        }
        return { problems };
      }
    } catch (_) { /* Reading remains available when storage is blocked. */ }
    return { problems: {} };
  }

  let state = readState();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }
  function record(id) { return state.problems[id] || (state.problems[id] = {}); }

  function status(id, type) {
    const item = state.problems[id] || {};
    if (type === 'choice' || type === 'multiple') {
      if (item.solved) return '✓ 已答对';
      if (item.lastPick && item.lastPick.length) return '◐ 已作答';
    } else {
      if (item.reviewed) return '✓ 已核对';
      if (item.revealed && item.revealed.length) return '◐ 已查看答案';
    }
    return '○ 未开始';
  }

  function updateStatuses() {
    document.querySelectorAll('[data-problem-row]').forEach(row => {
      const cell = row.querySelector('[data-status-for]');
      if (cell) cell.textContent = status(row.dataset.id, row.dataset.type);
    });
    document.querySelectorAll('[data-detail-status]').forEach(el => {
      const form = document.querySelector('.quiz');
      el.textContent = status(el.dataset.detailStatus, form ? form.dataset.type : 'short');
    });
    const count = document.getElementById('solved-count');
    if (count) {
      const rows = [...document.querySelectorAll('[data-problem-row]')];
      const done = rows.filter(row => status(row.dataset.id, row.dataset.type).startsWith('✓')).length;
      count.textContent = `${done} 道已完成`;
    }
  }

  function initNotes() {
    const grid = document.getElementById('notes-grid');
    if (!grid) return;
    const cards = [...grid.querySelectorAll('[data-note-card]')];
    const input = document.getElementById('notes-search');
    const chips = [...document.querySelectorAll('#cluster-filters button[data-cluster]')];
    const stageChips = [...document.querySelectorAll('#stage-filters button[data-note-stage]')];
    const sortButton = document.getElementById('notes-sort');
    const count = document.getElementById('notes-count');
    let cluster = 'all';
    let stage = 'all';
    let sortLinks = false;
    const originalOrder = new Map(cards.map((card, index) => [card, index]));
    function render() {
      const query = input.value.trim().toLocaleLowerCase();
      let visible = 0;
      cards.forEach(card => {
        card.hidden = (cluster !== 'all' && card.dataset.cluster !== cluster) ||
          (stage !== 'all' && card.dataset.stage !== stage) || Boolean(query && !card.dataset.search.includes(query));
        if (!card.hidden) visible += 1;
      });
      cards.sort((a, b) => sortLinks ? Number(b.dataset.links) - Number(a.dataset.links) || originalOrder.get(a) - originalOrder.get(b) : originalOrder.get(a) - originalOrder.get(b));
      cards.forEach(card => grid.append(card));
      count.textContent = `${visible} 条笔记`;
    }
    chips.forEach(chip => chip.addEventListener('click', () => {
      cluster = chip.dataset.cluster;
      chips.forEach(item => item.setAttribute('aria-pressed', String(item === chip)));
      render();
    }));
    stageChips.forEach(chip => chip.addEventListener('click', () => {
      stage = chip.dataset.noteStage;
      stageChips.forEach(item => item.setAttribute('aria-pressed', String(item === chip)));
      render();
    }));
    input.addEventListener('input', render);
    sortButton.addEventListener('click', () => {
      sortLinks = !sortLinks;
      sortButton.setAttribute('aria-pressed', String(sortLinks));
      render();
    });
  }

  function initProblems() {
    const search = document.getElementById('problems-search');
    if (!search) return;
    const rows = [...document.querySelectorAll('[data-problem-row]')];
    const filters = [...document.querySelectorAll('[data-filter-group]')];
    const count = document.getElementById('problems-count');
    function render() {
      const query = search.value.trim().toLocaleLowerCase();
      const selected = { difficulty: [], type: [], tag: [] };
      filters.forEach(button => {
        if (button.getAttribute('aria-pressed') === 'true') selected[button.dataset.filterGroup].push(button.dataset.filterValue);
      });
      let visible = 0;
      rows.forEach(row => {
        const tags = row.dataset.tags.split('|');
        const matches = (!query || row.dataset.search.includes(query)) &&
          (!selected.difficulty.length || selected.difficulty.includes(row.dataset.difficulty)) &&
          (!selected.type.length || selected.type.includes(row.dataset.type)) &&
          (!selected.tag.length || selected.tag.some(tag => tags.includes(tag)));
        row.hidden = !matches;
        if (matches) visible += 1;
      });
      count.textContent = `${visible} 道题`;
    }
    filters.forEach(button => button.addEventListener('click', () => {
      button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
      render();
    }));
    search.addEventListener('input', render);
    document.getElementById('reset-progress').addEventListener('click', () => {
      if (!window.confirm('确定清除本题库的本地作答与核对记录吗？')) return;
      rows.forEach(row => { delete state.problems[row.dataset.id]; });
      save();
      updateStatuses();
    });
    updateStatuses();
  }

  function initChoice() {
    const form = document.querySelector('.quiz');
    if (!form) return;
    const id = form.dataset.problemId;
    const inputs = [...form.querySelectorAll('input[name="answer"]')];
    const correct = inputs.filter(input => input.dataset.correct === 'true').map(input => input.value).sort();
    const verdict = form.querySelector('.verdict');
    const retry = form.querySelector('[data-retry]');

    function showResult(picked) {
      const sorted = [...picked].sort();
      const ok = sorted.join(',') === correct.join(',');
      form.classList.add('submitted');
      inputs.forEach(input => {
        input.checked = picked.includes(input.value);
        input.disabled = true;
        input.closest('.option').classList.toggle('correct', input.dataset.correct === 'true');
        input.closest('.option').classList.toggle('wrong-pick', input.checked && input.dataset.correct !== 'true');
      });
      verdict.className = `verdict ${ok ? 'ok' : 'bad'}`;
      verdict.textContent = `${ok ? '✓ 答案正确' : '✗ 答案未全对'}。正确答案：${correct.join('、')}；你的选择：${sorted.join('、') || '未选择'}。`;
      return ok;
    }

    const previous = record(id);
    if (Array.isArray(previous.lastPick) && previous.lastPick.length) showResult(previous.lastPick);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (form.classList.contains('submitted')) return;
      const picked = inputs.filter(input => input.checked).map(input => input.value);
      if (!picked.length) {
        verdict.className = 'verdict bad';
        verdict.textContent = '请先选择至少一个选项。';
        return;
      }
      const ok = showResult(picked);
      const item = record(id);
      item.lastPick = picked;
      item.tries = (item.tries || 0) + 1;
      item.solved = Boolean(item.solved || ok);
      save();
      updateStatuses();
    });
    retry.addEventListener('click', () => {
      form.classList.remove('submitted');
      inputs.forEach(input => {
        input.checked = false;
        input.disabled = false;
        input.closest('.option').classList.remove('correct', 'wrong-pick');
      });
      verdict.className = 'verdict';
      verdict.textContent = '';
    });
    updateStatuses();
  }

  function initOpenQuestions() {
    const details = [...document.querySelectorAll('.answer-details')];
    if (!details.length) return;
    const mark = document.getElementById('mark-reviewed');
    const id = mark.dataset.problemId;
    const item = record(id);
    const revealed = new Set(Array.isArray(item.revealed) ? item.revealed : []);
    details.forEach(detail => {
      const index = Number(detail.dataset.questionIndex);
      if (revealed.has(index)) detail.open = true;
      detail.addEventListener('toggle', () => {
        if (!detail.open) return;
        const current = record(id);
        const list = new Set(Array.isArray(current.revealed) ? current.revealed : []);
        list.add(index);
        current.revealed = [...list];
        save();
        updateStatuses();
      });
    });
    if (item.reviewed) mark.textContent = '✓ 已核对';
    mark.addEventListener('click', () => {
      record(id).reviewed = true;
      mark.textContent = '✓ 已核对';
      save();
      updateStatuses();
    });
    updateStatuses();
  }

  initNotes();
  initProblems();
  initChoice();
  initOpenQuestions();
})();
