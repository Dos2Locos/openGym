// Equipment types an instance adds to the catalogue (lib/instance-equipment.js, api/equipment.js).
//
//   EquipmentManager      the list, renaming, deleting, and the extra kit catalogue exercises need.
//                         One UI for two owners: the console's Equipment section
//                         (views/console/Equipment.jsx) saving through the API, and a device with
//                         no server saving to its own list. Labels come in through `tr`.
//   ProposeEquipmentRows  Settings → Equipment, signed in: propose a type, see what became of it.
//   LocalEquipmentRow     Settings → Equipment, no server: the device's own list.
import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t, exerciseNameFor } from '../lib/i18n.js'
import { getLang, LANGS } from '../lib/i18n-core.js'
import { NAME_LANGS } from '../lib/equipment.js'
import { api } from '../lib/api.js'
import { EXDB, searchExercises } from '../lib/exercises.js'
import {
  NAME_MAX, useInstanceEquipment, localInstance, saveLocalInstance, addType, renameType, deleteType, setNeeds, setNames, needsUsing
} from '../lib/instance-equipment.js'
import { confirmSheet } from '../sheets.jsx'
import { Row, Button, SearchField } from './ui.jsx'

const ui = () => useUI.getState()
const NOTE_MAX = 200
const PENDING_MAX = 10
const errStyle = { color: 'var(--red)', marginTop: 8 }


function errorText(code, tr) {
  if (code === 'name') return tr('Use 1 to {0} characters.', NAME_MAX)
  if (code === 'exists') return tr('That equipment type already exists.')
  if (code === 'lang') return tr('Couldn’t save. Try again.')
  return tr('Couldn’t save. Try again.')
}

/* `inst` is { types, needs }. `ops` saves: add(name), rename(id, name), remove(id),
   setNames(id, names), setNeeds(exId, types) — each a promise of null or an error code ('name',
   'exists', other). */

// How many of the app's languages a type has a name in.
const coverage = type => NAME_LANGS.filter(l => type.names?.[l]).length

/* A type's name in every language of the app, so whoever reads it in theirs sees it in theirs.
   The languages still missing come first and stand out: covering them all is the point. */
