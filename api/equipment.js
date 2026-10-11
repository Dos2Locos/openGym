// The equipment types this instance adds to the catalogue, the extra kit its admins say catalogue
// exercises need, and the types its users propose. One file, DATA_DIR/equipment.json:
//
//   { rev, types: [{ id, name, created }], needs: { exId: [typeId] }, proposals: [...] }
//
// Apart from db.json on purpose: that file holds passkey material and is guarded as such, and
// this one is plain catalogue data (0644) the MCP server can read without coming near it.
// Added types carry an `x-` id that never changes when they are renamed, so profiles, custom
// exercises and needs keep pointing at them; a catalogue value can never start with `x-`.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWrite } from './durable.js';
import { CATALOG_EQUIPMENT, NAME_LANGS } from './coach/core/equipment-names.js';
import { libraryHas } from './coach/core/library.js';

export const NAME_MAX = 40;
export const NOTE_MAX = 200;
export const PENDING_MAX = 10;

const empty = () => ({ rev: 0, types: [], needs: {}, proposals: [] });
const isAdded = id => typeof id === 'string' && id.startsWith('x-');
const fold = s => s.trim().toLowerCase();

// Every name a catalogue type goes by — its value and each translation the app ships — folded.
const CATALOG_NAMES = new Set(Object.entries(CATALOG_EQUIPMENT).flatMap(([k, tr]) => [k, ...tr].map(fold)));

const err = (status, error) => ({ status, error });
const cleanName = v => (typeof v === 'string' ? v.trim() : '');

