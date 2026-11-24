import {
  cloneDefaults,
  DEFAULT_ENTRY_TYPES,
  DEFAULT_SCHEDULE,
  PAYOUT_PRESETS,
} from './data.js';
import { audio } from './audio.js';

const STORAGE_KEY = 'poker_tournament_clock_v1';

// ==================== UTILIDADES DE FORMATO ====================
const nf = new Intl.NumberFormat('en-US');
const cf = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function formatNum(n) {
  return nf.format(Math.round(Number(n) || 0));
}

function formatMoney(n) {
  return cf.format(Math.round(Number(n) || 0));
}

function formatTimerMs(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatHMS(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function parseTimeToMin(str) {
  const [h, m] = (str || '12:00').split(':').map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 12 * 60;
  return h * 60 + m;
}

function minToTimeStr(totalMin) {
  const wrapped = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==================== ESTADO ====================
function createInitialState() {
  const defs = cloneDefaults();
  return {
    ...defs,
    currentIndex: 0,
    remainingMs: defs.schedule[0].durationMin * 60 * 1000,
    elapsedMs: 0,
    isRunning: false,
    activeTab: 'clock',
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.schedule) || parsed.schedule.length === 0) {
      return createInitialState();
    }
    const base = createInitialState();
    const merged = {
      ...base,
      ...parsed,
      isRunning: false, // Siempre arranca en pausa al recargar para no perder tiempo por accidente
    };
    merged.currentIndex = Math.min(Math.max(0, merged.currentIndex || 0), merged.schedule.length - 1);
    if (typeof merged.remainingMs !== 'number' || Number.isNaN(merged.remainingMs)) {
      merged.remainingMs = (merged.schedule[merged.currentIndex].durationMin || 20) * 60 * 1000;
    }
    return merged;
  } catch {
    return createInitialState();
  }
}

let state = loadState();
let lastTickAt = null;
let tickIntervalId = null;
let lastWarnedMinuteItem = null;
let lastCountdownSecond = null;
let wakeLockSentinel = null;
let toastTimer = null;
let pendingConfirmAction = null;

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tournamentName: state.tournamentName,
        startTime: state.startTime,
        schedule: state.schedule,
        entries: state.entries,
        playersRemaining: state.playersRemaining,
        payoutPreset: state.payoutPreset,
        soundEnabled: state.soundEnabled,
        voiceEnabled: state.voiceEnabled,
        currentIndex: state.currentIndex,
        remainingMs: state.remainingMs,
        elapsedMs: state.elapsedMs,
        activeTab: state.activeTab,
      })
    );
  } catch {
    // Ignorar errores de almacenamiento
  }
}

// ==================== WAKE LOCK (EVITAR QUE SE APAGUE LA TV) ====================
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    if (!wakeLockSentinel) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    }
  } catch {
    // Algunos navegadores bloquean WakeLock si no hay interacción o soporte
  }
}

async function releaseWakeLock() {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {
      // Ignorar
    }
    wakeLockSentinel = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.isRunning) {
    requestWakeLock();
  }
});

// ==================== REFERENCIAS DOM ====================
const $ = (id) => document.getElementById(id);

const els = {
  headerTournamentName: $('headerTournamentName'),
  rebuyStatusPill: $('rebuyStatusPill'),
  wallClock: $('wallClock'),
  btnToggleSound: $('btnToggleSound'),
  soundIcon: $('soundIcon'),
  btnToggleVoice: $('btnToggleVoice'),
  voiceIcon: $('voiceIcon'),
  btnTestSound: $('btnTestSound'),
  btnFullscreen: $('btnFullscreen'),

  // Clock view
  clockPlayersRemaining: $('clockPlayersRemaining'),
  clockTotalBuyins: $('clockTotalBuyins'),
  clockTotalChips: $('clockTotalChips'),
  clockEntriesFoot: $('clockEntriesFoot'),
  clockAvgStack: $('clockAvgStack'),
  clockAvgBB: $('clockAvgBB'),
  clockNextBreakTime: $('clockNextBreakTime'),
  clockNextBreakLabel: $('clockNextBreakLabel'),

  heroStage: $('heroStage'),
  levelBadge: $('levelBadge'),
  levelTimeWindow: $('levelTimeWindow'),
  specialNotePill: $('specialNotePill'),
  pausedPill: $('pausedPill'),
  timerDisplay: $('timerDisplay'),
  progressFill: $('progressFill'),

  blindsPanel: $('blindsPanel'),
  currentSB: $('currentSB'),
  currentBB: $('currentBB'),
  currentAnte: $('currentAnte'),

  breakPanel: $('breakPanel'),
  breakTitle: $('breakTitle'),
  breakSubtitle: $('breakSubtitle'),
  breakResumeInfo: $('breakResumeInfo'),

  nextLevelDetails: $('nextLevelDetails'),
  nextLevelMeta: $('nextLevelMeta'),
  elapsedTime: $('elapsedTime'),

  btnQuickElim: $('btnQuickElim'),
  btnQuickReentry: $('btnQuickReentry'),
  btnPrevLevel: $('btnPrevLevel'),
  btnMinusMin: $('btnMinusMin'),
  btnPlayPause: $('btnPlayPause'),
  playPauseIcon: $('playPauseIcon'),
  playPauseText: $('playPauseText'),
  btnPlusMin: $('btnPlusMin'),
  btnNextLevel: $('btnNextLevel'),
  btnResetLevel: $('btnResetLevel'),

  // Entries view
  entriesPlayersRemaining: $('entriesPlayersRemaining'),
  entriesTotalBuyins: $('entriesTotalBuyins'),
  entriesTotalChips: $('entriesTotalChips'),
  entriesTotalCountSummary: $('entriesTotalCountSummary'),
  entriesAvgStack: $('entriesAvgStack'),
  entriesAvgStackBB: $('entriesAvgStackBB'),
  entriesPrizePool: $('entriesPrizePool'),
  entriesTableBody: $('entriesTableBody'),
  entriesFootQty: $('entriesFootQty'),
  entriesFootChips: $('entriesFootChips'),
  entriesFootCash: $('entriesFootCash'),
  payoutPresetSelect: $('payoutPresetSelect'),
  payoutList: $('payoutList'),
  btnElimPlayer: $('btnElimPlayer'),
  btnAddPlayer: $('btnAddPlayer'),
  btnLoadPdfExample: $('btnLoadPdfExample'),
  btnZeroEntries: $('btnZeroEntries'),

  // Structure view
  inputTournamentName: $('inputTournamentName'),
  inputStartTime: $('inputStartTime'),
  structureSummaryText: $('structureSummaryText'),
  structureTableBody: $('structureTableBody'),
  btnAddLevel: $('btnAddLevel'),
  btnAddBreak: $('btnAddBreak'),
  btnResetTournament: $('btnResetTournament'),
  btnRestoreDefaultSchedule: $('btnRestoreDefaultSchedule'),

  // Toast & Modal
  toast: $('toast'),
  confirmModal: $('confirmModal'),
  confirmTitle: $('confirmTitle'),
  confirmMessage: $('confirmMessage'),
  btnConfirmCancel: $('btnConfirmCancel'),
  btnConfirmOk: $('btnConfirmOk'),
};

