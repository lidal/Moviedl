/**
 * Controller: owns the live state, wires the DOM, persists progress.
 */
import {
  createGame, placeBet, passRound, settle, openingLine, revealOrder, maxStake, CHIP_OPTIONS,
} from './engine.js';
import { hydrateCast, validateData, RATING_SOURCE } from './data/index.js';
import { todaysPuzzle, msUntilRollover } from './daily.js';
import { loadGame, saveGame, loadStats, recordResult, hasSeenHelp, markHelpSeen } from './storage.js';
import { shareText, copyToClipboard } from './share.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);

const els = {
  board: $('board'),
  rounds: $('rounds'),
  lineValue: $('line-value'),
  lineSub: $('line-sub'),
  lineMove: $('line-move'),
  reveals: $('reveals'),
  controls: $('controls'),
  chips: $('chips'),
  chipsLeft: $('chips-left'),
  swing: $('swing'),
  over: $('btn-over'),
  under: $('btn-under'),
  overLine: $('over-line'),
  underLine: $('under-line'),
  pass: $('btn-pass'),
  tickets: $('tickets'),
  ticketList: $('ticket-list'),

  result: $('result'),
  filmTitle: $('film-title'),
  filmMeta: $('film-meta'),
  filmNote: $('film-note'),
  ratingLabel: $('rating-label'),
  finalRating: $('final-rating'),
  openingLine: $('opening-line'),
  settleList: $('settle-list'),
  netValue: $('net-value'),
  gradeLabel: $('grade-label'),
  gradeNote: $('grade-note'),
  castList: $('cast-list'),
  share: $('btn-share'),
  countdown: $('countdown'),

  puzzleNo: $('puzzle-no'),
  help: $('modal-help'),
  stats: $('modal-stats'),
  statGrid: $('stat-grid'),
  spark: $('spark'),
  statsEmpty: $('stats-empty'),
  toast: $('toast'),
};

/* ---------------- boot ---------------- */

const problems = validateData();
if (problems.length) console.warn('[typecast] data problems:', problems);

const { puzzle, number, day } = todaysPuzzle();
const cast = hydrateCast(puzzle);
const ordered = revealOrder(cast);
const opening = openingLine(cast);

let state = loadGame(day) ?? createGame(puzzle, cast);
let stake = defaultStake(state);
let previousLine = null;

els.puzzleNo.textContent = `#${number}`;
els.lineSub.textContent = `${RATING_SOURCE} rating of today\u2019s film`;
els.ratingLabel.textContent = RATING_SOURCE;

/** Largest chip the player can actually afford, so the default is never illegal. */
function defaultStake(s) {
  const limit = maxStake(s);
  const affordable = CHIP_OPTIONS.filter((c) => c <= limit);
  return affordable.length ? affordable[affordable.length - 1] : 0;
}

/* ---------------- render ---------------- */

function render() {
  ui.renderRounds(els.rounds, state);
  ui.renderLine(els, state, previousLine);
  ui.renderReveals(els.reveals, state, ordered);
  ui.renderControls(els.controls, els, state, stake, (amount) => {
    stake = amount;
    render();
  });
  ui.renderTickets(els.tickets, els.ticketList, state);
  previousLine = null;

  if (state.status === 'complete') showResult();
}

function showResult() {
  const result = settle(state, puzzle.rating);
  els.controls.hidden = true;
  els.result.hidden = false;
  els.lineSub.textContent = 'closing line';

  ui.renderResult(els, { puzzle, cast, openingLine: opening, result });

  const stats = recordResult(day, result.total);
  ui.renderStats(els.statGrid, els.spark, els.statsEmpty, stats);

  els.share.onclick = async () => {
    const text = shareText(number, result);
    const copied = await copyToClipboard(text);
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ text });
        return;
      } catch { /* user dismissed; the clipboard copy already happened */ }
    }
    toast(copied ? 'Copied to clipboard' : 'Could not copy');
  };

  startCountdown();
  els.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- actions ---------------- */

function commit(next) {
  previousLine = state.line;
  state = next;
  stake = defaultStake(state);
  saveGame(day, state);
  render();
}

function bet(side) {
  if (state.status !== 'playing' || stake <= 0) return;
  commit(placeBet(state, side, stake));
}

els.over.addEventListener('click', () => bet('OVER'));
els.under.addEventListener('click', () => bet('UNDER'));
els.pass.addEventListener('click', () => {
  if (state.status !== 'playing') return;
  commit(passRound(state));
});

/* ---------------- modals ---------------- */

function openModal(node) {
  node.hidden = false;
  node.querySelector('[data-close]')?.focus();
}
function closeModal(node) { node.hidden = true; }

for (const modal of [els.help, els.stats]) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.hasAttribute('data-close')) closeModal(modal);
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') [els.help, els.stats].forEach(closeModal);
});

$('btn-help').addEventListener('click', () => openModal(els.help));
$('btn-stats').addEventListener('click', () => {
  ui.renderStats(els.statGrid, els.spark, els.statsEmpty, loadStats());
  openModal(els.stats);
});

/* ---------------- countdown ---------------- */

let timer = null;
function startCountdown() {
  const tick = () => {
    const ms = msUntilRollover();
    if (ms <= 0) return location.reload();
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    els.countdown.textContent =
      [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  };
  tick();
  clearInterval(timer);
  timer = setInterval(tick, 1000);
}

/* ---------------- toast ---------------- */

let toastTimer = null;
function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2200);
}

/* ---------------- go ---------------- */

render();

if (!hasSeenHelp()) {
  openModal(els.help);
  markHelpSeen();
}