function TranslationsEditor({ type, ops, tr, onDone }) {
  const [names, setNamesDraft] = useState(() => ({ ...(type.names || {}) }))
  const [err, setErr] = useState(null)
  const [order] = useState(() => [...NAME_LANGS].sort((a, b) => (!!type.names?.[a] - !!type.names?.[b])))
  const save = async () => {
    const code = await ops.setNames(type.id, names)
    if (code) setErr(errorText(code, tr)); else onDone()
  }
  const missing = NAME_LANGS.filter(l => !(names[l] || '').trim()).length
  return <div style={{ padding: '8px 0 12px', borderBottom: 'var(--hair) solid var(--sep)' }}>
    <div className="dim small" style={{ marginBottom: 8 }}>
      {tr('Without a name in their language, people see "{0}".', type.name)} · {tr('Languages: {0}/{1}', NAME_LANGS.length - missing, NAME_LANGS.length)}
    </div>
    {order.map(l => {
      const empty = !(names[l] || '').trim()
      return <label key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
        <span className="small" style={{ width: 130, flex: 'none', color: empty ? 'var(--orange)' : undefined }}>
          {LANGS[l]}{empty ? ' · ' + tr('Missing') : ''}</span>
        <input className="input" lang={l} dir="auto" maxLength={NAME_MAX} value={names[l] || ''} placeholder={type.name}
          style={empty ? { borderColor: 'var(--orange)' } : undefined}
          onChange={e => { setNamesDraft({ ...names, [l]: e.target.value }); setErr(null) }} />
      </label>
    })}
    {err && <div className="small" style={errStyle}>{err}</div>}
    <div className="row" style={{ gap: 8, marginTop: 8 }}>
      <Button size="sm" variant="primary" onClick={save}>{tr('Save translations')}</Button>
      <Button size="sm" onClick={onDone}>{tr('Cancel')}</Button>
    </div>
  </div>
}
export function EquipmentManager({ inst, ops, tr = t }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState(null)
  const [editing, setEditing] = useState(null)   // { id, name } while renaming
  const [translating, setTranslating] = useState(null)   // a type's id while its names are edited
  const [q, setQ] = useState('')
  const [exId, setExId] = useState(null)
  const run = async (p, after) => {
    const code = await p
    setErr(code ? errorText(code, tr) : null)
    if (!code && after) after()
  }
  const add = () => run(ops.add(name.trim()), () => setName(''))
  const rename = () => run(ops.rename(editing.id, editing.name.trim()), () => setEditing(null))
  const remove = type => {
    const n = needsUsing(inst, type.id)
    confirmSheet({
      title: tr('Delete "{0}"?', type.name),
      message: n ? tr('Catalogue exercises that will stop needing it: {0}', n) : tr('No catalogue exercise needs it.'),
      confirmText: tr('Delete'), cancelText: tr('Cancel'), danger: true,
      onConfirm: () => run(ops.remove(type.id), () => { if (editing?.id === type.id) setEditing(null) }),
    })
  }
  const ex = exId ? EXDB.find(e => e.id === exId) : null
  const exNeeds = (exId && inst.needs[exId]) || []
  const toggleNeed = id => run(ops.setNeeds(exId, exNeeds.includes(id) ? exNeeds.filter(x => x !== id) : [...exNeeds, id]))
  const found = q.trim() ? searchExercises(EXDB, q).slice(0, 20) : []
  const withNeeds = Object.keys(inst.needs).map(id => EXDB.find(e => e.id === id)).filter(Boolean)
  const typeName = id => inst.types.find(x => x.id === id)?.name || id

  return <>
    <div className="muted small" style={{ margin: '4px 0 8px' }}>{tr('Types')}</div>
    {!inst.types.length && <div className="dim small">{tr('No equipment types added yet.')}</div>}
    {inst.types.map(type => editing?.id === type.id
      ? <div key={type.id} style={{ display: 'flex', gap: 8, margin: '6px 0' }}>
          <input className="input" autoFocus maxLength={NAME_MAX} value={editing.name}
            onChange={e => setEditing({ ...editing, name: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') rename() }} />
          <Button size="sm" variant="tinted" onClick={rename}>{tr('Save')}</Button>
          <Button size="sm" onClick={() => setEditing(null)}>{tr('Cancel')}</Button>
        </div>
      : <div key={type.id}>
          <div className="item">
            <div className="grow"><div className="tt">{type.name}</div>
              <div className="ss">{tr('Needed by catalogue exercises: {0}', needsUsing(inst, type.id))}
                {' · '}<span style={coverage(type) < NAME_LANGS.length ? { color: 'var(--orange)' } : undefined}>
                  {tr('Languages: {0}/{1}', coverage(type), NAME_LANGS.length)}</span></div></div>
            <Button size="sm" onClick={() => setTranslating(translating === type.id ? null : type.id)}>{tr('Translations')}</Button>
            <Button size="sm" onClick={() => setEditing({ id: type.id, name: type.name })}>{tr('Rename')}</Button>
            <Button size="sm" variant="ghost" icon="trash" aria-label={tr('Delete')} onClick={() => remove(type)} />
          </div>
          {translating === type.id && <TranslationsEditor type={type} ops={ops} tr={tr} onDone={() => setTranslating(null)} />}
        </div>)}
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      <input className="input" placeholder={tr('New equipment type')} maxLength={NAME_MAX} value={name}
        onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && name.trim()) add() }} />
      <Button variant="tinted" icon="plus" disabled={!name.trim()} onClick={add}>{tr('Add')}</Button>
    </div>
    {err && <div className="small" style={errStyle}>{err}</div>}

    {inst.types.length > 0 && <>
      <div className="muted small" style={{ margin: '18px 0 4px' }}>{tr('Exercise needs')}</div>
      <div className="dim small" style={{ marginBottom: 8 }}>
        {tr('A catalogue exercise can need added equipment too. With the equipment filter on, it only shows to profiles that have it.')}
      </div>
      <SearchField value={q} placeholder={tr('Search the catalogue')} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} />
      {(found.length ? found : withNeeds).map(e => (
        <div key={e.id} className="item" aria-pressed={e.id === exId} onClick={() => setExId(e.id === exId ? null : e.id)}
          style={{ cursor: 'pointer', ...(e.id === exId ? { background: 'var(--acc-soft)' } : {}) }}>
          <div className="grow"><div className="tt">{exerciseNameFor(e)}</div>
            <div className="ss">{(inst.needs[e.id] || []).map(typeName).join(' · ') || tr('Needs nothing extra')}</div></div>
        </div>
      ))}
      {ex && <div style={{ marginTop: 10 }}>
        <div className="small" style={{ marginBottom: 6 }}>{tr('"{0}" also needs:', exerciseNameFor(ex))}</div>
        <div className="chips">
          {inst.types.map(type => <button key={type.id} className={'chip nocap' + (exNeeds.includes(type.id) ? ' on' : '')}
            aria-pressed={exNeeds.includes(type.id)} onClick={() => toggleNeed(type.id)}>{type.name}</button>)}
        </div>
      </div>}
    </>}
  </>
}

