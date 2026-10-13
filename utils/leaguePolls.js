'use strict';
const crypto = require('crypto');
function normalize(value) { return String(value || '').trim().toLocaleLowerCase(); }
function parseChoices(input) {
  const raw = String(input || '').split('|').map(x => x.trim()).filter(Boolean);
  const seen = new Set(), choices = [];
  for (const choice of raw) { const key = normalize(choice); if (!key || seen.has(key)) continue; seen.add(key); choices.push(choice.slice(0, 80)); }
  if (choices.length < 2 || choices.length > 5) return { error: 'Provide 2–5 distinct choices separated by |.' };
  return { choices };
}
function createPoll({ title, choices, creatorId, now = new Date().toISOString() }) {
  const cleanTitle = String(title || '').trim().slice(0, 180);
  if (!cleanTitle) return { error: 'Poll title is required.' };
  if (!Array.isArray(choices) || choices.length < 2 || choices.length > 5) return { error: 'Polls require 2–5 choices.' };
  const normalized = choices.map(normalize);
  if (normalized.some((x, i) => !x || normalized.indexOf(x) !== i)) return { error: 'Poll choices must be distinct and non-empty.' };
  return { poll: { id: crypto.randomBytes(5).toString('hex'), title: cleanTitle, choices: choices.map(x => String(x).trim().slice(0, 80)), votes: {}, creatorId: String(creatorId), createdAt: now, closed: false } };
}
function castVote(poll, userId, choiceIndex) {
  if (!poll || poll.closed) return { ok: false, reason: 'closed' };
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= poll.choices.length) return { ok: false, reason: 'invalid-choice' };
  poll.votes ||= {};
  const previous = poll.votes[String(userId)];
  poll.votes[String(userId)] = choiceIndex;
  return { ok: true, changed: previous !== choiceIndex, previous };
}
function summarizePoll(poll) {
  const counts = poll.choices.map(() => 0);
  for (const value of Object.values(poll.votes || {})) if (Number.isInteger(value) && value >= 0 && value < counts.length) counts[value]++;
  return { counts, totalVotes: counts.reduce((a,b)=>a+b,0), uniqueVoters: Object.keys(poll.votes || {}).length };
}
module.exports = { parseChoices, createPoll, castVote, summarizePoll };
