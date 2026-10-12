/**
 * app.js — UI logic for Pharmacy Date Calculator.
 */
(function () {
  'use strict';

  const {
    APP_VERSION,
    parseISODate,
    toISODate,
    todayUTC,
    calculate,
    formatDateLong,
    formatDateWithWeekday,
    formatDateShort,
  } = window;

  /* Storage */
  const STORAGE_MODE = 'pdc.mode';
  const STORAGE_THEME = 'pdc.theme';
  const STORAGE_HISTORY = 'pdc.history';
  const STORAGE_HIDE_PROOF = 'pdc.hideProof';
  const HISTORY_LIMIT = 10;

  const $ = (id) => document.getElementById(id);

  /* DOM */
  const form = $('calcForm');
  const startDateInput = $('startDate');
  const startWeekdayEl = $('startWeekday');
  const todayBtn = $('todayBtn');
  const countStartCheck = $('countStartCheck');
  const containersInput = $('containers');
  const perContainerInput = $('perContainer');
  const calcBtn = $('calcBtn');
  const errorArea = $('errorArea');
  const resultOverlay = $('resultOverlay');
  const resultCard = $('resultCard');
  const resultWeekdayEl = $('resultWeekday');
  const resultDateEl = $('resultDate');
  const resultProofEl = $('resultProof');
  const resultNoteEl = $('resultNote');
  const advancedToggle = $('advancedToggle');
  const advancedPanel = $('advancedPanel');
  const tabletsPerDayInput = $('tabletsPerDay');
  const themeSelect = $('themeSelect');
  const versionTag = $('versionTag');
  const updateBanner = $('updateBanner');
  const updateBtn = $('updateBtn');
  const historySection = $('historySection');
  const historyList = $('historyList');
  const clearHistoryBtn = $('clearHistoryBtn');
  const unitHint = $('unitHint');
  const hideProofCheck = $('hideProofCheck');

  function init() {
    versionTag.textContent = APP_VERSION;
    initTheme();
    initDate();
    initDefaults();
    initAdvanced();
    bindEvents();
    updateStartWeekday();
    updateUnitHint();
    initHideProof();
    renderHistory();
    registerServiceWorker();
  }

  function initHideProof() {
    hideProofCheck.checked = localStorage.getItem(STORAGE_HIDE_PROOF) === '1';
  }

  /* Theme */
  function initTheme() {
    const saved = localStorage.getItem(STORAGE_THEME) || 'auto';
    themeSelect.value = saved;
    applyTheme(saved);
    themeSelect.addEventListener('change', () => {
      localStorage.setItem(STORAGE_THEME, themeSelect.value);
      applyTheme(themeSelect.value);
    });
  }
  function applyTheme(mode) {
    if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
  }

  /* Date */
  function initDate() {
    startDateInput.value = toISODate(todayUTC());
  }

  function initDefaults() {
    containersInput.value = '1';
    perContainerInput.value = '30';
    updateActiveChip(30);
    countStartCheck.checked = false;
    tabletsPerDayInput.value = '1';
  }

  function updateStartWeekday() {
    const d = parseISODate(startDateInput.value);
    if (!d) { startWeekdayEl.textContent = ''; return; }
    const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    startWeekdayEl.textContent = weekdays[d.getUTCDay()];
  }

  function updateUnitHint() {
    const unit = document.querySelector('input[name="unit"]:checked').value;
    if (unit === 'months') {
      unitHint.textContent = 'Adds whole months; clamps to end of month when needed (Jan 31 + 1 mo = Feb 29 in a leap year).';
    } else {
      unitHint.textContent = 'Counts one day at a time, including leap days.';
    }
  }

  /* Advanced */
  function initAdvanced() {
    const saved = localStorage.getItem(STORAGE_MODE) === 'advanced';
    setAdvancedOpen(saved, false);
  }
  function setAdvancedOpen(open, animate = true) {
    advancedToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      advancedPanel.hidden = false;
      requestAnimationFrame(() => advancedPanel.classList.add('open'));
    } else {
      advancedPanel.classList.remove('open');
      if (animate) {
        setTimeout(() => { if (!advancedPanel.classList.contains('open')) advancedPanel.hidden = true; }, 260);
      } else {
        advancedPanel.hidden = true;
      }
    }
    localStorage.setItem(STORAGE_MODE, open ? 'advanced' : 'simple');
  }

  /* Events */
  function bindEvents() {
    todayBtn.addEventListener('click', () => {
      const newVal = toISODate(todayUTC());
      const changed = startDateInput.value !== newVal;
      startDateInput.value = newVal;
      updateStartWeekday();
      if (changed) {
        // Smooth flash to indicate the value changed; don't move focus.
        startDateInput.classList.remove('value-flash');
        // Force reflow so animation restarts
        void startDateInput.offsetWidth;
        startDateInput.classList.add('value-flash');
        setTimeout(() => startDateInput.classList.remove('value-flash'), 420);
      }
    });

    startDateInput.addEventListener('change', updateStartWeekday);
    startDateInput.addEventListener('input', updateStartWeekday);

    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const v = parseInt(chip.dataset.perContainer, 10);
        perContainerInput.value = String(v);
        updateActiveChip(v);
        clearInvalid();
        hideError();
      });
    });

    perContainerInput.addEventListener('input', () => {
      const v = parseInt(perContainerInput.value, 10);
      updateActiveChip(v);
    });

    advancedToggle.addEventListener('click', () => {
      setAdvancedOpen(advancedToggle.getAttribute('aria-expanded') !== 'true', true);
    });

    document.querySelectorAll('input[name="unit"]').forEach(r => {
      r.addEventListener('change', updateUnitHint);
    });

    form.addEventListener('submit', (e) => { e.preventDefault(); doCalculate(); });

    [startDateInput, containersInput, perContainerInput, tabletsPerDayInput].forEach(inp => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doCalculate(); }
      });
      inp.addEventListener('input', () => { inp.classList.remove('invalid'); hideError(); });
    });

    updateBtn.addEventListener('click', () => {
      if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    });

    clearHistoryBtn.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_HISTORY);
      renderHistory();
    });

    hideProofCheck.addEventListener('change', () => {
      localStorage.setItem(STORAGE_HIDE_PROOF, hideProofCheck.checked ? '1' : '0');
    });

    // Result overlay close (backdrop / X button)
    resultOverlay.addEventListener('click', (e) => {
      const closer = e.target.closest && e.target.closest('[data-close-result]');
      if (closer) closeResult();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && resultOverlay.classList.contains('open')) closeResult();
    });
  }

  /* Calculation */
  function closeResult() {
    resultOverlay.classList.remove('open');
    resultOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('overlay-open');
    setTimeout(() => { if (!resultOverlay.classList.contains('open')) resultOverlay.hidden = true; }, 360);
  }
  function openResult() {
    resultOverlay.hidden = false;
    resultOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overlay-open');
    // Force reflow so opening animation plays reliably each time
    void resultOverlay.offsetWidth;
    requestAnimationFrame(() => resultOverlay.classList.add('open'));
  }

  function doCalculate() {
    hideError();
    closeResult();
    resultNoteEl.hidden = true;
    clearInvalid();

    const dateStr = startDateInput.value;
    if (!dateStr) return showError('Enter a start date.', startDateInput);
    const startDate = parseISODate(dateStr);
    if (!startDate) return showError('Enter a valid start date.', startDateInput);

    const containersRaw = containersInput.value.trim();
    if (!containersRaw) return showError('Enter the number of containers.', containersInput);
    const containers = parseInt(containersRaw, 10);
    if (!Number.isInteger(containers) || containers <= 0) return showError('Enter a whole number of containers (1 or more).', containersInput);
    if (containers > 9999) return showError('Number of containers is too large.', containersInput);

    const perRaw = perContainerInput.value.trim();
    if (!perRaw) return showError('Enter the number of tablets per container.', perContainerInput);
    const perContainer = parseInt(perRaw, 10);
    if (!Number.isInteger(perContainer) || perContainer <= 0) return showError('Enter a whole number of tablets per container (1 or more).', perContainerInput);
    if (perContainer > 9999) return showError('Tablets per container is too large.', perContainerInput);

    const operation = document.querySelector('input[name="operation"]:checked').value;
    const unit = document.querySelector('input[name="unit"]:checked').value;

    let tabletsPerDay = 1;
    const tpdRaw = tabletsPerDayInput.value.trim();
    if (tpdRaw !== '') {
      tabletsPerDay = parseInt(tpdRaw, 10);
      if (!Number.isInteger(tabletsPerDay) || tabletsPerDay <= 0) {
        return showError('Tablets per day must be a whole number (1 or more).', tabletsPerDayInput);
      }
      if (tabletsPerDay > 24) return showError('Tablets per day must be 24 or fewer.', tabletsPerDayInput);
    }

    const countStartDay = countStartCheck.checked;

    let result;
    try {
      result = calculate({ startDate, containers, perContainer, operation, unit, tabletsPerDay, countStartDay });
    } catch (err) {
      return showError(err.message || 'Check your numbers and try again.');
    }

    renderResult(startDate, result, { containers, perContainer, operation, unit, tabletsPerDay, countStartDay });
    addHistory({ startDate, result, containers, perContainer, operation, unit, tabletsPerDay, countStartDay });
  }

  function renderResult(startDate, result, inputs) {
    resultWeekdayEl.textContent = formatDateWithWeekday(result.endDate).split(',')[0]; // weekday
    resultDateEl.textContent = formatDateLong(result.endDate);

    const startStr = formatDateShort(startDate);
    const endStr = formatDateShort(result.endDate);
    const opWord = inputs.operation === 'subtract' ? '\u2212' : '+';

    let proof;
    if (result.isMonths) {
      proof = `${inputs.containers}\u00d7${inputs.perContainer} = ${result.tablets} tabs`;
      if (inputs.tabletsPerDay !== 1) {
        proof += ` / ${inputs.tabletsPerDay}pd = ${result.days}mo`;
        if (result.remainder > 0) proof += ` (${result.remainder} extra)`;
      } else {
        proof += ` = ${result.monthsValue}mo`;
      }
      proof += `; ${startStr} ${opWord} ${result.monthsValue}mo`;
      if (inputs.countStartDay) proof += ' (incl. start)';
      proof += ` = ${endStr}`;
    } else {
      proof = `${inputs.containers}\u00d7${inputs.perContainer} = ${result.tablets} tabs`;
      if (inputs.tabletsPerDay !== 1) {
        proof += ` / ${inputs.tabletsPerDay}pd = ${result.days}d`;
      } else {
        proof += ` = ${result.days}d`;
      }
      proof += `; ${startStr} ${opWord} ${result.days}d`;
      if (inputs.countStartDay) proof += ' (incl. start)';
      proof += ` = ${endStr}`;
    }

    resultProofEl.textContent = proof;
    resultProofEl.classList.toggle('hidden-detail', hideProofCheck.checked);

    if (result.remainder > 0 && inputs.tabletsPerDay !== 1) {
      resultNoteEl.textContent = `${result.remainder} tablet${result.remainder === 1 ? '' : 's'} left over, not enough for a full day at ${inputs.tabletsPerDay} per day. Days rounded down.`;
      resultNoteEl.hidden = false;
    } else {
      resultNoteEl.hidden = true;
    }

    openResult();
  }

  function showError(msg, el) {
    errorArea.textContent = msg;
    errorArea.hidden = false;
    if (el) el.classList.add('invalid');
    if (!prefersReducedMotion()) {
      errorArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  function hideError() { errorArea.hidden = true; errorArea.textContent = ''; }
  function clearInvalid() {
    [startDateInput, containersInput, perContainerInput, tabletsPerDayInput].forEach(i => i.classList.remove('invalid'));
  }
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function updateActiveChip(value) {
    document.querySelectorAll('.chip').forEach(c => {
      c.classList.toggle('active', parseInt(c.dataset.perContainer, 10) === value);
    });
  }

  /* History */
  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_HISTORY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveHistory(list) {
    try { localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list.slice(0, HISTORY_LIMIT))); } catch (e) {}
  }
  function addHistory(entry) {
    const list = loadHistory();
    const item = {
      startISO: toISODate(entry.startDate),
      endISO: toISODate(entry.result.endDate),
      containers: entry.containers, perContainer: entry.perContainer,
      operation: entry.operation, unit: entry.unit,
      tabletsPerDay: entry.tabletsPerDay, countStartDay: entry.countStartDay,
      days: entry.result.days, t: Date.now(),
    };
    if (list.length > 0) {
      const top = list[0];
      if (top.startISO === item.startISO && top.endISO === item.endISO
        && top.containers === item.containers && top.perContainer === item.perContainer
        && top.tabletsPerDay === item.tabletsPerDay && top.countStartDay === item.countStartDay
        && top.unit === item.unit && top.operation === item.operation) {
        return renderHistory();
      }
    }
    list.unshift(item);
    saveHistory(list);
    renderHistory();
  }
  function renderHistory() {
    const list = loadHistory();
    if (!list.length) { historySection.hidden = true; historyList.innerHTML = ''; return; }
    historySection.hidden = false;
    historyList.innerHTML = '';
    list.forEach(item => {
      const li = document.createElement('li');
      li.className = 'history-item';
      const endDt = parseISODate(item.endISO);
      const startDt = parseISODate(item.startISO);

      const dateSpan = document.createElement('span');
      dateSpan.className = 'history-date';
      dateSpan.textContent = formatDateLong(endDt);

      const detail = document.createElement('span');
      detail.className = 'history-detail';
      const opSym = item.operation === 'subtract' ? '-' : '+';
      const unitLabel = item.unit === 'months' ? 'mo' : 'd';
      let det = `${formatDateShort(startDt)} ${opSym}${item.days}${unitLabel} · ${item.containers}\u00d7${item.perContainer}`;
      if (item.tabletsPerDay !== 1) det += ` /${item.tabletsPerDay}pd`;
      detail.textContent = det;

      li.appendChild(dateSpan);
      li.appendChild(detail);
      li.addEventListener('click', () => {
        startDateInput.value = item.startISO;
        containersInput.value = String(item.containers);
        perContainerInput.value = String(item.perContainer);
        tabletsPerDayInput.value = String(item.tabletsPerDay || 1);
        countStartCheck.checked = !!item.countStartDay;
        document.querySelector(`input[name="operation"][value="${item.operation}"]`).checked = true;
        document.querySelector(`input[name="unit"][value="${item.unit}"]`).checked = true;
        updateActiveChip(item.perContainer);
        updateStartWeekday();
        updateUnitHint();
        doCalculate();
      });
      historyList.appendChild(li);
    });
  }

  /* Service worker */
  let waitingWorker = null;
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;

    function tryRegister() {
      navigator.serviceWorker.register('sw.js', { scope: './' }).then(reg => {
        if (reg.waiting) showUpdateBanner(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(nw);
          });
        });
      }).catch(() => {
        // Registration failed; retry once after 5 seconds (flaky first load).
        setTimeout(tryRegister, 5000);
      });
    }
    tryRegister();

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloading) { reloading = true; window.location.reload(); }
    });
  }
  function showUpdateBanner(w) { waitingWorker = w; updateBanner.hidden = false; }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