/* ---------- a device with no server: its own list ---------- */

const localOps = () => {
  const apply = r => {
    if (r.error) return Promise.resolve(r.error)
    saveLocalInstance(r.inst)
    return Promise.resolve(null)
  }
  return {
    add: name => apply(addType(localInstance(), name)),
    rename: (id, name) => apply(renameType(localInstance(), id, name)),
    remove: id => apply(deleteType(localInstance(), id)),
    setNames: (id, names) => apply(setNames(localInstance(), id, names)),
    setNeeds: (exId, types) => apply(setNeeds(localInstance(), exId, types)),
  }
}

function LocalEquipmentSheet() {
  const inst = useInstanceEquipment(s => s.inst)
  return <>
    <h3>{t('Equipment types')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>
      {t('Add equipment the list doesn’t have. Without a server, the types you add here stay on this device.')}
    </div>
    <EquipmentManager inst={inst} ops={localOps()} />
  </>
}

export function LocalEquipmentRow() {
  const count = useInstanceEquipment(s => s.inst.types.length)
  return <Row icon="kettlebell" iconTint="var(--orange)" title={t('Manage equipment types')}
    subtitle={count ? t('Added on this device: {0}', count) : t('Add equipment the list doesn’t have')}
    accessory="chevron" onClick={() => ui().openSheet(() => <LocalEquipmentSheet />)} />
}

/* ---------- signed in: propose, and see what became of it ---------- */

function ProposeSheet({ close, onSent }) {
  const nameRef = useRef(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    try {
      await api('/api/equipment/proposals', { method: 'POST', body: JSON.stringify({ name: name.trim(), note: note.trim(), lang: getLang() }) })
      ui().toast(t('Proposal sent'))
      onSent()
      close()
    } catch (e) {
      setErr(e.status === 409 ? t('That equipment type already exists.')
        : e.status === 429 ? t('You already have {0} proposals waiting for an answer.', PENDING_MAX)
          : e.status === 400 ? t('Use 1 to {0} characters.', NAME_MAX)
            : t('Couldn’t reach the server. Try again.'))
    } finally { setBusy(false) }
  }
  return <>
    <h3>{t('Propose equipment')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>
      {t('Missing something you train with? Your admin decides what goes on the list for everyone.')}
    </div>
    <input ref={nameRef} className="input" placeholder={t('Equipment name')} maxLength={NAME_MAX} value={name}
      onChange={e => { setName(e.target.value); setErr(null) }} />
    <div style={{ height: 10 }} />
    <textarea className="input" rows={2} maxLength={NOTE_MAX} value={note} placeholder={t('A note for the admin (optional)')}
      onChange={e => setNote(e.target.value)} />
    {err && <div className="small" style={errStyle}>{err}</div>}
    <div style={{ height: 14 }} />
    <Button variant="primary" disabled={!name.trim() || busy} onClick={send}>{t('Send')}</Button>
  </>
}

const STATUS = { pending: () => t('Pending'), approved: () => t('Approved'), rejected: () => t('Rejected') }

function ProposalsSheet({ proposals }) {
  return <>
    <h3>{t('My proposals')}</h3>
    {proposals.map(p => (
      <div key={p.id} className="item">
        <div className="grow"><div className="tt">{p.name}</div>
          <div className="ss">{STATUS[p.status]?.() || p.status}
            {p.status === 'approved' && p.typeName && p.typeName !== p.name ? ' · ' + t('added as "{0}"', p.typeName) : ''}</div></div>
      </div>
    ))}
  </>
}

export function ProposeEquipmentRows() {
  const [proposals, setProposals] = useState([])
  const load = () => api('/api/equipment/proposals').then(r => setProposals(Array.isArray(r?.proposals) ? r.proposals : [])).catch(() => {})
  useEffect(() => { load() }, [])
  const pending = proposals.filter(p => p.status === 'pending').length
  return <>
    <Row icon="plus" iconTint="var(--orange)" title={t('Propose equipment')} subtitle={t('Missing something? Ask your admin to add it.')}
      accessory="chevron" onClick={() => ui().openSheet(close => <ProposeSheet close={close} onSent={load} />)} />
    {proposals.length > 0 && <Row icon="list" iconTint="var(--blue)" title={t('My proposals')}
      subtitle={pending ? t('Waiting for an answer: {0}', pending) : t('All answered')} accessory="chevron"
      onClick={() => ui().openSheet(() => <ProposalsSheet proposals={proposals} />)} />}
  </>
}
