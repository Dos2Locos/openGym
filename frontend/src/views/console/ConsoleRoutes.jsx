import { Routes, Route, Navigate } from 'react-router-dom'
import ConsoleShell, { SectionGate } from './ConsoleShell.jsx'
import Overview from './Overview.jsx'
import Users from './Users.jsx'
import UserPage from './UserPage.jsx'
import Invites from './Invites.jsx'
import Equipment from './Equipment.jsx'
import Coach from './Coach.jsx'
import Activity from './Activity.jsx'

// /console/* — mounted by App.jsx in place of the app (no #app, no tab bar). Each route sits
// behind SectionGate, so a section this user may not see is not reachable by typing its URL.
const gate = (id, el) => <SectionGate id={id}>{el}</SectionGate>

export default function ConsoleRoutes() {
  return <Routes>
    <Route path="/console" element={<ConsoleShell />}>
      <Route index element={gate('overview', <Overview />)} />
      <Route path="users" element={gate('users', <Users />)} />
      <Route path="users/:id" element={gate('users', <UserPage />)} />
      <Route path="invites" element={gate('invites', <Invites />)} />
      <Route path="equipment" element={gate('equipment', <Equipment />)} />
      <Route path="coach" element={gate('coach', <Coach />)} />
      <Route path="activity" element={gate('activity', <Activity />)} />
      <Route path="*" element={<Navigate to="/console" replace />} />
    </Route>
  </Routes>
}
