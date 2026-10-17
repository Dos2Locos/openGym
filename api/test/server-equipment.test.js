/* The equipment routes against a real server.js in a child (same harness as
   server-admin-delete.test.js): who may read, propose and manage, and what each answer is. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const mintSession = uid => {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};
const ADMIN = 'u_adm_1', USER = 'u_usr_1';

async function startServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-eqr-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [
      { id: ADMIN, name: 'Adminna', created: new Date().toISOString(), admin: true },
      { id: USER, name: 'Lola', created: new Date().toISOString() },
    ],
    creds: [], subs: [], invites: [],
  }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost' },
  });
  const h = { log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  h.call = async (method, route, { uid, body } = {}) => {
    const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:8080' };
    if (uid) headers.Cookie = `gymsid=${mintSession(uid)}`;
    const r = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  h.audit = () => fs.readFileSync(path.join(dataDir, 'audit.log'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  return h;
}

test('nothing without a session', async t => {
  const h = await startServer(t);
  assert.equal((await h.call('GET', '/api/equipment')).status, 401);
  assert.equal((await h.call('GET', '/api/equipment/proposals')).status, 401);
  assert.equal((await h.call('POST', '/api/equipment/proposals', { body: { name: 'Step' } })).status, 401);
  assert.equal((await h.call('GET', '/api/admin/equipment')).status, 401);
});

test('a signed-in user reads an empty list on a fresh instance', async t => {
  const h = await startServer(t);
  const r = await h.call('GET', '/api/equipment', { uid: USER });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { rev: 0, types: [], needs: {} });
  assert.equal(fs.existsSync(path.join(h.dataDir, 'equipment.json')), false);
});

test('a user proposes: 201, then 409 for an existing name, 429 past ten pending', async t => {
  const h = await startServer(t);
  const r = await h.call('POST', '/api/equipment/proposals', { uid: USER, body: { name: 'Barra de dips', note: 'la tengo en el parque' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.proposal.status, 'pending');
  assert.equal((await h.call('POST', '/api/equipment/proposals', { uid: USER, body: { name: 'dumbbell' } })).status, 409);
  assert.equal((await h.call('POST', '/api/equipment/proposals', { uid: USER, body: { name: 'x'.repeat(41) } })).status, 400);
  for (let i = 0; i < 9; i++) assert.equal((await h.call('POST', '/api/equipment/proposals', { uid: USER, body: { name: 'Kit ' + i } })).status, 201);
  assert.equal((await h.call('POST', '/api/equipment/proposals', { uid: USER, body: { name: 'Kit 10' } })).status, 429);
  const mine = await h.call('GET', '/api/equipment/proposals', { uid: USER });
  assert.equal(mine.body.proposals.length, 10);
  assert.equal(mine.body.proposals.at(-1).name, 'Barra de dips');
  assert.equal(mine.body.proposals.at(-1).note, 'la tengo en el parque');
});

test('the admin routes refuse a user who is not an admin', async t => {
  const h = await startServer(t);
  for (const [m, route, body] of [
    ['GET', '/api/admin/equipment'], ['POST', '/api/admin/equipment/types', { name: 'Step' }],
    ['POST', '/api/admin/equipment/types/delete', { id: 'x-1' }], ['POST', '/api/admin/equipment/needs', { exId: '0336', types: [] }],
    ['POST', '/api/admin/equipment/proposals/resolve', { id: 'p-1', action: 'reject' }],
  ]) assert.equal((await h.call(m, route, { uid: USER, body })).status, 403, route);
  assert.deepEqual((await h.call('GET', '/api/equipment', { uid: USER })).body.types, []);
});

test('the admin manages types, needs and proposals, and each step is logged', async t => {
  const h = await startServer(t);
  const step = (await h.call('POST', '/api/admin/equipment/types', { uid: ADMIN, body: { name: 'Step' } })).body.type;
  assert.match(step.id, /^x-/);
  assert.equal((await h.call('POST', '/api/admin/equipment/types', { uid: ADMIN, body: { name: 'step' } })).status, 409);
  assert.equal((await h.call('POST', '/api/admin/equipment/types', { uid: ADMIN, body: { id: 'dumbbell', name: 'Pesas' } })).status, 400);
  assert.equal((await h.call('POST', '/api/admin/equipment/types/delete', { uid: ADMIN, body: { id: 'dumbbell' } })).status, 400);
  assert.equal((await h.call('POST', '/api/admin/equipment/needs', { uid: ADMIN, body: { exId: '9999999', types: [step.id] } })).status, 400);
  assert.equal((await h.call('POST', '/api/admin/equipment/needs', { uid: ADMIN, body: { exId: '0336', types: ['bench'] } })).status, 400);
  assert.equal((await h.call('POST', '/api/admin/equipment/needs', { uid: ADMIN, body: { exId: '0336', types: [step.id] } })).status, 200);
  assert.deepEqual((await h.call('GET', '/api/equipment', { uid: USER })).body.needs, { '0336': [step.id] });

  // proposals: approve (with a corrected name), merge, reject
  const propose = async name => (await h.call('POST', '/api/equipment/proposals', { uid: USER, body: { name } })).body.proposal;
  const [p1, p2, p3] = [await propose('Barra dips'), await propose('Escalón'), await propose('Algo')];
  const admin = await h.call('GET', '/api/admin/equipment', { uid: ADMIN });
  assert.equal(admin.body.proposals.length, 3);
  assert.equal(admin.body.proposals[0].author, 'Lola');
  const resolve = body => h.call('POST', '/api/admin/equipment/proposals/resolve', { uid: ADMIN, body });
  assert.equal((await resolve({ id: p1.id, action: 'approve', name: 'Barra de dips' })).status, 200);
  assert.equal((await resolve({ id: p2.id, action: 'merge', typeId: step.id })).status, 200);
  assert.equal((await resolve({ id: p3.id, action: 'reject' })).status, 200);
  const mine = (await h.call('GET', '/api/equipment/proposals', { uid: USER })).body.proposals;
  assert.deepEqual(mine.map(p => [p.status, p.typeName]), [['rejected', null], ['approved', 'Step'], ['approved', 'Barra de dips']]);

  // deleting a type clears it from the needs
  const del = await h.call('POST', '/api/admin/equipment/types/delete', { uid: ADMIN, body: { id: step.id } });
  assert.deepEqual([del.status, del.body.exercises], [200, 1]);
  const list = (await h.call('GET', '/api/equipment', { uid: USER })).body;
  assert.deepEqual(list.needs, {});
  assert.deepEqual(list.types.map(x => x.name), ['Barra de dips']);

  const evs = h.audit().map(r => r.ev).filter(e => e.startsWith('admin.equipment.'));
  assert.deepEqual(evs, ['admin.equipment.create', 'admin.equipment.needs', 'admin.equipment.approve',
    'admin.equipment.merge', 'admin.equipment.reject', 'admin.equipment.delete']);
});

test('names per language through the routes, and a proposal’s language on approval', async t => {
  const h = await startServer(t);
  const r = await h.call('POST', '/api/admin/equipment/types', { uid: ADMIN, body: { name: 'Barra de dips', names: { en: 'Dip bar' } } });
  assert.equal(r.status, 200);
  assert.deepEqual((await h.call('GET', '/api/equipment', { uid: USER })).body.types[0].names, { en: 'Dip bar' });
  assert.equal((await h.call('POST', '/api/admin/equipment/types', { uid: ADMIN, body: { id: r.body.type.id, name: 'Barra de dips', names: { xx: 'x' } } })).status, 400);
  assert.equal((await h.call('POST', '/api/admin/equipment/types', { uid: ADMIN, body: { name: 'Otra', names: { en: 'dip bar' } } })).status, 409);
  const p = (await h.call('POST', '/api/equipment/proposals', { uid: USER, body: { name: 'Aerobic step', lang: 'en' } })).body.proposal;
  await h.call('POST', '/api/admin/equipment/proposals/resolve', { uid: ADMIN, body: { id: p.id, action: 'approve', name: 'Step' } });
  const step = (await h.call('GET', '/api/equipment', { uid: USER })).body.types.find(x => x.name === 'Step');
  assert.deepEqual(step.names, { en: 'Aerobic step' });
});
