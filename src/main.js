/**
 * Controller: owns the live state, wires the DOM, persists progress.
 */
import {
  createGame, placeCall, passRound, settle, consensus, revealOrder, maxStake,
  openingGuess, snapGuess, CHIP_OPTIONS,
} from './engine.js';
import { hydrateCast, validateData, RATING_SOURCE } from './data/index.js';
import { msUntilRollover } from './daily.js';
import { loadGame, saveGame, loadStats, recordResult, hasSeenHelp, markHelpSeen } from './storage.js';
import { maybeReset, selectPuzzle, slate, gotoFilm } from './dev.js';
import { shareText, copyToClipboard } from './share.js';
import {
  renderRounds, renderDossier, renderCall, renderDial, renderReveals,
  renderControls, renderTickets, renderResult, renderStats,
} from './ui.js';

const $ = (id) => document.getElementById(id);

const els = {
  board: $('board'),
  rounds: $('rounds'),
  dossierFacts: $('dossier-facts'),
  dossierGenres: $('dossier-genres'),
  dossierTagline: $('dossier-tagline'),
  lineLabel: $('line-label'),
  lineValue: $('line-value'),
  lineSub: $('line-sub'),
  reveals: $('reveals'),
  dial: $('dial'),
  dialInner: $('dial-inner'),
  dialOuter: $('dial-outer'),
  dialAnchor: $('dial-anchor'),
  dialMarks: $('dial-marks'),
  dialLegend: $('dial-legend'),
  lock: $('btn-lock'),
  lockDetail: $('lock-detail'),
  controls: $('controls'),
  chips: $('chips'),
  chipsLeft: $('chips-left'),
  swing: $('swing'),
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
  openingLineLabel: $('opening-line-label'),
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

let state = loadGame(day, puzzle.id) ?? createGame(puzzle, cast);
let stake = defaultStake(state);

/** Actors the player has met so far — the only thing the anchor may look at. */
function revealed() {
  return ordered.slice(0, Math.min(ordered.length, state.round + 1));
}

let guess = openingGuess(state, revealed());

els.puzzleNo.textContent = override ? 'TEST' : `#${number}`;
if (override) {
  els.puzzleNo.classList.add('is-test');
  els.puzzleNo.title = `Test mode (${override}) — this result is not recorded in your stats.`;
}
els.lineSub.textContent = `your guess at its ${RATING_SOURCE} rating`;
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
  renderCall(els, guess);
  renderDial(els, state, guess, consensus(revealed()));
  // Once the film is up, the marker on every career band shows where it
  // actually landed, not where you guessed — that is the payoff.
  renderReveals(els.reveals, state, ordered,
    state.status === 'complete' ? puzzle.rating : guess);
  renderControls(els.controls, els, state, stake, (amount) => {
    stake = amount;
    render();
  });
  renderTickets(els.tickets, els.ticketList, state);

  if (state.status === 'complete') showResult();
}

function showResult() {
  const result = settle(state, puzzle.rating);
  els.controls.hidden = true;
  els.result.hidden = false;
  els.lineLabel.textContent = 'The rating';
  els.lineValue.textContent = puzzle.rating.toFixed(1);
  els.lineSub.textContent = `what ${RATING_SOURCE} actually says`;

  renderResult(els, { puzzle, cast, anchor: consensus(ordered), result });

  // A test run must not fabricate a streak in the real record.
  const stats = override ? loadStats() : recordResult(day, result.total);
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

function commit(next) {
  state = next;
  stake = defaultStake(state);
  guess = openingGuess(state, revealed());
  saveGame(day, state);
  render();
}

function lockIn() {
  if (state.status !== 'playing' || stake <= 0) return;
  commit(placeCall(state, guess, stake));
}

els.dial.addEventListener('input', () => {
  guess = snapGuess(Number(els.dial.value));
  render();
});

els.lock.addEventListener('click', lockIn);
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