// ==================== HELPERS DE CÁLCULO ====================
function computeScheduleTimes() {
  let cursor = parseTimeToMin(state.startTime);
  let totalLevels = 0;
  for (const item of state.schedule) {
    if (item.type === 'level') totalLevels += 1;
  }

  let levelCounter = 0;
  return state.schedule.map((item) => {
    const startMin = cursor;
    const dur = Math.max(1, Number(item.durationMin) || 1);
    const endMin = startMin + dur;
    cursor = endMin;

    let roundNumber = item.round;
    if (item.type === 'level') {
      levelCounter += 1;
      roundNumber = levelCounter;
    }

    return {
      ...item,
      computedRound: roundNumber,
      totalLevels,
      startTimeStr: minToTimeStr(startMin),
      endTimeStr: minToTimeStr(endMin),
    };
  });
}

function getEntryMetrics() {
  let totalChips = 0;
  let totalCash = 0;
  let totalQty = 0;
  let totalBuyins = 0;
  let totalRebuys = 0;
  let totalAddons = 0;

  for (const entry of state.entries) {
    const qty = Math.max(0, Number(entry.count) || 0);
    const chips = Math.max(0, Number(entry.chips) || 0);
    const price = Math.max(0, Number(entry.price) || 0);

    totalQty += qty;
    totalChips += qty * chips;
    totalCash += qty * price;

    if (entry.id === 'buyin') totalBuyins += qty;
    else if (entry.id === 'rebuy' || entry.id === 'doble_rebuy') totalRebuys += qty;
    else totalAddons += qty;
  }

  const players = Math.max(0, Number(state.playersRemaining) || 0);
  const avgStack = players > 0 ? Math.round(totalChips / players) : 0;

  return {
    totalChips,
    totalCash,
    totalQty,
    totalBuyins,
    totalRebuys,
    totalAddons,
    players,
    avgStack,
  };
}

function getReferenceBB() {
  const cur = state.schedule[state.currentIndex];
  if (cur && cur.type === 'level') return cur.bb || 100;
  for (let i = state.currentIndex + 1; i < state.schedule.length; i++) {
    if (state.schedule[i].type === 'level') return state.schedule[i].bb || 100;
  }
  for (let i = state.currentIndex - 1; i >= 0; i--) {
    if (state.schedule[i].type === 'level') return state.schedule[i].bb || 100;
  }
  return 100;
}

// ==================== TOAST & MODAL ====================
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove('show');
  }, 2600);
}

function openConfirm(title, message, onConfirm) {
  els.confirmTitle.textContent = title;
  els.confirmMessage.textContent = message;
  pendingConfirmAction = onConfirm;
  els.confirmModal.classList.remove('hidden');
}

function closeConfirm() {
  pendingConfirmAction = null;
  els.confirmModal.classList.add('hidden');
}

// ==================== RENDERIZADO ====================
function renderTopbar() {
  els.headerTournamentName.textContent = state.tournamentName || 'Torneo de Poker';
  document.title = `${state.tournamentName || 'Reloj de Poker'} — ${formatTimerMs(state.remainingMs)}`;

  const closesIdx = state.schedule.findIndex((i) => i.type === 'break' && i.closesRebuys);
  const pill = els.rebuyStatusPill;
  pill.classList.remove('status-open', 'status-closing', 'status-closed');

  if (closesIdx === -1) {
    pill.textContent = 'TORNEO EN CURSO';
    pill.classList.add('status-open');
  } else if (state.currentIndex < closesIdx) {
    pill.textContent = 'RECOMPRAS ABIERTAS';
    pill.classList.add('status-open');
  } else if (state.currentIndex === closesIdx) {
    pill.textContent = 'FIN DE RECOMPRAS · ADD-ON';
    pill.classList.add('status-closing');
  } else {
    pill.textContent = 'FREEZEOUT · RECOMPRAS CERRADAS';
    pill.classList.add('status-closed');
  }

  audio.soundEnabled = state.soundEnabled;
  audio.voiceEnabled = state.voiceEnabled;
  els.soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
  els.btnToggleSound.classList.toggle('muted', !state.soundEnabled);
  els.btnToggleVoice.classList.toggle('active-toggle', state.voiceEnabled);
  els.btnToggleVoice.classList.toggle('muted', !state.voiceEnabled);
}

