import { describe, expect, test, it } from 'vitest'
import { exAvailable, eqAvailable, profileEquipment, newProfile, ACC_V, ALL_EQUIPMENT, ACCESSORIES, accessoriesOf, equipmentList, eqLabel, needsOf, chipEquipment, missingEquipment, typeName, NAME_LANGS, _setInstance } from './equipment.js'
import { t } from './i18n-core.js'
import { EXIDX } from './exercises.js'

// QA 1.3.11: an imported custom exercise is stored with eq "custom", which no profile can tick, so
// any active profile hid it from the Library, the picker and the muscle explorer for good.
describe('exAvailable', () => {
  const S = { equipFilterOn: true, activeEquipId: 'home', equipProfiles: [{ id: 'home', name: 'Home', equipment: ['dumbbell'] }] }

  test('the active profile decides for catalogue equipment', () => {
    expect(exAvailable(S, { eq: 'dumbbell' })).toBe(true)
    expect(exAvailable(S, { eq: 'barbell' })).toBe(false)
    expect(exAvailable(S, { eq: 'body weight' })).toBe(true)
  })

  test('equipment no profile can pick never hides an exercise', () => {
    expect(ALL_EQUIPMENT.includes('custom')).toBe(false)
    expect(exAvailable(S, { id: 'c1', n: 'trap bar deadlift', eq: 'custom', custom: true })).toBe(true)
  })

  test('a custom exercise with real equipment is still filtered like any other', () => {
    expect(exAvailable(S, { id: 'c2', n: 'my row', eq: 'barbell', custom: true })).toBe(false)
  })

  test('no profile, nothing hidden', () => {
    expect(exAvailable({ ...S, equipFilterOn: false }, { eq: 'barbell' })).toBe(true)
  })
})

// "dumbbell bench press" is tagged `dumbbell` and "chin-up" `body weight`, so the catalogue's
// equipment value alone let a dumbbells-only profile see a bench and a bare one see a bar.
describe('bench and pull-up bar', () => {
  const ex = (n, eq) => ({ n, eq })
  const profile = equipment => ({ equipFilterOn: true, activeEquipId: 'p', equipProfiles: [{ id: 'p', name: 'P', equipment, accV: ACC_V }] })

  test('are read off the exercise name, whatever its equipment tag says', () => {
    expect(accessoriesOf(ex('dumbbell bench press', 'dumbbell'))).toEqual(['bench'])
    expect(accessoriesOf(ex('dumbbell incline curl', 'dumbbell'))).toEqual(['bench'])
    expect(accessoriesOf(ex('decline sit-up', 'body weight'))).toEqual(['bench'])
    expect(accessoriesOf(ex('chin-up', 'body weight'))).toEqual(['pull-up bar'])
    expect(accessoriesOf(ex('hanging leg raise', 'body weight'))).toEqual(['pull-up bar'])
  })

  test('exercises that name neither need neither', () => {
    expect(accessoriesOf(ex('dumbbell squat', 'dumbbell'))).toEqual([])
    expect(accessoriesOf(ex('push-up', 'body weight'))).toEqual([])
    expect(accessoriesOf({ eq: 'dumbbell' })).toEqual([])
  })

  test('machines with their own bench or bar are left alone', () => {
    expect(accessoriesOf(ex('lever incline chest press', 'leverage machine'))).toEqual([])
    expect(accessoriesOf(ex('assisted pull-up', 'assisted'))).toEqual([])
  })

  test('only ever name a listed accessory', () => {
    for (const e of Object.values(EXIDX)) for (const a of accessoriesOf(e)) expect(ACCESSORIES).toContain(a)
  })

  test('both are in the profile checklist', () => {
    for (const a of ACCESSORIES) expect(ALL_EQUIPMENT).toContain(a)
  })

  test('the dumbbell and the bench together unlock a bench press', () => {
    const press = ex('dumbbell bench press', 'dumbbell')
    expect(exAvailable(profile(['dumbbell']), press)).toBe(false)
    expect(exAvailable(profile(['bench']), press)).toBe(false)
    expect(exAvailable(profile(['dumbbell', 'bench']), press)).toBe(true)
  })

  test('an empty profile keeps plain body weight but loses what needs a bar', () => {
    expect(exAvailable(profile([]), ex('push-up', 'body weight'))).toBe(true)
    expect(exAvailable(profile([]), ex('chin-up', 'body weight'))).toBe(false)
    expect(exAvailable(profile(['pull-up bar']), ex('chin-up', 'body weight'))).toBe(true)
  })

  test('an imported custom exercise stays visible even if its name says bench', () => {
    expect(exAvailable(profile([]), { id: 'c', n: 'my bench thing', eq: 'custom', custom: true })).toBe(true)
  })
})

