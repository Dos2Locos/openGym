import { t } from '../../lib/i18n.js'
import Icon from '../../components/Icon.jsx'
import { Button } from '../../components/ui.jsx'

// The console's own building blocks, on top of the app's tokens and components/ui.jsx.

/** Page title, an optional line under it, and the page's actions on the right. */
export function PageHeader({ title, sub, actions, back }) {
  return <div className="con-ph">
    {back}
    <div className="con-ph-t">
      <h1>{title}</h1>
      {sub && <div className="con-ph-sub">{sub}</div>}
    </div>
    {actions && <div className="con-ph-act">{actions}</div>}
  </div>
}

/** A status word with a dot: never a colour to decode on its own. */
export const Pill = ({ tone, children, title }) =>
  <span className={'adm-pill' + (tone ? ' ' + tone : '')} title={title}>{children}</span>

export function EmptyState({ icon = 'info', title, children, action }) {
  return <div className="con-empty">
    <div className="con-empty-ico"><Icon name={icon} /></div>
    {title && <div className="con-empty-t">{title}</div>}
    {children && <div className="con-empty-b">{children}</div>}
    {action && <div className="con-empty-a">{action}</div>}
  </div>
}

/**
 * Why a load failed and a way to try again. `stale`: data from an earlier load is still on
 * screen, so this says it may be out of date rather than replacing it.
 */
export function ErrorState({ message, onRetry, stale }) {
  return <div className="con-error" role="alert">
    <Icon name="warning" />
    <div className="grow">
      <div className="con-error-t">{stale ? t('The last update failed') : t('Could not load')}</div>
      <div className="con-error-b">{message}{stale ? ' ' + t('What you see may be out of date.') : ''}</div>
    </div>
    {onRetry && <Button size="sm" icon="reset" onClick={onRetry}>{t('Try again')}</Button>}
  </div>
}

export const Loading = () => <div className="con-loading" aria-busy="true">{t('Loading…')}</div>

/**
 * A semantic table. Columns: { key, label, sort?, render(row), primary?, align?, narrow? }.
 * `sort` is the current sort ('key' or '-key'); a column with `sort: true` gets a header button
 * that flips between ascending and descending. On a narrow screen console.css turns every row
 * into a card: the `primary` cell on top, the others as "label value" lines under it, and a
 * column with `narrow: false` left out there.
 */
export function DataTable({ columns, rows, rowKey, onRowClick, rowLabel, sort, onSort, rowClass }) {
  const cur = typeof sort === 'string' ? sort.replace(/^-/, '') : null
  const desc = typeof sort === 'string' && sort.startsWith('-')
  const flip = c => onSort(cur === c.key && !desc ? '-' + c.key : c.key)
  return <table className="con-table">
    <thead>
      <tr>{columns.map(c => <th key={c.key} scope="col" className={c.align === 'end' ? 'end' : ''}
        aria-sort={c.sort && cur === c.key ? (desc ? 'descending' : 'ascending') : undefined}>
        {c.sort && onSort
          ? <button className="con-sort" onClick={() => flip(c)}>
              {c.label}<Icon name={cur === c.key ? (desc ? 'chevronDown' : 'chevronUp') : 'chevronsUpDown'} />
            </button>
          : c.label}
      </th>)}</tr>
    </thead>
    <tbody>
      {rows.map(r => <tr key={rowKey(r)} className={rowClass?.(r) || ''}
        {...(onRowClick ? {
          tabIndex: 0, role: 'link', 'aria-label': rowLabel?.(r),
          onClick: () => onRowClick(r),
          onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(r) } }
        } : {})}>
        {columns.map(c => <td key={c.key} data-label={c.primary ? undefined : c.label}
          className={[c.primary ? 'primary' : '', c.align === 'end' ? 'end' : '', c.narrow === false ? 'wide-only' : ''].join(' ').trim() || undefined}>
          {c.render ? c.render(r) : r[c.key]}
        </td>)}
      </tr>)}
    </tbody>
  </table>
}

/** A figure with its label, for the overview. */
export const Stat = ({ label, value, tone }) =>
  <div className="con-stat"><div className="con-stat-l">{label}</div><div className={'con-stat-v' + (tone ? ' ' + tone : '')}>{value}</div></div>
