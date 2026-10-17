import { create } from 'zustand'
import { ALL_EQUIPMENT, NAME_LANGS, isAddedEq, _setInstance } from './equipment.js'
import { EXIDX } from './exercises.js'
import { t } from './i18n-core.js'

// The equipment types this instance adds to the catalogue, and the extra kit it says catalogue
// exercises need (see lib/equipment.js). Kept apart from S: S syncs per user and merges between
// devices, and this list is the instance's, the same for everyone on it.
//
// Two copies, never mixed:
//   SERVER_KEY  the last list GET /api/equipment returned — what a signed-in app shows offline
//   LOCAL_KEY   the device's own list, with no server (a guest, a phone in local mode). It is not
//               sent anywhere on sign-in and is still there when the device goes back to local.
export const SERVER_KEY = 'gym_equipment_v1'
export const LOCAL_KEY = 'gym_equipment_local_v1'
// The phone's copies of both, in its private files: WebView storage can be evicted, as for the
// state itself (lib/mobile.js). Written through `setInstanceMirror`, read back at boot.
const FILES = { [SERVER_KEY]: 'opengym-equipment-server.json', [LOCAL_KEY]: 'opengym-equipment-local.json' }
let mirror = null
export function setInstanceMirror(writeFile) { mirror = writeFile }

// Boot on the phone: a copy localStorage lost comes back from its file, then shows.
export async function restoreInstanceFiles(readFile) {
  for (const [key, file] of Object.entries(FILES)) {
    try {
      if (storage()?.getItem(key)) continue
      const saved = await readFile(file)
      if (saved) storage()?.setItem(key, JSON.stringify(normalizeInstance(saved)))
    } catch { /* nothing to restore */ }
  }
  if (useInstanceEquipment.getState().source === 'local') showLocalInstance(); else showServerInstance()
}

export const NAME_MAX = 40
export const emptyInstance = () => ({ rev: 0, types: [], needs: {} })

// Whatever was stored, as a list the rest of the app can trust: unreadable or missing reads as
// empty, a type without an `x-` id or a name is dropped, and a need keeps only types that exist.
export function normalizeInstance(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyInstance()
  const types = []
  const seen = new Set()
  for (const x of Array.isArray(raw.types) ? raw.types : []) {
    if (!x || !isAddedEq(x.id) || seen.has(x.id) || typeof x.name !== 'string' || !x.name.trim()) continue
    seen.add(x.id)
    const type = { id: x.id, name: x.name.trim().slice(0, NAME_MAX), created: Number(x.created) || 0 }
    const names = cleanNames(x.names)
    if (names) type.names = names
    types.push(type)
  }
  const needs = {}
  if (raw.needs && typeof raw.needs === 'object' && !Array.isArray(raw.needs)) {
    for (const [exId, list] of Object.entries(raw.needs)) {
      const keep = Array.isArray(list) ? [...new Set(list.filter(id => seen.has(id)))] : []
      if (keep.length) needs[exId] = keep
    }
  }
  return { rev: Number.isFinite(raw.rev) && raw.rev >= 0 ? raw.rev : 0, types, needs }
}

// A type's names per language, keeping only languages the app has and non-blank names; null if none.
function cleanNames(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out = {}
  for (const l of NAME_LANGS) {
    const v = typeof raw[l] === 'string' ? raw[l].trim().slice(0, NAME_MAX) : ''
    if (v) out[l] = v
  }
  return Object.keys(out).length ? out : null
}

const storage = () => { try { return globalThis.localStorage || null } catch { return null } }

export function readCache(key) {
  try {
    const s = storage()?.getItem(key)
    return normalizeInstance(s ? JSON.parse(s) : null)
  } catch { return emptyInstance() }
}

export function writeCache(key, inst) {
  try { storage()?.setItem(key, JSON.stringify(inst)) } catch { /* private mode, quota: the in-memory copy stands */ }
  if (mirror) Promise.resolve(mirror(FILES[key], inst)).catch(() => {})
}

// The list the screens use right now: the server's when signed in, the device's own otherwise.
// Starts on the server's cached copy so a signed-in app opened offline shows it at once; the
// session code switches it (showServerInstance / showLocalInstance) as soon as it knows which one applies.
export const useInstanceEquipment = create(() => {
  const inst = readCache(SERVER_KEY)
  _setInstance(inst)
  return { source: 'server', inst }
})

function show(source, inst) {
  _setInstance(inst)
  useInstanceEquipment.setState({ source, inst })
}

// A list just fetched from the server: cached for offline starts, and shown if signed in.
export function setServerInstance(raw) {
  const inst = normalizeInstance(raw)
  writeCache(SERVER_KEY, inst)
  if (useInstanceEquipment.getState().source === 'server') show('server', inst)
  return inst
}
// Asks the server for its list (`fetchList` is the GET, from lib/api.js) — at sign-in, and again
// when the app comes back, at most once a minute. Offline, or a server that predates the route,
// the cached list stands.
const REFRESH_MIN_MS = 60000
let lastFetch = 0
let fetching = null
export function refreshInstanceEquipment(fetchList, { force = false, now = Date.now() } = {}) {
  if (fetching) return fetching
  if (!force && now - lastFetch < REFRESH_MIN_MS) return Promise.resolve(null)
  lastFetch = now
  fetching = (async () => {
    try { return setServerInstance(await fetchList()) } catch { return null } finally { fetching = null }
  })()
  return fetching
}

