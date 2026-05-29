import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { PinGate } from './components/PinGate';
import { PortraitGate } from './components/PortraitGate';
import { Grid } from './pages/Grid';
import { SettingsLayout } from './pages/SettingsLayout';
import { AssignmentsPanel } from './pages/settings/AssignmentsPanel';
import { BlocksPanel } from './pages/settings/BlocksPanel';
import { ChangePinPanel } from './pages/settings/ChangePinPanel';
import { ChildrenPanel } from './pages/settings/ChildrenPanel';
import { GeneralPanel } from './pages/settings/GeneralPanel';
import { ReportsPanel } from './pages/settings/ReportsPanel';
import { TasksPanel } from './pages/settings/TasksPanel';

export default function App() {
  return (
    <>
      <PortraitGate />
      <AppShell>
        <Routes>
          <Route path="/" element={<Grid />} />
          <Route element={<PinGate />}>
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="children" replace />} />
              <Route path="children" element={<ChildrenPanel />} />
              <Route path="blocks" element={<BlocksPanel />} />
              <Route path="tasks" element={<TasksPanel />} />
              <Route path="assignments" element={<AssignmentsPanel />} />
              <Route path="reports" element={<ReportsPanel />} />
              <Route path="general" element={<GeneralPanel />} />
              <Route path="pin" element={<ChangePinPanel />} />
            </Route>
          </Route>
        </Routes>
      </AppShell>
    </>
  );
}
