import { t, getLang, baseLang, LANGS, DERIVED_LOCALES } from './i18n-core.js'
import { EXDB } from './exercises-data.js'

// Pieces of kit the catalogue never names as an exercise's equipment — "dumbbell bench press" is
// tagged `dumbbell`, yet it needs a bench; "chin-up" is tagged `body weight`, yet it needs a bar.
// They are read off the exercise name instead of stored on 1,300 rows, and sit in the profile
// checklist beside the real equipment values.
export const ACCESSORIES = ['bench', 'pull-up bar']

// Machines that carry their own seat, bar or bench: "lever incline chest press" needs no bench.
const SELF_CONTAINED = new Set(['leverage machine', 'sled machine', 'assisted'])

// Which accessories an exercise needs, e.g. ['bench'] for "dumbbell incline bench press".
export function accessoriesOf(ex) {
  if (!ex.n || SELF_CONTAINED.has(ex.eq)) return []
  const n = ex.n.toLowerCase()
  const need = []
  if (/\bbench\b|\bincline\b|\bdecline\b/.test(n)) need.push('bench')
  if (/pull-up|pull up|chin-up|\bchin\b|hanging|muscle-up|muscle up/.test(n)) need.push('pull-up bar')
  return need
}

// Every equipment value present in the catalogue, most common first, then the accessories —
// this becomes the checklist Settings shows when you build a profile.
const CATALOG_EQUIPMENT = (() => {
  const c = {}
  EXDB.forEach(e => { if (e.eq) c[e.eq] = (c[e.eq] || 0) + 1 })
  const ranked = Object.keys(c).sort((a, b) => c[b] - c[a] || (a < b ? -1 : 1))
  // Clubbell and macebell have no catalogue entries yet (issue #393). They still belong on the
  // profile checklist and the custom-exercise chips, after everything the catalogue already uses.
  for (const extra of ['clubbell', 'macebell']) if (!ranked.includes(extra)) ranked.push(extra)
  return ranked
})()
export const ALL_EQUIPMENT = CATALOG_EQUIPMENT.concat(ACCESSORIES)

// Equipment types an instance adds on top of the catalogue (a basketball, a roman chair) carry
// an `x-` id that never changes when the admin renames them, and can't collide with a catalogue
// value. `inst` is { rev, types: [{ id, name }], needs: { exId: [typeId] } }; null reads as none.
export const isAddedEq = id => typeof id === 'string' && id.startsWith('x-')
const typesOf = inst => (inst && Array.isArray(inst.types) ? inst.types : [])

// The instance's current list, set by instance-equipment.js whenever it changes (the same way
// i18n.js sets the language for i18n-core), so exAvailable keeps its (S, ex) signature.
let current = null
export const currentInstance = () => current
export function _setInstance(inst) { current = inst || null }

// The full checklist: the catalogue, the instance's added types in the order they were created,
// then the accessories. With no instance it is exactly ALL_EQUIPMENT.
export function equipmentList(inst) {
  const added = typesOf(inst).map(x => x.id)
  return added.length ? CATALOG_EQUIPMENT.concat(added, ACCESSORIES) : ALL_EQUIPMENT
}

// The languages an added type can carry a name in: every language the app has, except those
// derived from another (de-CH reads de's), exactly as the app's own strings.
export const NAME_LANGS = Object.keys(LANGS).filter(l => !DERIVED_LOCALES[l])

// An added type's name in `lang`: its own name for that language, else its base language's,
// else the main name the admin gave it.
export function typeName(type, lang = getLang()) {
  const names = type?.names || {}
  return names[lang] || names[baseLang(lang)] || type?.name || ''
}

// What to show for an equipment id: the translation for a catalogue value, the added type's name
// in the app's language, and never the bare `x-` id of a type that has since been deleted.
export function eqLabel(id, inst = current, lang = getLang()) {
  if (!isAddedEq(id)) return t(id)
  const type = typesOf(inst).find(x => x.id === id)
  return type ? typeName(type, lang) : t('Unknown equipment')
}