export function showServerInstance() { show('server', readCache(SERVER_KEY)) }
export function showLocalInstance() { show('local', readCache(LOCAL_KEY)) }
export const localInstance = () => readCache(LOCAL_KEY)

// A local edit: stored, mirrored to the phone's file by the caller that owns it, and shown when
// the device is on its own list.
export function saveLocalInstance(inst) {
  const next = normalizeInstance({ ...inst, rev: (inst.rev || 0) + 1 })
  writeCache(LOCAL_KEY, next)
  if (useInstanceEquipment.getState().source === 'local') show('local', next)
  return next
}

/* Editing helpers for the device's own list, with the server's rules (api/server.js), so a list
   made without a server never holds what an admin could not have made. Each returns
   { inst } with a new list, or { error } with one of: 'name' (empty or too long), 'exists',
   'unknown' (no such added type), 'exercise' (not in the catalogue), 'type' (a need that is not
   an existing added type). The input is never changed. */

const clean = name => (typeof name === 'string' ? name.trim() : '')
const fold = s => s.trim().toLowerCase()

// A name already taken: by another added type (its main name or any translation), or by a
// catalogue type, in English or in the language the app is shown in.
const allNames = x => [x.name, ...Object.values(x.names || {})]
function nameTaken(inst, name, exceptId) {
  const n = fold(name)
  if (inst.types.some(x => x.id !== exceptId && allNames(x).some(v => fold(v) === n))) return true
  return ALL_EQUIPMENT.some(k => fold(k) === n || fold(t(k)) === n)
}

function checkName(inst, name, exceptId) {
  const n = clean(name)
  if (!n || n.length > NAME_MAX) return { error: 'name' }
  if (nameTaken(inst, n, exceptId)) return { error: 'exists' }
  return { name: n }
}

const newTypeId = () => 'x-' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6)

export function addType(inst, name, { id = newTypeId(), now = Date.now() } = {}) {
  const c = checkName(inst, name)
  if (c.error) return c
  return { inst: { ...inst, types: [...inst.types, { id, name: c.name, created: now }] }, id }
}

export function renameType(inst, id, name) {
  if (!inst.types.some(x => x.id === id)) return { error: 'unknown' }
  const c = checkName(inst, name, id)
  if (c.error) return c
  return { inst: { ...inst, types: inst.types.map(x => (x.id === id ? { ...x, name: c.name } : x)) } }
}

// A type's names per language, replacing the ones it had: a blank name drops that language. Each
// follows the rules of a main name; a language the app does not have is refused ('lang').
export function setNames(inst, id, names) {
  if (!inst.types.some(x => x.id === id)) return { error: 'unknown' }
  if (!names || typeof names !== 'object' || Array.isArray(names)) return { error: 'lang' }
  const out = {}
  for (const [l, v] of Object.entries(names)) {
    if (!NAME_LANGS.includes(l)) return { error: 'lang' }
    const n = clean(v)
    if (!n) continue
    if (n.length > NAME_MAX) return { error: 'name' }
    if (nameTaken(inst, n, id)) return { error: 'exists' }
    out[l] = n
  }
  return { inst: { ...inst, types: inst.types.map(x => {
    if (x.id !== id) return x
    const { names: _old, ...rest } = x
    return Object.keys(out).length ? { ...rest, names: out } : rest
  }) } }
}

// Deleting a type also takes it off every exercise that needed it; an exercise left with no
// needs behaves exactly as it did before it had any.
export function deleteType(inst, id) {
  if (!inst.types.some(x => x.id === id)) return { error: 'unknown' }
  const needs = {}
  for (const [exId, list] of Object.entries(inst.needs)) {
    const keep = list.filter(x => x !== id)
    if (keep.length) needs[exId] = keep
  }
  return { inst: { ...inst, types: inst.types.filter(x => x.id !== id), needs } }
}

// How many catalogue exercises need a type — what deleting it takes away.
export const needsUsing = (inst, id) => Object.values(inst.needs).filter(list => list.includes(id)).length

// The added types a catalogue exercise needs besides its own equipment; an empty list clears it.
export function setNeeds(inst, exId, types) {
  if (!Object.hasOwn(EXIDX, exId) || EXIDX[exId].custom) return { error: 'exercise' }
  const list = Array.isArray(types) ? [...new Set(types)] : []
  if (list.some(id => !isAddedEq(id) || !inst.types.some(x => x.id === id))) return { error: 'type' }
  const needs = { ...inst.needs }
  if (list.length) needs[exId] = list
  else delete needs[exId]
  return { inst: { ...inst, needs } }
}
