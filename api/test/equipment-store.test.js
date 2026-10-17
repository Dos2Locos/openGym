/* DATA_DIR/equipment.json (equipment.js): the instance's added equipment types, the needs on
   catalogue exercises and the users' proposals. Created on the first change, read back on the
   next start, and an unreadable copy never takes the server down with it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEquipmentStore, PENDING_MAX, NAME_MAX } from '../equipment.js';

const tmp = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-eq-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('no file reads as an empty list, and the first change creates it', t => {
  const dir = tmp(t);
  const eq = createEquipmentStore(dir);
  assert.deepEqual(eq.view(), { rev: 0, types: [], needs: {} });
  assert.equal(fs.existsSync(eq.file), false, 'reading never writes');
  const r = eq.saveType({ name: '  Roman chair ' }, 5);
  assert.equal(r.status, 200);
  assert.match(r.type.id, /^x-[0-9a-f]{8}$/);
  assert.equal(r.type.name, 'Roman chair');
  const disk = JSON.parse(fs.readFileSync(eq.file, 'utf8'));
  assert.equal(disk.rev, 1);
  assert.equal(fs.statSync(eq.file).mode & 0o777, 0o644);
});

test('a restart reads back what was saved', t => {
  const dir = tmp(t);
  const a = createEquipmentStore(dir);
  const { type } = a.saveType({ name: 'Step' });
  a.setNeeds({ exId: '0336', types: [type.id] });
  a.propose('u1', { name: 'Dip bar', note: 'at the park' });
  const b = createEquipmentStore(dir);
  assert.deepEqual(b.view(), a.view());
  assert.equal(b.view().rev, 3);
  assert.equal(b.proposalsOf('u1')[0].name, 'Dip bar');
});

test('an unreadable file is kept aside and the server starts with no added types', t => {
  const dir = tmp(t);
  fs.writeFileSync(path.join(dir, 'equipment.json'), '{"rev": 3, "types": [');
  const eq = createEquipmentStore(dir);
  assert.deepEqual(eq.view(), { rev: 0, types: [], needs: {} });
  assert.equal(fs.readdirSync(dir).filter(f => f.startsWith('equipment.json.unreadable-')).length, 1);
  assert.equal(eq.saveType({ name: 'Step' }).status, 200, 'and it still saves');
});

test('names: 1 to 40 characters, never one the list or the catalogue already has', t => {
  const eq = createEquipmentStore(tmp(t));
  assert.equal(eq.saveType({ name: '   ' }).status, 400);
  assert.equal(eq.saveType({ name: 'a'.repeat(NAME_MAX + 1) }).status, 400);
  const { type } = eq.saveType({ name: 'Step' });
  assert.equal(eq.saveType({ name: ' STEP ' }).status, 409);
  assert.equal(eq.saveType({ name: 'Dumbbell' }).status, 409);
  assert.equal(eq.saveType({ name: 'mancuerna' }).status, 409, 'a catalogue type in another language');
  assert.equal(eq.saveType({ id: type.id, name: 'step' }).status, 200, 'its own name, recased');
  assert.equal(eq.view().types.length, 1);
});

test('catalogue types are neither renamed nor deleted', t => {
  const eq = createEquipmentStore(tmp(t));
  assert.equal(eq.saveType({ id: 'dumbbell', name: 'Dumbbells' }).status, 400);
  assert.equal(eq.deleteType('dumbbell').status, 400);
  assert.equal(eq.deleteType('x-nope').status, 404);
});

test('renaming keeps the id; deleting takes the type off every exercise', t => {
  const eq = createEquipmentStore(tmp(t));
  const a = eq.saveType({ name: 'Balón basket' }).type;
  const b = eq.saveType({ name: 'Step' }).type;
  assert.equal(eq.saveType({ id: a.id, name: 'Balón de baloncesto' }).type.id, a.id);
  eq.setNeeds({ exId: '0336', types: [a.id, b.id] });
  eq.setNeeds({ exId: '0662', types: [a.id] });
  const r = eq.deleteType(a.id);
  assert.equal(r.exercises, 2);
  assert.deepEqual(eq.view().needs, { '0336': [b.id] });
});

test('needs: catalogue exercises and added types only; an empty list clears', t => {
  const eq = createEquipmentStore(tmp(t));
  const { type } = eq.saveType({ name: 'Step' });
  assert.equal(eq.setNeeds({ exId: 'nope', types: [type.id] }).status, 400);
  assert.equal(eq.setNeeds({ exId: '0336', types: ['dumbbell'] }).status, 400);
  assert.equal(eq.setNeeds({ exId: '0336', types: ['x-gone'] }).status, 400);
  assert.equal(eq.setNeeds({ exId: '0336', types: [type.id] }).status, 200);
  assert.equal(eq.setNeeds({ exId: '0336', types: [] }).status, 200);
  assert.deepEqual(eq.view().needs, {});
});

test('proposals: existing names refused, at most 10 pending per user', t => {
  const eq = createEquipmentStore(tmp(t));
  eq.saveType({ name: 'Step' });
  assert.equal(eq.propose('u1', { name: 'step ' }).status, 409);
  assert.equal(eq.propose('u1', { name: 'Kettlebell' }).status, 409);
  assert.equal(eq.propose('u1', { name: 'Dip bar', note: 'x'.repeat(201) }).status, 400);
  for (let i = 0; i < PENDING_MAX; i++) assert.equal(eq.propose('u1', { name: 'Thing ' + i }).status, 201);
  assert.equal(eq.propose('u1', { name: 'One more' }).status, 429);
  assert.equal(eq.propose('u2', { name: 'One more' }).status, 201, 'the limit is per user');
});

test('resolving: approve creates the type, merge points at one, reject creates nothing', t => {
  const eq = createEquipmentStore(tmp(t));
  const ball = eq.saveType({ name: 'Balón de baloncesto' }).type;
  const p1 = eq.propose('u1', { name: 'Barra dips' }).proposal;
  const p2 = eq.propose('u1', { name: 'Balón basket' }).proposal;
  const p3 = eq.propose('u1', { name: 'Cosa rara' }).proposal;

  const a = eq.resolve({ id: p1.id, action: 'approve', name: 'Barra de dips' });
  assert.equal(a.proposal.status, 'approved');
  assert.equal(a.proposal.typeName, 'Barra de dips');
  assert.ok(eq.view().types.some(x => x.name === 'Barra de dips'));

  assert.equal(eq.resolve({ id: p2.id, action: 'merge', typeId: 'x-nope' }).status, 400);
  const m = eq.resolve({ id: p2.id, action: 'merge', typeId: ball.id });
  assert.deepEqual([m.proposal.status, m.proposal.typeName], ['approved', 'Balón de baloncesto']);

  const r = eq.resolve({ id: p3.id, action: 'reject' });
  assert.equal(r.proposal.status, 'rejected');
  assert.equal(eq.view().types.length, 2);
  assert.equal(eq.resolve({ id: p3.id, action: 'approve' }).status, 400, 'already resolved');
  assert.deepEqual(eq.proposalsOf('u1').map(p => p.status), ['rejected', 'approved', 'approved']);
  assert.equal(eq.proposalsOf('u2').length, 0);
});

test('names per language: set on create and rename, validated like a main name', t => {
  const eq = createEquipmentStore(tmp(t));
  const r = eq.saveType({ name: 'Barra de dips', names: { en: ' Dip bar ', de: 'Dipbarren', fr: '' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.type.names, { en: 'Dip bar', de: 'Dipbarren' });
  const id = r.type.id;
  assert.equal(eq.saveType({ id, name: 'Barra de dips' }).type.names.en, 'Dip bar', 'a rename without names keeps them');
  assert.deepEqual(eq.saveType({ id, name: 'Barra de dips', names: { en: 'Dip station' } }).type.names, { en: 'Dip station' });
  assert.equal(eq.saveType({ id, name: 'Barra de dips', names: {} }).type.names, undefined);
  assert.equal(eq.saveType({ id, name: 'Barra de dips', names: { xx: 'Nope' } }).status, 400);
  assert.equal(eq.saveType({ id, name: 'Barra de dips', names: { 'de-CH': 'Dipbarren' } }).status, 400, 'derived languages read their base');
  assert.equal(eq.saveType({ id, name: 'Barra de dips', names: { en: 'Dumbbell' } }).status, 409);
  eq.saveType({ name: 'Step', names: { en: 'Aerobic step' } });
  assert.equal(eq.saveType({ id, name: 'Barra de dips', names: { en: 'aerobic step' } }).status, 409, 'another type’s translation');
  assert.equal(eq.saveType({ name: 'Aerobic step' }).status, 409);
});

test('approving keeps the proposer’s name in their language when the admin corrects it', t => {
  const eq = createEquipmentStore(tmp(t));
  const p = eq.propose('u1', { name: 'Dip bar', lang: 'en' }).proposal;
  const a = eq.resolve({ id: p.id, action: 'approve', name: 'Barra de dips' });
  const type = eq.view().types.find(x => x.id === a.proposal.typeId);
  assert.equal(type.name, 'Barra de dips');
  assert.deepEqual(type.names, { en: 'Dip bar' });
  const q = eq.propose('u1', { name: 'Step', lang: 'xx' }).proposal;
  eq.resolve({ id: q.id, action: 'approve' });
  assert.equal(eq.view().types.find(x => x.name === 'Step').names, undefined, 'an unknown language is not kept');
});
