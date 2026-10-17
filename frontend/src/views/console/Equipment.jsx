import { useEffect, useState } from 'react'
import { useUI } from '../../store/useUI.js'
import { api } from '../../lib/api.js'
import { t } from '../../lib/i18n.js'
import { fmtSeen } from '../../lib/console-users.js'
import { refreshInstanceEquipment } from '../../lib/instance-equipment.js'
import { EquipmentManager } from '../../components/EquipmentTypes.jsx'
import { Button } from '../../components/ui.jsx'
import { PageHeader, ErrorState, Loading } from './ui.jsx'

// Equipment types this instance adds to the catalogue (api/equipment.js): the list everyone's
// profiles and custom exercises pick from, what catalogue exercises need besides their own
// equipment, and what users have asked to have added.
const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) })
const codeOf = e => (e?.status === 409 ? 'exists' : e?.status === 400 ? 'name' : 'other')

export default function Equipment() {
  const toast = useUI(s => s.toast)
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [approving, setApproving] = useState(null)   // { id, name } while the name is checked
  const load = () => api('/api/admin/equipment').then(r => { setData(r); setErr(null) }).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])
  // Every change reloads the page, and this admin's own app takes the new list at once.
  const done = () => { load(); refreshInstanceEquipment(() => api('/api/equipment'), { force: true }) }
  const save = p => p.then(() => { done(); return null }, e => codeOf(e))
  const ops = {
    add: name => save(post('/api/admin/equipment/types', { name })),
    rename: (id, name) => save(post('/api/admin/equipment/types', { id, name })),
    remove: id => save(post('/api/admin/equipment/types/delete', { id })),
    setNames: (id, names) => save(post('/api/admin/equipment/types', { id, name: data.types.find(x => x.id === id)?.name, names })),
    setNeeds: (exId, types) => save(post('/api/admin/equipment/needs', { exId, types })),
  }
  const resolve = body => post('/api/admin/equipment/proposals/resolve', body)
    .then(() => { setApproving(null); done() })
    .catch(e => toast(e.status === 409 ? t('That equipment type already exists. Merge it instead, or pick another name.') : e.message))
  const merge = (p, typeId) => typeId && resolve({ id: p.id, action: 'merge', typeId })

  const pending = data ? data.proposals.filter(p => p.status === 'pending') : []
  const answered = data ? data.proposals.filter(p => p.status !== 'pending').slice(0, 10) : []
  const author = p => p.author || t('a deleted user')

  return <>
    <PageHeader title={t('Equipment')}
      sub={t('Equipment the catalogue doesn’t have. Everyone on this instance can tick these in their equipment profiles and pick them for their own exercises.')} />
    {err && <ErrorState message={err} onRetry={load} stale={!!data} />}
    {!data && !err && <Loading />}
    {data && <>
      {pending.length > 0 && <section className="con-panel" aria-labelledby="con-eq-prop">
        <h2 id="con-eq-prop">{t('Proposals waiting · {0}', pending.length)}</h2>
        <div className="con-lead">{t('Types people have asked for. Approve one as it is or under a better name, merge it into a type you already have, or reject it.')}</div>
        {pending.map(p => <div key={p.id} className="con-row" style={{ display: 'block' }}>
          <div className="con-row-t">{p.name}</div>
          <div className="con-row-s">{author(p) + ' · ' + fmtSeen(p.at)}{p.note ? ' · “' + p.note + '”' : ''}</div>
          {approving?.id === p.id
            ? <div className="row" style={{ gap: 6, marginTop: 8 }}>
                <input className="input" maxLength={40} value={approving.name} aria-label={t('Name')}
                  onChange={e => setApproving({ ...approving, name: e.target.value })} />
                <Button size="sm" variant="primary" onClick={() => resolve({ id: p.id, action: 'approve', name: approving.name.trim() })}>{t('Add')}</Button>
                <Button size="sm" onClick={() => setApproving(null)}>{t('Cancel')}</Button>
              </div>
            : <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Button size="sm" variant="tinted" onClick={() => setApproving({ id: p.id, name: p.name })}>{t('Approve')}</Button>
                <Button size="sm" onClick={() => resolve({ id: p.id, action: 'reject' })}>{t('Reject')}</Button>
                {data.types.length > 0 && <select className="con-select" value="" aria-label={t('Merge into')}
                  onChange={e => merge(p, e.target.value)}>
                  <option value="">{t('Merge into…')}</option>
                  {data.types.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>}
              </div>}
        </div>)}
      </section>}
      <section className="con-panel">
        <EquipmentManager inst={data} ops={ops} />
      </section>
      {answered.length > 0 && <section className="con-panel" aria-labelledby="con-eq-ans">
        <h2 id="con-eq-ans">{t('Answered proposals')}</h2>
        {answered.map(p => <div key={p.id} className="con-row">
          <span className="grow">{p.name} <span className="dim">· {author(p)}</span></span>
          <span className="con-row-s" style={{ marginTop: 0 }}>{p.status === 'rejected' ? t('rejected') : p.typeName && p.typeName !== p.name ? '→ ' + p.typeName : t('added')}</span>
        </div>)}
      </section>}
    </>}
  </>
}