export function createEquipmentStore(dir) {
  const file = path.join(dir, 'equipment.json');

  // Only a missing file starts empty without a word. An unreadable one is kept aside and the
  // server starts with no added types: losing them is recoverable from the copy; refusing to
  // boot over a list of gym kit is not worth it.
  function load() {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return empty(); console.error('equipment.json cannot be read', e.message); return empty(); }
    try {
      const v = JSON.parse(raw);
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
      return {
        rev: Number.isInteger(v.rev) && v.rev >= 0 ? v.rev : 0,
        types: Array.isArray(v.types) ? v.types.filter(x => x && isAdded(x.id) && typeof x.name === 'string') : [],
        needs: v.needs && typeof v.needs === 'object' && !Array.isArray(v.needs) ? v.needs : {},
        proposals: Array.isArray(v.proposals) ? v.proposals.filter(p => p && typeof p.id === 'string') : []
      };
    } catch (e) {
      const aside = `${file}.unreadable-${Date.now()}`;
      try { fs.copyFileSync(file, aside); } catch { /* the original stays where it is anyway */ }
      console.error(`equipment.json cannot be read (${e.message}); kept a copy as ${path.basename(aside)}, starting with no added types`);
      return empty();
    }
  }

  let data = load();

  function save() {
    data.rev++;
    atomicWrite(file, JSON.stringify(data, null, 2), 0o644);
  }

  const typeOf = id => data.types.find(x => x.id === id) || null;

  // A name nobody can take twice: another added type's (main name or any translation), or any
  // catalogue type's in any language.
  const allNames = x => [x.name, ...Object.values(x.names || {})];
  function checkName(name, exceptId) {
    const n = cleanName(name);
    if (!n || n.length > NAME_MAX) return err(400, `name must be 1 to ${NAME_MAX} characters`);
    if (CATALOG_NAMES.has(fold(n)) || data.types.some(x => x.id !== exceptId && allNames(x).some(v => fold(v) === fold(n)))) return err(409, 'that equipment type already exists');
    return { name: n };
  }

  // A type's names per language ({ lang: name }), each checked like a main name; a blank one is
  // left out. undefined when the request carries none, so a rename keeps what the type had.
  function checkNames(raw, exceptId) {
    if (raw === undefined || raw === null) return { names: undefined };
    if (typeof raw !== 'object' || Array.isArray(raw)) return err(400, 'names must map languages to names');
    const names = {};
    for (const [lang, v] of Object.entries(raw)) {
      if (!NAME_LANGS.includes(lang)) return err(400, `not a language of the app: ${String(lang).slice(0, 12)}`);
      if (typeof v !== 'string' || !v.trim()) continue;
      const c = checkName(v, exceptId);
      if (c.error) return c;
      names[lang] = c.name;
    }
    return { names };
  }
  const withNames = (type, names) => {
    if (names === undefined) return;
    if (Object.keys(names).length) type.names = names; else delete type.names;
  };

  function newId() {
    let id;
    do { id = 'x-' + crypto.randomBytes(4).toString('hex'); } while (typeOf(id));
    return id;
  }

  function createType(name, now) {
    const type = { id: newId(), name, created: now };
    data.types.push(type);
    return type;
  }

  const proposalView = p => ({
    id: p.id, name: p.name, note: p.note, at: p.at, status: p.status, resolvedAt: p.resolvedAt,
    typeId: p.typeId, typeName: p.typeId ? typeOf(p.typeId)?.name || null : null
  });

  return {
    file,
    // What every signed-in app reads: no proposals, those are each author's and the admins'.
    view: () => ({ rev: data.rev, types: data.types, needs: data.needs }),

    proposalsOf: uid => data.proposals.filter(p => p.uid === uid).map(proposalView).reverse(),

    propose(uid, body, now = Date.now()) {
      const c = checkName(body?.name);
      if (c.error) return c;
      const note = typeof body?.note === 'string' ? body.note.trim() : '';
      // The proposer's app language: approving keeps the proposed name as that language's.
      const lang = NAME_LANGS.includes(body?.lang) ? body.lang : null;
      if (note.length > NOTE_MAX) return err(400, `note must be at most ${NOTE_MAX} characters`);
      if (data.proposals.filter(p => p.uid === uid && p.status === 'pending').length >= PENDING_MAX) {
        return err(429, `at most ${PENDING_MAX} proposals can wait at once`);
      }
      const p = { id: 'p-' + crypto.randomBytes(6).toString('hex'), uid, name: c.name, note, lang, at: now, status: 'pending', typeId: null, resolvedAt: null };
      data.proposals.push(p);
      save();
      return { status: 201, proposal: proposalView(p) };
    },

    // The admin card: the list, the needs, and every proposal with its author's name, pending
    // first, newest first within each.
    adminView(nameOf) {
      const order = p => (p.status === 'pending' ? 0 : 1);
      const proposals = data.proposals.map(p => ({ ...proposalView(p), uid: p.uid, author: nameOf(p.uid) }))
        .sort((a, b) => order(a) - order(b) || b.at - a.at);
      return { rev: data.rev, types: data.types, needs: data.needs, proposals };
    },

    // { name, names? } creates, { id, name, names? } renames. Renaming keeps the id, so nothing
    // else changes; `names`, when given, replaces the type's translations.
    saveType(body, now = Date.now()) {
      const id = body?.id;
      if (id !== undefined && id !== null && id !== '') {
        if (!isAdded(id)) return err(400, 'catalogue equipment cannot be renamed');
        const type = typeOf(id);
        if (!type) return err(404, 'no such equipment type');
        const c = checkName(body.name, id);
        if (c.error) return c;
        const n = checkNames(body.names, id);
        if (n.error) return n;
        type.name = c.name;
        withNames(type, n.names);
        save();
        return { status: 200, type, created: false };
      }
      const c = checkName(body?.name);
      if (c.error) return c;
      const n = checkNames(body?.names);
      if (n.error) return n;
      const type = createType(c.name, now);
      withNames(type, n.names);
      save();
      return { status: 200, type, created: true };
    },

    // Also takes it off every exercise that needed it. Profiles and custom exercises keep the id;
    // the app treats an id it no longer knows as nothing to filter on.
    deleteType(id) {
      if (!isAdded(id)) return err(400, 'catalogue equipment cannot be deleted');
      const type = typeOf(id);
      if (!type) return err(404, 'no such equipment type');
      data.types = data.types.filter(x => x.id !== id);
      let exercises = 0;
      for (const [exId, list] of Object.entries(data.needs)) {
        if (!list.includes(id)) continue;
        exercises++;
        const keep = list.filter(x => x !== id);
        if (keep.length) data.needs[exId] = keep; else delete data.needs[exId];
      }
      save();
      return { status: 200, type, exercises };
    },

    // The added types a catalogue exercise needs beside its own equipment; [] clears the entry.
    setNeeds(body) {
      const exId = typeof body?.exId === 'string' ? body.exId : '';
      if (!libraryHas(exId)) return err(400, 'no such catalogue exercise');
      if (!Array.isArray(body.types)) return err(400, 'types must be a list');
      const list = [...new Set(body.types)];
      if (list.some(id => !isAdded(id) || !typeOf(id))) return err(400, 'needs can only name added equipment types');
      if (list.length) data.needs[exId] = list; else delete data.needs[exId];
      save();
      return { status: 200, exId, types: list };
    },

    // approve: creates the type, under the proposal's name or the admin's correction of it.
    // merge: points the proposal at an existing added type. reject: nothing is created.
    resolve(body, now = Date.now()) {
      const p = data.proposals.find(x => x.id === body?.id);
      if (!p) return err(404, 'no such proposal');
      if (p.status !== 'pending') return err(400, 'already resolved');
      const action = body.action;
      if (action === 'approve') {
        const c = checkName(cleanName(body.name) || p.name);
        if (c.error) return c;
        const type = createType(c.name, now);
        // What the user proposed stays as the name in their language when the admin corrected it.
        if (p.lang && fold(p.name) !== fold(c.name) && !checkName(p.name, type.id).error) type.names = { [p.lang]: p.name };
        Object.assign(p, { status: 'approved', typeId: type.id, resolvedAt: now });
      } else if (action === 'merge') {
        if (!isAdded(body.typeId) || !typeOf(body.typeId)) return err(400, 'merge needs an existing added equipment type');
        Object.assign(p, { status: 'approved', typeId: body.typeId, resolvedAt: now });
      } else if (action === 'reject') {
        Object.assign(p, { status: 'rejected', resolvedAt: now });
      } else return err(400, 'action must be approve, reject or merge');
      save();
      return { status: 200, proposal: proposalView(p) };
    }
  };
}
