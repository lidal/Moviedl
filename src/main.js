/**
 * Controller: owns the live state, wires the DOM, persists progress.
 */
import {
  createGame, placeBet, passRound, settle, lineFor, revealOrder, revealedBy,
  maxStake, CHIP_OPTIONS,
} from './engine.js';
import { hydrateCast, validateData, RATING_SOURCE } from './data/index.js';
import { msUntilRollover } from './daily.js';
import { loadGame, saveGame, loadStats, recordResult, hasSeenHelp, markHelpSeen } from './storage.js';
import { maybeReset, selectPuzzle, slate, gotoFilm } from './dev.js';
import { shareText, copyToClipboard } from './share.js';
import {
  renderRounds, renderDossier, renderLine, renderReveals, renderControls,
  renderTickets, renderResult, renderStats,
} from './ui.js';

const $ = (id) => document.getElementById(id);

const els = {
  board: $('board'),
  rounds: $('rounds'),
  dossierFacts: $('dossier-facts'),
  dossierGenres: $('dossier-genres'),
  dossierTagline: $('dossier-tagline'),
  lineValue: $('line-value'),
  lineSub: $('line-sub'),
  lineMove: $('line-move'),
  reveals: $('reveals'),
  controls: $('controls'),
  chips: $('chips'),
  chipsLeft: $('chips-left'),
  swing: $('swing'),
  travel: $('travel'),
  over: $('btn-over'),
  under: $('btn-under'),
  overLine: $('over-line'),
  underLine: $('under-line'),
  pass: $('btn-pass'),
  passNote: $('pass-note'),
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

maybeReset();
const { puzzle, number, day, override } = selectPuzzle();
const cast = hydrateCast(puzzle);
const ordered = revealOrder(cast);
const opening = lineFor(revealedBy(ordered, 0));

let state = loadGame(day, puzzle.id) ?? createGame(puzzle, cast);
let stake = defaultStake(state);
let previousLine = null;
let lastWasBet = false;

els.puzzleNo.textContent = override ? 'TEST' : `#${number}`;
if (override) {
  els.puzzleNo.classList.add('is-test');
  els.puzzleNo.title = `Test mode (${override}) — this result is not recorded in your stats.`;
}
els.lineSub.textContent = `${RATING_SOURCE} rating of today\u2019s film`;
renderDossier(els, puzzle);
els.ratingLabel.textContent = RATING_SOURCE;

/** Largest chip the player can actually afford, so the default is never illegal. */
function defaultStake(s) {
  const limit = maxStake(s);
  const affordable = CHIP_OPTIONS.filter((c) => c <= limit);
  return affordable.length ? affordable[affordable.length - 1] : 0;
}

/* ---------------- render ---------------- */

function render() {
  renderRounds(els.rounds, state);
  renderLine(els, state, previousLine, lastWasBet);
  renderReveals(els.reveals, state, ordered);
  renderControls(els.controls, els, state, stake, (amount) => {
    stake = amount;
    render();
  });
  renderTickets(els.tickets, els.ticketList, state);
  previousLine = null;

  if (state.status === 'complete') showResult();
}

function showResult() {
  const result = settle(state, puzzle.rating);
  els.controls.hidden = true;
  els.result.hidden = false;
  els.lineSub.textContent = 'closing line';

  renderResult(els, { puzzle, cast, openingLine: opening, result });

  // A test run must not fabricate a streak in the real record.
  const stats = override ? loadStats() : recordResult(day, result.total, result.hadAction);
  renderStats(els.statGrid, els.spark, els.statsEmpty, stats);

  if (override) renderFilmPicker();

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

function commit(next, wasBet = false) {
  previousLine = state.line;
  lastWasBet = wasBet;
  state = next;
  stake = defaultStake(state);
  saveGame(day, state);
  render();
}

function bet(side) {
  if (state.status !== 'playing' || stake <= 0) return;
  commit(placeBet(state, side, stake, ordered), true);
}

els.over.addEventListener('click', () => bet('OVER'));
els.under.addEventListener('click', () => bet('UNDER'));
els.pass.addEventListener('click', () => {
  if (state.status !== 'playing') return;
  commit(passRound(state, ordered));
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
  renderStats(els.statGrid, els.spark, els.statsEmpty, loadStats());
  openModal(els.stats);
});

/* ---------------- test-mode film picker ---------------- */

/** In test mode, offer the rest of the slate so films can be tried back to back. */
function renderFilmPicker() {
  if (document.getElementById('film-picker')) return;

  const box = document.createElement('div');
  box.id = 'film-picker';
  box.className = 'film-picker';

  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = 'Test mode — play another';
  box.append(label);

  const list = document.createElement('div');
  list.className = 'film-picker-list';
  for (const film of slate()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `${film.title} (${film.year})`;
    if (film.id === puzzle.id) btn.classList.add('is-current');
    btn.addEventListener('click', () => gotoFilm(film.id));
    list.append(btn);
  }
  box.append(list);
  els.result.append(box);
}

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