function renderClockView() {
  const timed = computeScheduleTimes();
  const current = timed[state.currentIndex] || timed[0];
  const next = timed[state.currentIndex + 1] || null;
  const metrics = getEntryMetrics();
  const refBB = getReferenceBB();

  // Telemetría superior
  els.clockPlayersRemaining.textContent = formatNum(metrics.players);
  els.clockTotalBuyins.textContent = formatNum(metrics.totalBuyins);
  els.clockTotalChips.textContent = formatNum(metrics.totalChips);
  els.clockEntriesFoot.textContent = `${metrics.totalBuyins} BI · ${metrics.totalRebuys} RB · ${metrics.totalAddons} AO`;
  els.clockAvgStack.textContent = metrics.players > 0 ? formatNum(metrics.avgStack) : '—';
  els.clockAvgBB.textContent =
    metrics.players > 0 && refBB > 0
      ? `${metrics.avgStack / refBB >= 100 ? formatNum(metrics.avgStack / refBB) : (metrics.avgStack / refBB).toFixed(1)} BB`
      : '—';

  // Próximo descanso
  if (current.type === 'break') {
    els.clockNextBreakTime.textContent = 'EN CURSO';
    els.clockNextBreakLabel.textContent = `${current.label} · termina ${current.endTimeStr}`;
  } else {
    const nextBreakIdx = timed.findIndex((it, idx) => idx > state.currentIndex && it.type === 'break');
    if (nextBreakIdx !== -1) {
      let msUntilBreak = Math.max(0, state.remainingMs);
      for (let i = state.currentIndex + 1; i < nextBreakIdx; i++) {
        msUntilBreak += (timed[i].durationMin || 20) * 60 * 1000;
      }
      const br = timed[nextBreakIdx];
      els.clockNextBreakTime.textContent = formatHMS(msUntilBreak);
      els.clockNextBreakLabel.textContent = `${br.label} (${br.startTimeStr} · ${br.durationMin}m)`;
    } else {
      els.clockNextBreakTime.textContent = '—';
      els.clockNextBreakLabel.textContent = 'Sin más descansos';
    }
  }

  // Estado visual del Hero Stage
  const totalLevelMs = Math.max(1000, (current.durationMin || 20) * 60 * 1000);
  const pct = Math.max(0, Math.min(100, (state.remainingMs / totalLevelMs) * 100));
  const remSec = Math.ceil(state.remainingMs / 1000);

  els.heroStage.classList.toggle('is-break', current.type === 'break');
  els.heroStage.classList.toggle('is-paused', !state.isRunning);
  els.heroStage.classList.toggle('is-warning', state.isRunning && remSec <= 60 && remSec > 10);
  els.heroStage.classList.toggle('is-critical', state.isRunning && remSec <= 10 && remSec > 0);

  els.pausedPill.classList.toggle('hidden', state.isRunning);
  els.levelTimeWindow.textContent = `${current.startTimeStr} – ${current.endTimeStr}`;

  if (current.note) {
    els.specialNotePill.textContent = current.note;
    els.specialNotePill.classList.remove('hidden');
  } else {
    els.specialNotePill.classList.add('hidden');
  }

  els.timerDisplay.textContent = formatTimerMs(state.remainingMs);
  els.progressFill.style.width = `${pct}%`;

  if (current.type === 'break') {
    els.levelBadge.textContent = `DESCANSO · ${current.durationMin} MIN`;
    els.blindsPanel.classList.add('hidden');
    els.breakPanel.classList.remove('hidden');
    els.breakTitle.textContent = current.label;
    els.breakSubtitle.textContent = current.subtitle || 'Descanso programado del torneo';

    const resumeLevel = timed.slice(state.currentIndex + 1).find((it) => it.type === 'level');
    if (resumeLevel) {
      const anteTxt = resumeLevel.ante > 0 ? ` · Ante ${formatNum(resumeLevel.ante)}` : '';
      els.breakResumeInfo.textContent = `Al regresar (${resumeLevel.startTimeStr}): Nivel ${resumeLevel.computedRound} · ${formatNum(resumeLevel.sb)} / ${formatNum(resumeLevel.bb)}${anteTxt}`;
    } else {
      els.breakResumeInfo.textContent = 'Último segmento del torneo';
    }
  } else {
    els.levelBadge.textContent = `NIVEL ${current.computedRound} DE ${current.totalLevels}`;
    els.blindsPanel.classList.remove('hidden');
    els.breakPanel.classList.add('hidden');

    els.currentSB.textContent = formatNum(current.sb);
    els.currentBB.textContent = formatNum(current.bb);

    if (current.ante > 0) {
      els.currentAnte.textContent = formatNum(current.ante);
      els.currentAnte.classList.remove('no-ante');
    } else {
      els.currentAnte.textContent = 'SIN ANTE';
      els.currentAnte.classList.add('no-ante');
    }
  }

  // Barra inferior: siguiente nivel
  if (next) {
    if (next.type === 'break') {
      els.nextLevelDetails.textContent = `DESCANSO: ${next.label}`;
      els.nextLevelMeta.textContent = `${next.startTimeStr} · ${next.durationMin} min`;
    } else {
      const anteTxt = next.ante > 0 ? ` · Ante ${formatNum(next.ante)}` : ' · Sin ante';
      const noteTxt = next.note ? ` · [${next.note}]` : '';
      els.nextLevelDetails.textContent = `Nivel ${next.computedRound} · ${formatNum(next.sb)} / ${formatNum(next.bb)}${anteTxt}${noteTxt}`;
      els.nextLevelMeta.textContent = `${next.startTimeStr} · ${next.durationMin} min`;
    }
  } else {
    els.nextLevelDetails.textContent = 'Último nivel configurado';
    els.nextLevelMeta.textContent = 'Fin de la estructura';
  }

  // Botón Play / Pausa
  els.btnPlayPause.classList.toggle('is-running', state.isRunning);
  els.playPauseIcon.textContent = state.isRunning ? '⏸' : '▶';
  els.playPauseText.textContent = state.isRunning ? 'PAUSAR' : 'INICIAR';

  els.elapsedTime.textContent = formatHMS(state.elapsedMs);
}

