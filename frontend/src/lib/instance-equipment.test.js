// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest'
import {
  SERVER_KEY, LOCAL_KEY, emptyInstance, normalizeInstance, readCache, useInstanceEquipment,
  setServerInstance, showServerInstance, showLocalInstance, saveLocalInstance, refreshInstanceEquipment,
  setInstanceMirror, restoreInstanceFiles,
  addType, renameType, deleteType, setNeeds, setNames, needsUsing, NAME_MAX
} from './instance-equipment.js'
import { currentInstance, eqLabel } from './equipment.js'

beforeEach(() => { localStorage.clear(); showServerInstance() })

describe('the stored list', () => {
  it('reads missing or corrupt data as empty', () => {
    expect(readCache(SERVER_KEY)).toEqual({ rev: 0, types: [], needs: {} })
    localStorage.setItem(SERVER_KEY, '{not json')
    expect(readCache(SERVER_KEY)).toEqual(emptyInstance())
    localStorage.setItem(SERVER_KEY, '[1,2]')
    expect(readCache(SERVER_KEY)).toEqual(emptyInstance())
    localStorage.setItem(SERVER_KEY, '{"types":"nope","needs":[]}')
    expect(readCache(SERVER_KEY)).toEqual(emptyInstance())
  })

  it('keeps only valid types, and needs on types that exist', () => {
    const inst = normalizeInstance({
      rev: 4,
      types: [{ id: 'x-a', name: ' Step ', created: 1 }, { id: 'dumbbell', name: 'Fake' }, { id: 'x-b', name: '' }, { id: 'x-a', name: 'Dup' }],
      needs: { '0336': ['x-a', 'x-gone'], '0001': ['x-gone'], '0002': 'x-a' }
    })
    expect(inst).toEqual({ rev: 4, types: [{ id: 'x-a', name: 'Step', created: 1 }], needs: { '0336': ['x-a'] } })
  })

  it('a fetched list is cached and shown, and survives a restart offline', () => {
    setServerInstance({ rev: 2, types: [{ id: 'x-ball', name: 'Basketball', created: 1 }], needs: {} })
    expect(JSON.parse(localStorage.getItem(SERVER_KEY)).rev).toBe(2)
    expect(useInstanceEquipment.getState().inst.types).toHaveLength(1)
    expect(eqLabel('x-ball')).toBe('Basketball')
    // a new boot without network starts from the cache
    showServerInstance()
    expect(currentInstance().types[0].name).toBe('Basketball')
  })

  it('the device list and the server list stay apart', () => {
    setServerInstance({ rev: 1, types: [{ id: 'x-s', name: 'Server kit', created: 1 }], needs: {} })
    showLocalInstance()
    expect(currentInstance().types).toEqual([])
    const r = addType(currentInstance(), 'Roman chair', { id: 'x-rc', now: 5 })
    saveLocalInstance(r.inst)
    expect(useInstanceEquipment.getState()).toMatchObject({ source: 'local', inst: { rev: 1, types: [{ id: 'x-rc' }] } })
    // a server list arriving while on the device list is cached, not shown
    setServerInstance({ rev: 3, types: [], needs: {} })
    expect(currentInstance().types[0].id).toBe('x-rc')
    showServerInstance()
    expect(currentInstance().rev).toBe(3)
    expect(readCache(LOCAL_KEY).types[0].name).toBe('Roman chair')
  })
})

describe('fetching the list', () => {
  const list = { rev: 5, types: [{ id: 'x-ball', name: 'Basketball', created: 1 }], needs: {} }

  it('stores what the server answers, and keeps the cache when it cannot answer', async () => {
    await refreshInstanceEquipment(async () => list, { force: true })
    expect(currentInstance().rev).toBe(5)
    await refreshInstanceEquipment(async () => { throw new TypeError('Failed to fetch') }, { force: true })
    expect(currentInstance().types[0].name).toBe('Basketball')
    expect(readCache(SERVER_KEY).rev).toBe(5)
  })

  it('asks at most once a minute unless forced', async () => {
    let calls = 0
    const fetchList = async () => { calls++; return list }
    await refreshInstanceEquipment(fetchList, { force: true, now: 1000 })
    await refreshInstanceEquipment(fetchList, { now: 30000 })
    expect(calls).toBe(1)
    await refreshInstanceEquipment(fetchList, { now: 62000 })
    expect(calls).toBe(2)
  })

  it('the phone mirrors both lists to files and restores one storage lost', async () => {
    const files = {}
    setInstanceMirror((name, data) => { files[name] = data })
    try {
      setServerInstance(list)
      expect(Object.values(files)[0].rev).toBe(5)
      localStorage.clear()
      await restoreInstanceFiles(async name => files[name] || null)
      expect(currentInstance().types[0].id).toBe('x-ball')
    } finally { setInstanceMirror(null) }
  })
})