describe('profiles saved before the bench and the bar existed (#464)', () => {
  const bench = { n: 'dumbbell bench press', eq: 'dumbbell' }
  it('keep their bench and bar work until saved again', () => {
    expect(eqAvailable(profileEquipment({ equipment: ['dumbbell'] }), bench)).toBe(true)
    expect(eqAvailable(profileEquipment({ equipment: ['dumbbell'], accV: ACC_V }), bench)).toBe(false)
    expect(newProfile('Home').accV).toBe(ACC_V)
  })
})

// Equipment types an instance adds (`x-` ids) and the extra needs it puts on catalogue exercises.
describe('instance equipment', () => {
  const step = { id: 'x-step', name: 'Step', created: 1 }
  const ball = { id: 'x-ball', name: 'Basketball', created: 2 }
  const inst = { rev: 3, types: [step, ball], needs: { '0336': ['x-step'] } }
  const lunge = EXIDX['0336']
  const pushUp = EXIDX['0662']

  test('with no instance the list is the catalogue list, unchanged', () => {
    expect(equipmentList(null)).toEqual(ALL_EQUIPMENT)
    expect(equipmentList({ rev: 0, types: [], needs: {} })).toEqual(ALL_EQUIPMENT)
  })

  test('added types come after the catalogue and before the accessories', () => {
    const list = equipmentList(inst)
    expect(list.slice(-4)).toEqual(['x-step', 'x-ball', ...ACCESSORIES])
    expect(list.slice(0, ALL_EQUIPMENT.length - ACCESSORIES.length)).toEqual(ALL_EQUIPMENT.slice(0, -ACCESSORIES.length))
  })

  test('labels: catalogue values translate as before, added types show their name', () => {
    for (const k of ALL_EQUIPMENT) expect(eqLabel(k, inst)).toBe(t(k))
    expect(eqLabel('x-ball', inst)).toBe('Basketball')
    expect(eqLabel('x-gone', inst)).toBe(t('Unknown equipment'))
    expect(eqLabel('x-gone', inst)).not.toContain('x-')
  })

  test('needsOf adds the instance needs to the accessories', () => {
    expect(needsOf(lunge, inst)).toEqual(['x-step'])
    expect(needsOf(lunge, null)).toEqual([])
    expect(needsOf({ id: '0336', n: 'dumbbell incline lunge', eq: 'dumbbell' }, inst)).toEqual(['bench', 'x-step'])
    expect(needsOf(lunge, { ...inst, types: [ball] })).toEqual([])
  })

  test('a missing extra need hides the exercise, having it shows it', () => {
    expect(eqAvailable(['dumbbell'], lunge, inst)).toBe(false)
    expect(eqAvailable(['dumbbell', 'x-step'], lunge, inst)).toBe(true)
    expect(eqAvailable(['dumbbell'], lunge, { ...inst, needs: {} })).toBe(true)
  })

  test('an empty profile keeps body weight that needs nothing', () => {
    expect(eqAvailable([], pushUp, inst)).toBe(true)
  })

  test('a deleted type neither hides a custom exercise nor a catalogue one', () => {
    const own = { id: 'c1', n: 'roman chair sit-up', eq: 'x-chair', custom: true }
    const withChair = { ...inst, types: [...inst.types, { id: 'x-chair', name: 'Roman chair' }] }
    expect(eqAvailable(['dumbbell'], own, withChair)).toBe(false)
    expect(eqAvailable(['x-chair'], own, withChair)).toBe(true)
    // the admin deletes it: the server drops it from needs, the custom exercise stays
    expect(eqAvailable(['dumbbell'], own, inst)).toBe(true)
    expect(eqAvailable(['dumbbell'], lunge, { ...inst, types: [ball] })).toBe(true)
  })

  test('exAvailable reads the instance set by the store', () => {
    const S = { equipFilterOn: true, activeEquipId: 'p', equipProfiles: [{ id: 'p', name: 'P', equipment: ['dumbbell'], accV: ACC_V }] }
    try {
      _setInstance(inst)
      expect(exAvailable(S, lunge)).toBe(false)
      _setInstance(null)
      expect(exAvailable(S, lunge)).toBe(true)
    } finally { _setInstance(null) }
  })

  test('missingEquipment names what the profile lacks, needs included', () => {
    const S = equipment => ({ equipFilterOn: true, activeEquipId: 'p', equipProfiles: [{ id: 'p', name: 'P', equipment, accV: ACC_V }] })
    try {
      _setInstance(inst)
      expect(missingEquipment(S(['dumbbell']), lunge)).toEqual(['x-step'])
      expect(missingEquipment(S([]), lunge)).toEqual(['dumbbell', 'x-step'])
      expect(missingEquipment(S([]), { n: 'chin-up', eq: 'body weight' })).toEqual(['pull-up bar'])
      expect(missingEquipment(S(['dumbbell', 'x-step']), lunge)).toEqual([])
    } finally { _setInstance(null) }
  })

  test('a profile drops added types that no longer exist', () => {
    const p = { equipment: ['dumbbell', 'x-step', 'x-gone'], accV: ACC_V }
    expect(profileEquipment(p, inst)).toEqual(['dumbbell', 'x-step'])
    expect(profileEquipment(p, null)).toEqual(['dumbbell'])
    expect(profileEquipment({ equipment: ['dumbbell'], accV: ACC_V }, inst)).toEqual(['dumbbell'])
  })

  test('chipEquipment: the profile, body weight and the kept value; showAll gives everything', () => {
    const list = equipmentList(inst)
    const home = { equipment: ['dumbbell', 'kettlebell', 'x-ball', 'x-gone'], accV: ACC_V }
    expect(chipEquipment(list, home, { inst })).toEqual(list.filter(k => ['dumbbell', 'kettlebell', 'x-ball', 'body weight'].includes(k)))
    expect(chipEquipment(list, home, { inst, keep: 'barbell' })).toContain('barbell')
    expect(chipEquipment(list, home, { inst, showAll: true })).toEqual(list)
    expect(chipEquipment(list, null, { inst })).toEqual(list)
  })
})

describe('added types in several languages', () => {
  const dips = { id: 'x-dips', name: 'Barra de dips', names: { en: 'Dip bar', de: 'Dipbarren' } }
  const inst = { rev: 1, types: [dips], needs: {} }

  test('the user’s language first, then its base language, then the main name', () => {
    expect(typeName(dips, 'en')).toBe('Dip bar')
    expect(typeName(dips, 'de-CH')).toBe('Dipbarren')
    expect(typeName(dips, 'fr')).toBe('Barra de dips')
    expect(eqLabel('x-dips', inst, 'de')).toBe('Dipbarren')
    expect(eqLabel('x-dips', inst, 'it')).toBe('Barra de dips')
  })

  test('every app language can hold a name, derived ones excepted', () => {
    expect(NAME_LANGS).toContain('en')
    expect(NAME_LANGS).toContain('pt-BR')
    expect(NAME_LANGS).not.toContain('de-CH')
    expect(NAME_LANGS.length).toBe(19)
  })
})
