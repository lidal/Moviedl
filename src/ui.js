/**
 * Rendering. Every function here takes state and writes to the DOM; none of
 * them decide anything about the game. Payout maths lives in engine.js.
 */
import {
  ROUND_WEIGHTS, CHIP_OPTIONS, volatility, maxStake, currentWeight, stakeSwing,
} from './engine.js';
import { formatSigned } from './share.js';

const SCALE_MIN = 1;
const SCALE_MAX = 10;

/** Map a rating onto its 0-100% position on a career band. */
function pct(rating) {
  const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, rating));
  return ((clamped - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;
}

const fmtLine = (n) => n.toFixed(2);
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
    const bet = state.bets.find((b) => b.round === i);

    if (bet) li.classList.add(bet.side === 'OVER' ? 'is-over' : 'is-under');
    else if (i === state.round && state.status === 'playing') li.classList.add('is-current');
    else if (i < state.round) li.classList.add('is-done');

    li.append(el('span', 'w', `×${weight.toFixed(1)}`));
    li.append(el('span', 'r', bet ? (bet.side === 'OVER' ? 'OVR' : 'UND') : `R${i + 1}`));
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

/* ---------------- the line ---------------- */

export function renderLine(els, state, previousLine) {
  els.lineValue.textContent = fmtLine(state.line);
  els.overLine.textContent = fmtLine(state.line);
  els.underLine.textContent = fmtLine(state.line);

  const moved = previousLine != null && previousLine !== state.line;
  els.lineMove.hidden = !moved;
  if (moved) {
    const up = state.line > previousLine;
    const delta = Math.abs(state.line - previousLine);
    els.lineMove.className = `line-move ${up ? 'up' : 'down'}`;
    els.lineMove.textContent =
      `${up ? '▲' : '▼'} ${delta.toFixed(2)} — your money moved the line`;
    els.lineValue.classList.add('bump');
    setTimeout(() => els.lineValue.classList.remove('bump'), 300);
  }
}

/* ---------------- actor cards ---------------- */

export function renderReveals(host, state, orderedCast) {
  const shown = Math.min(orderedCast.length, state.status === 'complete'
    ? orderedCast.length
    : state.round + 1);

  // Only append what is new, so already-visible cards do not re-animate.
  while (host.children.length > shown) host.lastChild.remove();
  for (let i = host.children.length; i < shown; i++) {
    host.append(actorCard(orderedCast[i], i, state.line));
  }
  // The gold line marker tracks the live line on every card.
  host.querySelectorAll('.band-line').forEach((mark) => {
    mark.style.setProperty('--line', `${pct(state.line)}%`);
  });
}

function actorCard(actor, index, line) {
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
    `average ${fmtRating(actor.avg)}. Current line ${fmtLine(line)}.`,
  );

  const fill = el('div', 'band-fill');
  fill.style.setProperty('--lo', `${pct(actor.min)}%`);
  fill.style.setProperty('--span', `${pct(actor.max) - pct(actor.min)}%`);

  const avg = el('div', 'band-avg');
  avg.style.setProperty('--avg', `${pct(actor.avg)}%`);

  const mark = el('div', 'band-line');
  mark.style.setProperty('--line', `${pct(line)}%`);

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
    els.swing.append(document.createTextNode(`round ${state.round + 1} pays ×${weight.toFixed(1)} · win `));
    els.swing.append(el('b', 'up', `+${swing.toLocaleString('en-US')}`));
    els.swing.append(document.createTextNode(' · lose '));
    els.swing.append(el('b', 'down', `−${swing.toLocaleString('en-US')}`));
  } else {
    els.swing.textContent = 'No chips left — you can only sit out.';
  }

  const noChips = stake === 0;
  els.over.disabled = noChips;
  els.under.disabled = noChips;
  els.over.style.opacity = noChips ? '.35' : '';
  els.under.style.opacity = noChips ? '.35' : '';
  els.pass.textContent =
    state.round === ROUND_WEIGHTS.length - 1 ? 'Sit out and reveal →' : 'Sit this round out →';
}

/* ---------------- tickets ---------------- */

export function renderTickets(host, list, state) {
  host.hidden = state.bets.length === 0 || state.status === 'complete';
  list.replaceChildren();
  for (const bet of state.bets) {
    const li = el('li', `ticket ${bet.side.toLowerCase()}`);
    li.append(el('span', 'ticket-round', `R${bet.round + 1}`));
    const desc = el('span');
    desc.append(el('b', 'ticket-side', bet.side));
    desc.append(document.createTextNode(` ${fmtLine(bet.line)}`));
    li.append(desc);
    li.append(el('span', 'ticket-stake', `${bet.chips} × ${bet.weight.toFixed(1)}`));
    list.append(li);
  }
}

/* ---------------- result ---------------- */

export function renderResult(els, { puzzle, cast, openingLine, result }) {
  els.filmTitle.textContent = puzzle.title;
  els.filmMeta.textContent = [puzzle.year, puzzle.director].filter(Boolean).join(' · ');
  els.filmNote.hidden = !puzzle.note;
  if (puzzle.note) els.filmNote.textContent = puzzle.note;

  els.finalRating.textContent = fmtRating(puzzle.rating);
  els.openingLine.textContent = fmtLine(openingLine);

  els.settleList.replaceChildren();
  if (result.tickets.length === 0) {
    els.settleList.append(el('li', 'settle empty', 'You never took a position.'));
  }
  for (const ticket of result.tickets) {
    const li = el('li', `settle ${ticket.won ? 'won' : 'lost'}`);
    li.append(el('span', 'settle-weight', `×${ticket.weight.toFixed(1)}`));

    const desc = el('span', 'settle-desc');
    desc.append(el('b', null, `${ticket.side} ${fmtLine(ticket.line)}`));
    desc.append(document.createTextNode(` · ${ticket.chips} chips · R${ticket.round + 1}`));
    li.append(desc);

    li.append(el('span', 'settle-pay', formatSigned(ticket.payout)));
    els.settleList.append(li);
  }

  const dir = result.total > 0 ? 'up' : result.total < 0 ? 'down' : 'flat';
  els.netValue.className = `net-value ${dir}`;
  els.netValue.textContent = formatSigned(result.total);
  els.gradeLabel.textContent = result.grade.label;
  els.gradeNote.textContent = result.grade.note;

  els.middleFlag?.remove();
  if (result.middled) {
    const flag = el('p', 'middle-flag',
      '◆ You middled the line — you bet both ways and the rating landed in the gap. Both tickets paid.');
    flag.id = 'middle-flag';
    els.gradeNote.parentElement.after(flag);
    els.middleFlag = flag;
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