describe('editing the device list', () => {
  const base = { rev: 0, types: [{ id: 'x-step', name: 'Step', created: 1 }], needs: {} }

  it('adds a type with an x- id', () => {
    const r = addType(base, '  Basketball ', { now: 9 })
    expect(r.id).toMatch(/^x-/)
    expect(r.inst.types.at(-1)).toEqual({ id: r.id, name: 'Basketball', created: 9 })
    expect(base.types).toHaveLength(1)
  })

  it('names are 1 to 40 characters and never taken twice, whatever the case', () => {
    expect(addType(base, '   ').error).toBe('name')
    expect(addType(base, 'a'.repeat(NAME_MAX + 1)).error).toBe('name')
    expect(addType(base, 'a'.repeat(NAME_MAX)).inst).toBeTruthy()
    expect(addType(base, ' STEP ').error).toBe('exists')
    expect(addType(base, 'Dumbbell').error).toBe('exists')
    expect(addType(base, 'pull-up bar').error).toBe('exists')
  })

  it('renames by id, keeping the id', () => {
    const r = renameType(base, 'x-step', 'Aerobic step')
    expect(r.inst.types).toEqual([{ id: 'x-step', name: 'Aerobic step', created: 1 }])
    expect(renameType(base, 'x-step', 'step').inst.types[0].name).toBe('step')
    expect(renameType(base, 'x-nope', 'X').error).toBe('unknown')
    expect(renameType(base, 'dumbbell', 'X').error).toBe('unknown')
  })

  it('needs: catalogue exercises only, added types only; empty clears', () => {
    const r = setNeeds(base, '0336', ['x-step'])
    expect(r.inst.needs).toEqual({ '0336': ['x-step'] })
    expect(setNeeds(base, 'nope', ['x-step']).error).toBe('exercise')
    expect(setNeeds(base, '0336', ['dumbbell']).error).toBe('type')
    expect(setNeeds(base, '0336', ['x-gone']).error).toBe('type')
    expect(setNeeds(r.inst, '0336', []).inst.needs).toEqual({})
  })

  it('deleting a type takes it off every exercise', () => {
    const two = addType(base, 'Ball', { id: 'x-ball' }).inst
    const withNeeds = setNeeds(setNeeds(two, '0336', ['x-step', 'x-ball']).inst, '0662', ['x-step']).inst
    expect(needsUsing(withNeeds, 'x-step')).toBe(2)
    const r = deleteType(withNeeds, 'x-step')
    expect(r.inst.types.map(x => x.id)).toEqual(['x-ball'])
    expect(r.inst.needs).toEqual({ '0336': ['x-ball'] })
    expect(deleteType(base, 'dumbbell').error).toBe('unknown')
  })
})

describe('names per language', () => {
  const base = { rev: 0, types: [{ id: 'x-dips', name: 'Barra de dips', created: 1 }, { id: 'x-step', name: 'Step', created: 2 }], needs: {} }

  it('keeps valid names when reading, drops unknown languages and blanks', () => {
    const inst = normalizeInstance({ types: [{ id: 'x-a', name: 'A', names: { en: ' Ay ', xx: 'nope', de: '  ', 'de-CH': 'Ä' } }] })
    expect(inst.types[0].names).toEqual({ en: 'Ay' })
    expect(normalizeInstance({ types: [{ id: 'x-a', name: 'A', names: 'x' }] }).types[0]).toEqual({ id: 'x-a', name: 'A', created: 0 })
  })

  it('sets, replaces and clears translations', () => {
    const r = setNames(base, 'x-dips', { en: ' Dip bar ', de: 'Dipbarren' })
    expect(r.inst.types[0].names).toEqual({ en: 'Dip bar', de: 'Dipbarren' })
    expect(setNames(r.inst, 'x-dips', { en: 'Dip bar', de: '' }).inst.types[0].names).toEqual({ en: 'Dip bar' })
    expect(setNames(r.inst, 'x-dips', {}).inst.types[0].names).toBeUndefined()
  })

  it('refuses unknown languages, long names, and names another type or the catalogue has', () => {
    expect(setNames(base, 'x-dips', { xx: 'Dip bar' }).error).toBe('lang')
    expect(setNames(base, 'x-dips', { 'de-CH': 'Dipbarren' }).error).toBe('lang')
    expect(setNames(base, 'x-dips', { en: 'a'.repeat(NAME_MAX + 1) }).error).toBe('name')
    expect(setNames(base, 'x-dips', { en: 'step' }).error).toBe('exists')
    expect(setNames(base, 'x-dips', { en: 'Dumbbell' }).error).toBe('exists')
    expect(setNames(base, 'x-nope', { en: 'X' }).error).toBe('unknown')
    // its own main name in another language is fine
    expect(setNames(base, 'x-step', { en: 'Step', de: 'Step' }).inst).toBeTruthy()
  })

  it('a translation also blocks the same name for a new type', () => {
    const withEn = setNames(base, 'x-dips', { en: 'Dip bar' }).inst
    expect(addType(withEn, 'dip bar').error).toBe('exists')
  })
})
