const test = require('node:test');
const assert = require('node:assert/strict');
const { parseChoices, createPoll, castVote, summarizePoll } = require('../utils/leaguePolls');
test('poll choices require 2–5 distinct choices and normalize duplicate matching', () => {
  assert.deepEqual(parseChoices('Alabama | Georgia').choices, ['Alabama', 'Georgia']);
  assert.match(parseChoices('A | a').error, /2–5/);
  assert.match(parseChoices('Only one').error, /2–5/);
  assert.match(parseChoices('A|B|C|D|E|F').error, /2–5/);
});
test('poll creation validates title and options', () => {
  assert.ok(createPoll({title:'',choices:['A','B'],creatorId:'1'}).error);
  assert.ok(createPoll({title:'Q',choices:['A','a'],creatorId:'1'}).error);
  const result = createPoll({title:'Pick one',choices:['A','B'],creatorId:'7',now:'2026-01-01T00:00:00Z'});
  assert.equal(result.poll.title,'Pick one'); assert.equal(result.poll.votes.constructor,Object);
});
test('one voter has one vote and may change it; counts stay consistent', () => {
  const poll = createPoll({title:'Q',choices:['A','B'],creatorId:'1'}).poll;
  assert.equal(castVote(poll,'user1',0).ok,true);
  assert.equal(castVote(poll,'user1',1).changed,true);
  assert.equal(castVote(poll,'user2',0).ok,true);
  assert.deepEqual(summarizePoll(poll),{counts:[1,1],totalVotes:2,uniqueVoters:2});
});
test('closed polls and invalid choices cannot accept votes', () => {
  const poll = createPoll({title:'Q',choices:['A','B'],creatorId:'1'}).poll;
  assert.equal(castVote(poll,'u',2).reason,'invalid-choice');
  poll.closed = true; assert.equal(castVote(poll,'u',0).reason,'closed');
});
test('summary ignores malformed persisted vote indexes', () => {
  const poll = {choices:['A','B'],votes:{a:0,b:9,c:-1,d:'1'}};
  assert.deepEqual(summarizePoll(poll),{counts:[1,0],totalVotes:1,uniqueVoters:4});
});