function renderEntriesView() {
  const metrics = getEntryMetrics();
  const refBB = getReferenceBB();

  els.entriesPlayersRemaining.textContent = formatNum(metrics.players);
  els.entriesTotalBuyins.textContent = formatNum(metrics.totalBuyins);
  els.entriesTotalChips.textContent = formatNum(metrics.totalChips);
  els.entriesTotalCountSummary.textContent = `${formatNum(metrics.totalQty)} registros totales (${metrics.totalBuyins} Buy-In, ${metrics.totalRebuys} Rebuy/Doble, ${metrics.totalAddons} Add-On)`;
  els.entriesAvgStack.textContent = metrics.players > 0 ? formatNum(metrics.avgStack) : '—';
  els.entriesAvgStackBB.textContent =
    metrics.players > 0 && refBB > 0
      ? `Equivale a ${(metrics.avgStack / refBB).toFixed(1)} BB (BB actual: ${formatNum(refBB)})`
      : 'Sin jugadores activos';
  els.entriesPrizePool.textContent = formatMoney(metrics.totalCash);

  els.entriesFootQty.textContent = formatNum(metrics.totalQty);
  els.entriesFootChips.textContent = formatNum(metrics.totalChips);
  els.entriesFootCash.textContent = formatMoney(metrics.totalCash);

  els.entriesTableBody.innerHTML = state.entries
    .map((entry, idx) => {
      const subChips = (Number(entry.chips) || 0) * (Number(entry.count) || 0);
      const subCash = (Number(entry.price) || 0) * (Number(entry.count) || 0);
      return `
        <tr data-entry-idx="${idx}">
          <td><strong>${escapeHtml(entry.label)}</strong></td>
          <td class="num">
            <input type="number" min="0" step="1000" class="cell-input entry-chips-input" data-idx="${idx}" value="${entry.chips}" aria-label="Fichas ${escapeHtml(entry.label)}" />
          </td>
          <td class="center">
            <div class="qty-control">
              <button class="qty-btn entry-dec" data-idx="${idx}" type="button">−</button>
              <input type="number" min="0" step="1" class="qty-input entry-count-input" data-idx="${idx}" value="${entry.count}" aria-label="Cantidad ${escapeHtml(entry.label)}" />
              <button class="qty-btn entry-inc" data-idx="${idx}" type="button">+</button>
            </div>
          </td>
          <td class="num gold-text"><strong>${formatNum(subChips)}</strong></td>
          <td class="num">
            <input type="number" min="0" step="50" class="cell-input entry-price-input" data-idx="${idx}" value="${entry.price || 0}" aria-label="Costo ${escapeHtml(entry.label)}" />
          </td>
          <td class="num emerald-text">${formatMoney(subCash)}</td>
        </tr>
      `;
    })
    .join('');

  // Payouts
  els.payoutPresetSelect.value = state.payoutPreset || 'top4';
  const preset = PAYOUT_PRESETS[state.payoutPreset] || PAYOUT_PRESETS.top4;
  if (metrics.totalCash <= 0) {
    els.payoutList.innerHTML = `
      <div class="payout-empty">
        Ingresa el <strong>Costo ($)</strong> en la tabla de la izquierda (por ejemplo, $500 en Buy-In o Rebuy) para ver automáticamente el reparto de premios para el <strong>${escapeHtml(preset.label)}</strong>.
      </div>
    `;
  } else {
    els.payoutList.innerHTML = preset.splits
      .map((pct, i) => {
        const amount = Math.round((metrics.totalCash * pct) / 100);
        return `
          <div class="payout-row">
            <div class="payout-place">
              <span>${i + 1}° Lugar</span>
              <span class="payout-pct">${pct}%</span>
            </div>
            <div class="payout-amount">${formatMoney(amount)}</div>
          </div>
        `;
      })
      .join('');
  }
}

