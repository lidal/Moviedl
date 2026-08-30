/**
 * Rendering. Every function here takes state and writes to the DOM; none of
 * them decide anything about the game. Payout maths lives in engine.js.
 */
import {
  ROUND_WEIGHTS, CHIP_OPTIONS, GUESS_MIN, GUESS_MAX,
  volatility, maxStake, currentWeight, currentTolerance, stakeSwing,
} from './engine.js';
import { formatSigned } from './share.js';

const SCALE_MIN = 1;
const SCALE_MAX = 10;

/** Map a rating onto its 0-100% position on a career band. */
function pct(rating) {
  const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, rating));
  return ((clamped - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;
}

const fmtRating = (n) => n.toFixed(1);

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/* ---------------- round strip ---------------- */

export function renderRounds(host, state) {
  host.replaceChildren();
  ROUND_WEIGHTS.forEach((weight, i) => {
    const li = el('li', 'round');
    const call = state.calls.find((c) => c.round === i);

    if (call) li.classList.add('is-called');
    else if (i === state.round && state.status === 'playing') li.classList.add('is-current');
    else if (i < state.round) li.classList.add('is-done');

    li.append(el('span', 'w', `×${weight.toFixed(1)}`));
    li.append(el('span', 'r', call ? call.guess.toFixed(1) : `R${i + 1}`));
    host.append(li);
  });
}

/* ---------------- the dossier ---------------- */

/**
 * What the player knows before round 1.
 *
 * Enough to place the film's register — era, length, who it was sold to — so
 * the opening bet at ×3.0 is an informed gamble rather than a coin flip, but
 * nothing that names it. Rendered once; it does not change as rounds pass.
 */
export function renderDossier(els, puzzle) {
  const facts = [puzzle.year, puzzle.certificate, puzzle.runtime && `${puzzle.runtime} min`]
    .filter(Boolean);

  els.dossierFacts.replaceChildren();
  facts.forEach((fact, i) => {
    if (i > 0) els.dossierFacts.append(el('span', 'sep', ' · '));
    els.dossierFacts.append(document.createTextNode(String(fact)));
  });

  els.dossierGenres.replaceChildren();
  for (const genre of puzzle.genres ?? []) els.dossierGenres.append(el('li', null, genre));

  els.dossierTagline.hidden = !puzzle.tagline;
  if (puzzle.tagline) els.dossierTagline.textContent = `\u201c${puzzle.tagline}\u201d`;
}

/* ---------------- the call ---------------- */

export function renderCall(els, guess) {
  els.lineValue.textContent = guess.toFixed(1);
}

/**
 * Paint the dial: the profit band around the current call, the wider band where
 * losses ramp to the full stake, the dashed anchor showing what the revealed
 * cast implies, and ghost marks for calls already locked in.
 *
 * The bands are the scoring rules made visible. A player never has to be told
 * what the tolerance is — they watch the green window narrow every round.
 */
export function renderDial(els, state, guess, revealedAnchor) {
  const tol = currentTolerance(state);

  els.dial.value = String(guess);
  els.dial.min = String(GUESS_MIN);
  els.dial.max = String(GUESS_MAX);

  band(els.dialInner, guess - tol, guess + tol);
  band(els.dialOuter, guess - tol * 2, guess + tol * 2);
  els.dialAnchor.style.setProperty('--at', `${pct(revealedAnchor)}%`);

  els.dialMarks.replaceChildren();
  for (const call of state.calls) {
    const mark = el('i');
    mark.style.setProperty('--at', `${pct(call.guess)}%`);
    mark.title = `Round ${call.round + 1}: ${call.guess.toFixed(1)}`;
    els.dialMarks.append(mark);
  }

  els.dialLegend.replaceChildren();
  els.dialLegend.append(document.createTextNode('profit inside '));
  els.dialLegend.append(el('b', null, `±${tol.toFixed(2)}`));
  els.dialLegend.append(document.createTextNode(
    ` · full loss past ±${(tol * 2).toFixed(1)}`));
}

function band(node, lo, hi) {
  const a = pct(lo);
  const b = pct(hi);
  node.style.setProperty('--lo', `${a}%`);
  node.style.setProperty('--span', `${b - a}%`);
}

/* ---------------- actor cards ---------------- */

export function renderReveals(host, state, orderedCast, guess) {
  const shown = Math.min(orderedCast.length, state.status === 'complete'
    ? orderedCast.length
    : state.round + 1);

  // Only append what is new, so already-visible cards do not re-animate.
  while (host.children.length > shown) host.lastChild.remove();
  for (let i = host.children.length; i < shown; i++) {
    host.append(actorCard(orderedCast[i], i, guess));
  }
  // The gold marker shows where the current call sits inside each career, so
  // dragging the dial reads straight across every actor on screen.
  host.querySelectorAll('.band-line').forEach((mark) => {
    mark.style.setProperty('--line', `${pct(guess)}%`);
  });
}

function actorCard(actor, index, guess) {
  const vol = volatility(actor.sd);
  const li = el('li', 'actor');

  const top = el('div', 'actor-top');
  const names = el('div');
  names.append(el('h3', 'actor-name', actor.name));
  if (actor.role) names.append(el('p', 'actor-role', actor.role));
  top.append(names, el('span', `tier tier-${vol.tier}`, vol.label));
  li.append(top);

  const wrap = el('div', 'band-wrap');
  const band = el('div', 'band');
  band.setAttribute('role', 'img');
  band.setAttribute(
    'aria-label',
    `${actor.name}: films rated ${fmtRating(actor.min)} to ${fmtRating(actor.max)}, ` +
    `average ${fmtRating(actor.avg)}. Your call is ${fmtRating(guess)}.`,
  );

  const fill = el('div', 'band-fill');
  fill.style.setProperty('--lo', `${pct(actor.min)}%`);
  fill.style.setProperty('--span', `${pct(actor.max) - pct(actor.min)}%`);

  const avg = el('div', 'band-avg');
  avg.style.setProperty('--avg', `${pct(actor.avg)}%`);

  const mark = el('div', 'band-line');
  mark.style.setProperty('--line', `${pct(guess)}%`);

  band.append(fill, avg, mark);
  wrap.append(band);

  const scale = el('div', 'band-scale');
  scale.append(el('span', null, fmtRating(actor.min)));
  const mid = el('span');
  mid.append(document.createTextNode('avg '));
  mid.append(el('b', null, fmtRating(actor.avg)));
  mid.append(document.createTextNode(` · ${actor.credits} films`));
  scale.append(mid, el('span', null, fmtRating(actor.max)));
  wrap.append(scale);

  li.append(wrap, el('p', 'blurb', vol.blurb));
  li.style.animationDelay = `${Math.min(index, 1) * 40}ms`;
  return li;
}

/* ---------------- controls ---------------- */

export function renderControls(host, els, state, stake, onStake) {
  host.hidden = state.status !== 'playing';
  if (host.hidden) return;

  const limit = maxStake(state);
  const weight = currentWeight(state);

  els.chipsLeft.textContent = state.chipsLeft;

  els.chips.replaceChildren();
  for (const amount of CHIP_OPTIONS) {
    const btn = el('button', 'chip', String(amount));
    btn.type = 'button';
    btn.disabled = amount > limit;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(amount === stake));
    if (amount === stake) btn.classList.add('is-active');
    btn.addEventListener('click', () => onStake(amount));
    els.chips.append(btn);
  }

  const swing = stakeSwing(stake, weight);
  els.swing.replaceChildren();
  if (stake > 0) {
    els.swing.append(document.createTextNode(`R${state.round + 1} pays ×${weight.toFixed(1)} · nail it `));
    els.swing.append(el('b', 'up', `+${swing.toLocaleString('en-US')}`));
    els.swing.append(document.createTextNode(' · miss '));
    els.swing.append(el('b', 'down', `−${swing.toLocaleString('en-US')}`));
  } else {
    els.swing.textContent = 'No chips left — you can only sit out.';
  }

  els.lock.disabled = stake === 0;
  els.lockDetail.textContent = stake > 0
    ? `${stake} chips on ${Number(els.dial.value).toFixed(1)}`
    : 'nothing left to stake';

  els.pass.textContent =
    state.round === ROUND_WEIGHTS.length - 1 ? 'Sit out and reveal →' : 'Sit this round out →';
}

