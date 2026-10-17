import { t } from '../../lib/i18n.js'
import AdminCoach from '../AdminCoach.jsx'
import { PageHeader } from './ui.jsx'

// The Coach setup, as it was on the old admin page: AdminCoach manages itself.
export default function Coach() {
  return <>
    <PageHeader title={t('AI Coach')} sub={t('Whether this instance offers the AI Coach, which provider it uses and how much it may spend.')} />
    <AdminCoach />
  </>
}
