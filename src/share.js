import { ROUNDS } from './engine.js';

const WIN = '🟩';
const LOSS = '🟥';
const PASS = '⬛';

/**
 * Wordle-style share card: one square per round, in reveal order, so the
 * shape of someone's day is readable at a glance — where they committed,
 * where they sat out, where it went wrong. The film is never named.
 */
export function shareText(number, result, { signed = formatSigned } = {}) {
  const squares = new Array(ROUNDS).fill(PASS);
  for (const ticket of result.tickets) {
    squares[ticket.round] = ticket.won ? WIN : LOSS;
  }

  const lines = [
    `TYPECAST #${number}  ${signed(result.total)}`,
    squares.join(''),
  ];
  if (result.middled) lines.push('◆ middled the line');
  lines.push('');
  lines.push(shareUrl());
  return lines.join('\n');
}

function shareUrl() {
  if (typeof location === 'undefined') return '';
  return `${location.origin}${location.pathname}`.replace(/index\.html$/, '');
}

export function formatSigned(n) {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toLocaleString('en-US')}`;
}

/** Clipboard with a Safari/HTTP-safe fallback. */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.cssText = 'position:absolute;left:-9999px';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