/* ---------------- tickets ---------------- */

export function renderTickets(host, list, state) {
  host.hidden = state.calls.length === 0 || state.status === 'complete';
  list.replaceChildren();
  for (const call of state.calls) {
    const li = el('li', 'ticket');
    li.append(el('span', 'ticket-round', `R${call.round + 1}`));
    const desc = el('span');
    desc.append(el('b', 'ticket-call', call.guess.toFixed(1)));
    desc.append(document.createTextNode(` ±${call.tol.toFixed(2)}`));
    li.append(desc);
    li.append(el('span', 'ticket-stake', `${call.chips} × ${call.weight.toFixed(1)}`));
    list.append(li);
  }
}

/* ---------------- result ---------------- */

export function renderResult(els, { puzzle, cast, anchor, result }) {
  els.filmTitle.textContent = puzzle.title;
  els.filmMeta.textContent = [puzzle.year, puzzle.director].filter(Boolean).join(' · ');
  els.filmNote.hidden = !puzzle.note;
  if (puzzle.note) els.filmNote.textContent = puzzle.note;

  els.finalRating.textContent = fmtRating(puzzle.rating);
  els.openingLine.textContent = result.closest
    ? fmtRating(result.closest.guess)
    : fmtRating(anchor);
  els.openingLineLabel.textContent = result.closest ? 'Closest call' : 'Cast implied';

  els.settleList.replaceChildren();
  if (result.tickets.length === 0) {
    els.settleList.append(el('li', 'settle empty', 'You never took a position.'));
  }
  for (const ticket of result.tickets) {
    const li = el('li', `settle ${ticket.won ? 'won' : 'lost'}`);
    li.append(el('span', 'settle-weight', `×${ticket.weight.toFixed(1)}`));

    const desc = el('span', 'settle-desc');
    desc.append(el('b', null, `called ${fmtRating(ticket.guess)}`));
    desc.append(document.createTextNode(
      ` · off by ${ticket.error.toFixed(1)} of ${ticket.tol.toFixed(2)} · ${ticket.chips} chips`));
    li.append(desc);

    li.append(el('span', 'settle-pay', formatSigned(ticket.payout)));
    els.settleList.append(li);
  }

  const dir = result.total > 0 ? 'up' : result.total < 0 ? 'down' : 'flat';
  els.netValue.className = `net-value ${dir}`;
  els.netValue.textContent = formatSigned(result.total);
  els.gradeLabel.textContent = result.grade.label;
  els.gradeNote.textContent = result.grade.note;

  els.bracketFlag?.remove();
  if (result.bracketed) {
    const flag = el('p', 'bracket-flag',
      '◆ You bracketed the answer — calls either side of the truth, and both of them paid.');
    flag.id = 'bracket-flag';
    els.gradeNote.parentElement.after(flag);
    els.bracketFlag = flag;
  }

  els.castList.replaceChildren();
  cast.forEach((actor, i) => {
    const row = el('li', 'cast-row');
    row.append(el('span', 'cast-order', String(i + 1)));
    const who = el('span');
    who.append(el('div', null, actor.name));
    if (actor.role) who.append(el('div', 'cast-role', actor.role));
    row.append(who);
    row.append(el('span', 'cast-stats',
      `avg ${fmtRating(actor.avg)} · σ${actor.sd.toFixed(2)}`));
    els.castList.append(row);
  });
}