function renderStructureView() {
  const timed = computeScheduleTimes();
  els.inputTournamentName.value = state.tournamentName;
  els.inputStartTime.value = state.startTime;

  const levelCount = timed.filter((i) => i.type === 'level').length;
  const breakCount = timed.filter((i) => i.type === 'break').length;
  const lastEnd = timed.length > 0 ? timed[timed.length - 1].endTimeStr : state.startTime;
  els.structureSummaryText.textContent = `${levelCount} niveles · ${breakCount} descansos · Final estimado: ${lastEnd}`;

  els.structureTableBody.innerHTML = timed
    .map((item, idx) => {
      const isActive = idx === state.currentIndex;
      const rowClasses = [
        isActive ? 'row-active' : '',
        item.type === 'break' ? 'row-break' : '',
        item.note ? 'row-end-marker' : '',
      ]
        .filter(Boolean)
        .join(' ');

      if (item.type === 'break') {
        return `
          <tr class="${rowClasses}" data-sched-idx="${idx}">
            <td colspan="4">
              <div class="round-label-wrap">
                ${isActive ? '<span class="live-dot" title="En curso"></span>' : ''}
                <span class="break-badge">DESCANSO</span>
                <input type="text" class="cell-input cell-input-text sched-label-input" data-idx="${idx}" value="${escapeHtml(item.label)}" style="width: 220px; font-weight: 700;" />
              </div>
            </td>
            <td class="center">
              <input type="number" min="1" max="240" class="cell-input cell-input-sm sched-dur-input" data-idx="${idx}" value="${item.durationMin}" />
            </td>
            <td class="center" style="font-family: var(--font-mono); font-weight: 700;">${item.startTimeStr}</td>
            <td>
              ${item.closesRebuys ? '<span class="note-badge">CIERRA RECOMPRAS</span>' : '<span style="color: var(--text-secondary); font-size: 0.8rem;">Descanso</span>'}
            </td>
            <td class="center">
              <div class="row-actions">
                <button class="btn-jump sched-jump" data-idx="${idx}" type="button">${isActive ? 'Actual' : 'Ir aquí'}</button>
                <button class="btn-del-row sched-del" data-idx="${idx}" type="button" title="Eliminar">✕</button>
              </div>
            </td>
          </tr>
        `;
      }

      return `
        <tr class="${rowClasses}" data-sched-idx="${idx}">
          <td>
            <div class="round-label-wrap">
              ${isActive ? '<span class="live-dot" title="Nivel actual"></span>' : ''}
              <span>Nivel ${item.computedRound}</span>
            </div>
          </td>
          <td class="num">
            <input type="number" min="0" step="50" class="cell-input sched-sb-input" data-idx="${idx}" value="${item.sb}" />
          </td>
          <td class="num">
            <input type="number" min="0" step="50" class="cell-input sched-bb-input" data-idx="${idx}" value="${item.bb}" />
          </td>
          <td class="num">
            <input type="number" min="0" step="50" class="cell-input sched-ante-input" data-idx="${idx}" value="${item.ante}" />
          </td>
          <td class="center">
            <input type="number" min="1" max="180" class="cell-input cell-input-sm sched-dur-input" data-idx="${idx}" value="${item.durationMin}" />
          </td>
          <td class="center" style="font-family: var(--font-mono);">${item.startTimeStr}</td>
          <td>
            <input type="text" class="cell-input cell-input-text sched-note-input" data-idx="${idx}" value="${escapeHtml(item.note || '')}" placeholder="—" />
          </td>
          <td class="center">
            <div class="row-actions">
              <button class="btn-jump sched-jump" data-idx="${idx}" type="button">${isActive ? 'Actual' : 'Ir aquí'}</button>
              <button class="btn-del-row sched-del" data-idx="${idx}" type="button" title="Eliminar">✕</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderAll() {
  renderTopbar();
  renderClockView();
  if (state.activeTab === 'entries') renderEntriesView();
  if (state.activeTab === 'structure') renderStructureView();
}

// ==================== LÓGICA DEL RELOJ ====================
function goToIndex(idx, { announce = false, keepRunning = state.isRunning } = {}) {
  const clamped = Math.min(Math.max(0, idx), state.schedule.length - 1);
  state.currentIndex = clamped;
  const item = state.schedule[clamped];
  state.remainingMs = Math.max(1, item.durationMin || 20) * 60 * 1000;
  lastWarnedMinuteItem = null;
  lastCountdownSecond = null;

  if (!keepRunning) {
    pauseTimer(false);
  } else {
    lastTickAt = Date.now();
  }

  if (announce) {
    audio.announceItem(item);
  }

  saveState();
  renderAll();
}

function startTimer() {
  if (state.isRunning) return;
  audio.ensureContext();
  state.isRunning = true;
  lastTickAt = Date.now();
  requestWakeLock();

  if (tickIntervalId) clearInterval(tickIntervalId);
  tickIntervalId = setInterval(onTick, 150);

  renderTopbar();
  renderClockView();
}

function pauseTimer(shouldSave = true) {
  if (state.isRunning && lastTickAt) {
    const delta = Math.max(0, Date.now() - lastTickAt);
    state.remainingMs = Math.max(0, state.remainingMs - delta);
    state.elapsedMs += delta;
  }
  state.isRunning = false;
  lastTickAt = null;
  if (tickIntervalId) {
    clearInterval(tickIntervalId);
    tickIntervalId = null;
  }
  releaseWakeLock();
  if (shouldSave) saveState();
  renderTopbar();
  renderClockView();
}

function togglePlayPause() {
  if (state.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function adjustTimeSeconds(deltaSec) {
  const item = state.schedule[state.currentIndex];
  const maxMs = Math.max(item.durationMin * 60 * 1000, state.remainingMs + Math.abs(deltaSec) * 1000);
  state.remainingMs = Math.min(maxMs, Math.max(0, state.remainingMs + deltaSec * 1000));
  if (state.remainingMs > 60000) lastWarnedMinuteItem = null;
  if (state.remainingMs > 6000) lastCountdownSecond = null;
  saveState();
  renderClockView();
}

function onTick() {
  if (!state.isRunning || !lastTickAt) return;
  const now = Date.now();
  const delta = now - lastTickAt;
  lastTickAt = now;

  state.remainingMs -= delta;
  state.elapsedMs += delta;

  const remSec = Math.ceil(state.remainingMs / 1000);

  // Aviso de 1 minuto
  const currentKey = `${state.currentIndex}-${state.schedule[state.currentIndex]?.id}`;
  if (remSec === 60 && lastWarnedMinuteItem !== currentKey && state.schedule[state.currentIndex].durationMin >= 2) {
    lastWarnedMinuteItem = currentKey;
    audio.playOneMinuteWarning();
  }

  // Cuenta regresiva últimos 5 segundos
  if (remSec <= 5 && remSec >= 1 && lastCountdownSecond !== remSec) {
    lastCountdownSecond = remSec;
    audio.playCountdownTick(remSec === 1);
  }

  // Fin del nivel / descanso
  if (state.remainingMs <= 0) {
    if (state.currentIndex < state.schedule.length - 1) {
      const overflow = Math.abs(state.remainingMs);
      state.currentIndex += 1;
      const nextItem = state.schedule[state.currentIndex];
      state.remainingMs = Math.max(1000, (nextItem.durationMin || 20) * 60 * 1000 - overflow);
      lastWarnedMinuteItem = null;
      lastCountdownSecond = null;

      audio.announceItem(nextItem);
      showToast(
        nextItem.type === 'break'
          ? `Descanso: ${nextItem.label} (${nextItem.durationMin} min)`
          : `Nivel ${nextItem.round || state.currentIndex + 1}: ${formatNum(nextItem.sb)} / ${formatNum(nextItem.bb)}`
      );
      saveState();
      renderAll();
      return;
    } else {
      state.remainingMs = 0;
      audio.playLevelUp();
      pauseTimer();
      showToast('Estructura finalizada');
      return;
    }
  }

  renderClockView();
  document.title = `${state.tournamentName || 'Reloj de Poker'} — ${formatTimerMs(state.remainingMs)}`;
}

// ==================== NAVEGACIÓN DE PESTAÑAS ====================
function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === `view-${tabName}`);
  });
  saveState();
  renderAll();
}

// ==================== MODO TV / FULLSCREEN ====================
async function toggleFullscreenTV() {
  if (state.activeTab !== 'clock') {
    switchTab('clock');
  }
  const entering = !document.fullscreenElement && !document.body.classList.contains('tv-mode');
  if (entering) {
    document.body.classList.add('tv-mode');
    els.btnFullscreen.classList.add('active-toggle');
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Si el navegador (como Safari en iPhone) no soporta Fullscreen API, mantenemos body.tv-mode
    }
    showToast('Modo TV activado (toca el botón de TV o Esc para salir)');
  } else {
    document.body.classList.remove('tv-mode');
    els.btnFullscreen.classList.remove('active-toggle');
    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignorar
      }
    }
  }
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    document.body.classList.remove('tv-mode');
    els.btnFullscreen.classList.remove('active-toggle');
  }
});

// ==================== EVENTOS ====================
function bindEvents() {
  // Pestañas
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Topbar controles
  els.btnToggleSound.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    saveState();
    renderTopbar();
    showToast(state.soundEnabled ? 'Sonidos activados' : 'Sonidos silenciados');
  });

  els.btnToggleVoice.addEventListener('click', () => {
    state.voiceEnabled = !state.voiceEnabled;
    audio.voiceEnabled = state.voiceEnabled;
    saveState();
    renderTopbar();
    if (state.voiceEnabled) {
      audio.speak('Anuncios de voz activados.');
      showToast('Anuncios de voz en español activados');
    } else {
      showToast('Anuncios de voz desactivados');
    }
  });

  els.btnTestSound.addEventListener('click', () => {
    audio.ensureContext();
    const prev = audio.soundEnabled;
    audio.soundEnabled = true;
    audio.playLevelUp();
    audio.soundEnabled = prev;
    showToast('Campana de cambio de nivel');
  });

  els.btnFullscreen.addEventListener('click', toggleFullscreenTV);

  // Controles de transporte del reloj
  els.btnPlayPause.addEventListener('click', togglePlayPause);

  els.btnPrevLevel.addEventListener('click', () => {
    if (state.currentIndex > 0) {
      goToIndex(state.currentIndex - 1, { announce: false, keepRunning: state.isRunning });
      showToast('Nivel anterior');
    }
  });

  els.btnNextLevel.addEventListener('click', () => {
    if (state.currentIndex < state.schedule.length - 1) {
      goToIndex(state.currentIndex + 1, { announce: true, keepRunning: state.isRunning });
    }
  });

  els.btnMinusMin.addEventListener('click', () => adjustTimeSeconds(-60));
  els.btnPlusMin.addEventListener('click', () => adjustTimeSeconds(60));

  els.btnResetLevel.addEventListener('click', () => {
    const cur = state.schedule[state.currentIndex];
    state.remainingMs = (cur.durationMin || 20) * 60 * 1000;
    lastWarnedMinuteItem = null;
    lastCountdownSecond = null;
    saveState();
    renderClockView();
    showToast('Tiempo del nivel reiniciado');
  });

  // Jugadores rápidos (en reloj y en vista de entradas)
  const changePlayers = (delta) => {
    state.playersRemaining = Math.max(0, (Number(state.playersRemaining) || 0) + delta);
    saveState();
    renderAll();
  };
  els.btnQuickElim.addEventListener('click', () => changePlayers(-1));
  els.btnQuickReentry.addEventListener('click', () => changePlayers(1));
  els.btnElimPlayer.addEventListener('click', () => changePlayers(-1));
  els.btnAddPlayer.addEventListener('click', () => changePlayers(1));

  // Vista Entradas: delegación de eventos
  els.entriesTableBody.addEventListener('click', (e) => {
    const dec = e.target.closest('.entry-dec');
    const inc = e.target.closest('.entry-inc');
    if (!dec && !inc) return;
    const idx = parseInt((dec || inc).dataset.idx, 10);
    const entry = state.entries[idx];
    if (!entry) return;

    const delta = inc ? 1 : -1;
    const nextVal = Math.max(0, (Number(entry.count) || 0) + delta);
    const appliedDelta = nextVal - (Number(entry.count) || 0);
    entry.count = nextVal;

    if (entry.isPlayerEntry && appliedDelta !== 0) {
      state.playersRemaining = Math.max(0, (Number(state.playersRemaining) || 0) + appliedDelta);
    }

    saveState();
    renderAll();
  });

  els.entriesTableBody.addEventListener('change', (e) => {
    const idx = parseInt(e.target.dataset.idx, 10);
    const entry = state.entries[idx];
    if (!entry) return;

    if (e.target.classList.contains('entry-chips-input')) {
      entry.chips = Math.max(0, parseInt(e.target.value, 10) || 0);
    } else if (e.target.classList.contains('entry-count-input')) {
      const oldCount = Number(entry.count) || 0;
      const newCount = Math.max(0, parseInt(e.target.value, 10) || 0);
      entry.count = newCount;
      if (entry.isPlayerEntry) {
        state.playersRemaining = Math.max(0, (Number(state.playersRemaining) || 0) + (newCount - oldCount));
      }
    } else if (e.target.classList.contains('entry-price-input')) {
      entry.price = Math.max(0, parseFloat(e.target.value) || 0);
    }

    saveState();
    renderAll();
  });

  els.payoutPresetSelect.addEventListener('change', (e) => {
    state.payoutPreset = e.target.value;
    saveState();
    renderEntriesView();
  });

  els.btnLoadPdfExample.addEventListener('click', () => {
    state.entries = DEFAULT_ENTRY_TYPES.map((item) => ({ ...item }));
    state.playersRemaining = 32;
    saveState();
    renderAll();
    showToast('Cargados los datos del PDF (6,480,000 fichas)');
  });

  els.btnZeroEntries.addEventListener('click', () => {
    openConfirm(
      'Poner contadores en cero',
      'Se pondrán en 0 todas las cantidades de Buy-In, Rebuy, Add-On y jugadores activos (se conservarán las fichas por unidad).',
      () => {
        state.entries.forEach((e) => {
          e.count = 0;
        });
        state.playersRemaining = 0;
        saveState();
        renderAll();
        showToast('Contadores puestos en cero para un nuevo torneo');
      }
    );
  });

  // Vista Estructura: configuración general
  els.inputTournamentName.addEventListener('input', (e) => {
    state.tournamentName = e.target.value;
    saveState();
    renderTopbar();
  });

  els.inputStartTime.addEventListener('change', (e) => {
    state.startTime = e.target.value || '12:00';
    saveState();
    renderAll();
  });

  els.btnAddLevel.addEventListener('click', () => {
    const lastLevel = [...state.schedule].reverse().find((it) => it.type === 'level');
    const nextSB = lastLevel ? Math.round(lastLevel.sb * 1.5) : 100;
    const nextBB = lastLevel ? Math.round(lastLevel.bb * 1.5) : 200;
    state.schedule.push({
      id: `lvl_${Date.now()}`,
      type: 'level',
      round: state.schedule.filter((i) => i.type === 'level').length + 1,
      sb: nextSB,
      bb: nextBB,
      ante: nextBB,
      durationMin: 20,
    });
    saveState();
    renderAll();
    showToast('Nivel agregado al final de la estructura');
  });

  els.btnAddBreak.addEventListener('click', () => {
    state.schedule.push({
      id: `brk_${Date.now()}`,
      type: 'break',
      label: 'DESCANSO',
      subtitle: 'Descanso programado',
      durationMin: 15,
      closesRebuys: false,
    });
    saveState();
    renderAll();
    showToast('Descanso agregado al final de la estructura');
  });

  els.btnRestoreDefaultSchedule.addEventListener('click', () => {
    openConfirm(
      'Restaurar estructura original del PDF',
      'Se restaurarán los 30 niveles y los 2 descansos (COMIDA y FIN DE RECOMPRAS) exactamente como en tu hoja original.',
      () => {
        pauseTimer(false);
        state.schedule = DEFAULT_SCHEDULE.map((item) => ({ ...item }));
        state.currentIndex = 0;
        state.remainingMs = state.schedule[0].durationMin * 60 * 1000;
        state.startTime = '12:00';
        saveState();
        renderAll();
        showToast('Estructura original del PDF restaurada');
      }
    );
  });

  els.btnResetTournament.addEventListener('click', () => {
    openConfirm(
      'Reiniciar reloj del torneo',
      'El reloj volverá al Nivel 1 (20:00) en pausa y el tiempo transcurrido se reiniciará a 00:00:00. Tus entradas y estructura se conservarán.',
      () => {
        pauseTimer(false);
        state.currentIndex = 0;
        state.remainingMs = (state.schedule[0]?.durationMin || 20) * 60 * 1000;
        state.elapsedMs = 0;
        lastWarnedMinuteItem = null;
        lastCountdownSecond = null;
        saveState();
        renderAll();
        showToast('Reloj reiniciado al Nivel 1');
      }
    );
  });

  // Delegación de eventos en tabla de estructura
  els.structureTableBody.addEventListener('click', (e) => {
    const jumpBtn = e.target.closest('.sched-jump');
    if (jumpBtn) {
      const idx = parseInt(jumpBtn.dataset.idx, 10);
      goToIndex(idx, { announce: false, keepRunning: false });
      switchTab('clock');
      const item = state.schedule[idx];
      showToast(item.type === 'break' ? `Saltaste a: ${item.label}` : `Saltaste al Nivel ${item.round || idx + 1}`);
      return;
    }

    const delBtn = e.target.closest('.sched-del');
    if (delBtn) {
      if (state.schedule.length <= 1) {
        showToast('Debe haber al menos un nivel en la estructura');
        return;
      }
      const idx = parseInt(delBtn.dataset.idx, 10);
      state.schedule.splice(idx, 1);
      if (state.currentIndex >= state.schedule.length) {
        state.currentIndex = state.schedule.length - 1;
      }
      if (idx === state.currentIndex) {
        state.remainingMs = (state.schedule[state.currentIndex].durationMin || 20) * 60 * 1000;
      }
      saveState();
      renderAll();
      showToast('Fila eliminada');
    }
  });

  els.structureTableBody.addEventListener('change', (e) => {
    const idx = parseInt(e.target.dataset.idx, 10);
    const item = state.schedule[idx];
    if (!item) return;

    if (e.target.classList.contains('sched-sb-input')) {
      item.sb = Math.max(0, parseInt(e.target.value, 10) || 0);
    } else if (e.target.classList.contains('sched-bb-input')) {
      item.bb = Math.max(0, parseInt(e.target.value, 10) || 0);
    } else if (e.target.classList.contains('sched-ante-input')) {
      item.ante = Math.max(0, parseInt(e.target.value, 10) || 0);
    } else if (e.target.classList.contains('sched-dur-input')) {
      item.durationMin = Math.max(1, parseInt(e.target.value, 10) || 1);
      if (idx === state.currentIndex && !state.isRunning) {
        state.remainingMs = item.durationMin * 60 * 1000;
      }
    } else if (e.target.classList.contains('sched-label-input')) {
      item.label = e.target.value.trim() || 'DESCANSO';
    } else if (e.target.classList.contains('sched-note-input')) {
      item.note = e.target.value.trim();
    }

    saveState();
    renderAll();
  });

  // Modal confirmación
  els.btnConfirmCancel.addEventListener('click', closeConfirm);
  els.btnConfirmOk.addEventListener('click', () => {
    const fn = pendingConfirmAction;
    closeConfirm();
    if (fn) fn();
  });
  els.confirmModal.addEventListener('click', (e) => {
    if (e.target === els.confirmModal) closeConfirm();
  });

  // Atajos de teclado
  document.addEventListener('keydown', (e) => {
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (!els.confirmModal.classList.contains('hidden')) {
      if (e.key === 'Escape') closeConfirm();
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (state.currentIndex < state.schedule.length - 1) {
        goToIndex(state.currentIndex + 1, { announce: true, keepRunning: state.isRunning });
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (state.currentIndex > 0) {
        goToIndex(state.currentIndex - 1, { announce: false, keepRunning: state.isRunning });
      }
    } else if (e.key === '+' || e.key === '=') {
      adjustTimeSeconds(60);
    } else if (e.key === '-' || e.key === '_') {
      adjustTimeSeconds(-60);
    } else if (e.key.toLowerCase() === 'r') {
      const cur = state.schedule[state.currentIndex];
      state.remainingMs = (cur.durationMin || 20) * 60 * 1000;
      saveState();
      renderClockView();
      showToast('Nivel reiniciado');
    } else if (e.key.toLowerCase() === 'm') {
      state.soundEnabled = !state.soundEnabled;
      saveState();
      renderTopbar();
      showToast(state.soundEnabled ? 'Sonidos activados' : 'Sonidos silenciados');
    } else if (e.key.toLowerCase() === 'f') {
      toggleFullscreenTV();
    } else if (e.key === 'Escape' && document.body.classList.contains('tv-mode')) {
      document.body.classList.remove('tv-mode');
    }
  });
}

// ==================== RELOJ DE HORA ACTUAL ====================
function updateWallClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  els.wallClock.textContent = `${hh}:${mm}`;
}

// ==================== INICIO ====================
function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    });
  }
}

function setupIOSAudioUnlock() {
  const unlockOnce = () => {
    audio.unlock();
    window.removeEventListener('touchstart', unlockOnce);
    window.removeEventListener('pointerdown', unlockOnce);
  };
  window.addEventListener('touchstart', unlockOnce, { passive: true });
  window.addEventListener('pointerdown', unlockOnce, { passive: true });
}

function init() {
  bindEvents();
  setupIOSAudioUnlock();
  registerServiceWorker();
  updateWallClock();
  setInterval(updateWallClock, 5000);
  switchTab(state.activeTab || 'clock');
}

init();