// Everything an exercise needs beside its own equipment: the accessories its name implies, plus
// what the instance says it needs too ("dumbbell lunge" also needs a step). A requirement on a
// type that no longer exists is ignored rather than hiding the exercise.
export function needsOf(ex, inst = current) {
  const acc = accessoriesOf(ex)
  const extra = ex.id && inst?.needs ? inst.needs[ex.id] : null
  if (!Array.isArray(extra) || !extra.length) return acc
  const known = new Set(typesOf(inst).map(x => x.id))
  return [...new Set([...acc, ...extra.filter(id => known.has(id))])]
}

// Body weight is never gated by a profile — no gym or home setup can take it away from you,
// and every profile should be able to see bodyweight exercises regardless of what's checked.
// Only the accessory an exercise needs (a bar, a bench) can still gate it.
const ALWAYS_AVAILABLE = 'body weight'

export function activeProfile(S) {
  if (!S.equipFilterOn) return null
  const profiles = S.equipProfiles || []
  return profiles.find(p => p.id === S.activeEquipId) || null
}

// Whether an exercise is usable under the active profile. With filtering off, or no profile
// selected, everything is available — this is purely additive, never a trap that hides your
// whole library because you haven't set anything up yet.
export function exAvailable(S, ex) {
  const p = activeProfile(S)
  if (!p) return true
  return eqAvailable(profileEquipment(p, current), ex, current)
}

// A profile saved before the bench and the bar were on the checklist (#464) never had the chance
// to tick them; read as unticked, every bench press and pull-up would vanish from it overnight.
// It counts as having both until it is saved again, and the sheet shows them ticked.
// An added type the admin has since deleted no longer counts, nor shows on the checklist.
export const ACC_V = 1
export function profileEquipment(p, inst = current) {
  let have = p?.equipment || []
  if (have.some(isAddedEq)) {
    const known = new Set(typesOf(inst).map(x => x.id))
    have = have.filter(id => !isAddedEq(id) || known.has(id))
  }
  return p && p.accV !== ACC_V ? [...new Set([...have, ...ACCESSORIES])] : have
}

// The same test against a bare equipment list, for callers that hold a profile rather than S.
export function eqAvailable(equipment, ex, inst = current) {
  const have = equipment || []
  if (ex.eq && ex.eq !== ALWAYS_AVAILABLE) {
    // Equipment no profile can tick (an imported exercise's "custom", an added type the admin
    // has deleted) would hide the user's own exercise under every profile, with no way to bring
    // it back. It stays, like body weight.
    if (!equipmentList(inst).includes(ex.eq)) return true
    if (!have.includes(ex.eq)) return false
  }
  return needsOf(ex, inst).every(a => have.includes(a))
}

// What an exercise needs that the active profile lacks, the equipment first and then what its
// name implies or the instance adds — for the editor's "needs X" line. Empty when it is available.
export function missingEquipment(S, ex) {
  const p = activeProfile(S)
  if (!p || eqAvailable(profileEquipment(p, current), ex, current)) return []
  const have = profileEquipment(p, current)
  const main = ex.eq && ex.eq !== ALWAYS_AVAILABLE && !have.includes(ex.eq) ? [ex.eq] : []
  return main.concat(needsOf(ex, current).filter(a => !have.includes(a)))
}

// The equipment chips to offer when picking an exercise's equipment: with a profile filtering,
// only what it has, plus body weight and `keep` (the equipment of the exercise being edited, so
// saving it never fails); `showAll`, or no profile, offers the whole list.
export function chipEquipment(list, profile, { showAll = false, keep = null, inst = current } = {}) {
  if (!profile || showAll) return list
  const have = new Set(profileEquipment(profile, inst))
  return list.filter(k => have.has(k) || k === ALWAYS_AVAILABLE || k === keep)
}

export function newProfile(name) {
  return { id: 'eq' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, equipment: [], accV: ACC_V }
}