/* ---------------- stats ---------------- */

export function renderStats(grid, spark, empty, stats) {
  const winRate = stats.played ? Math.round((stats.profitable / stats.played) * 100) : 0;
  const cells = [
    ['Played', String(stats.played), ''],
    ['Profit days', `${winRate}%`, ''],
    ['Streak', String(stats.streak), stats.streak > 0 ? 'gold' : ''],
    ['Best streak', String(stats.maxStreak), ''],
    ['Best day', stats.best === null ? '—' : formatSigned(stats.best), stats.best > 0 ? 'up' : ''],
    ['Lifetime', formatSigned(stats.lifetime),
      stats.lifetime > 0 ? 'up' : stats.lifetime < 0 ? 'down' : ''],
  ];

  grid.replaceChildren();
  for (const [label, value, tone] of cells) {
    const cell = el('div');
    cell.append(el('dt', null, label));
    cell.append(el('dd', tone, value));
    grid.append(cell);
  }

  const recent = stats.history.slice(-24);
  empty.hidden = recent.length > 0;
  spark.replaceChildren();
  const peak = Math.max(200, ...recent.map((h) => Math.abs(h.total)));
  for (const entry of recent) {
    const bar = el('i', entry.total > 0 ? 'up' : entry.total < 0 ? 'down' : '');
    bar.style.height = `${Math.max(3, (Math.abs(entry.total) / peak) * 52)}px`;
    bar.title = `#${entry.day + 1}: ${formatSigned(entry.total)}`;
    spark.append(bar);
  }
}
