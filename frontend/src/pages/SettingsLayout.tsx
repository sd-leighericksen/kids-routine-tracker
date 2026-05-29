import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearStoredPin } from '../api';

const navItems = [
  { to: 'children', label: 'Children' },
  { to: 'blocks', label: 'Time blocks' },
  { to: 'tasks', label: 'Tasks' },
  { to: 'assignments', label: 'Assignments' },
  { to: 'reports', label: 'Reports' },
];

export function SettingsLayout() {
  const navigate = useNavigate();

  const handleExit = () => {
    clearStoredPin();
    navigate('/');
  };

  return (
    <div className="flex h-full w-full">
      <aside className="flex h-full w-64 shrink-0 flex-col border-r border-hairline-soft bg-surface-soft p-6">
        <h1 className="text-h5 text-ink">Parent settings</h1>
        <nav className="mt-6 flex flex-col gap-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-full px-4 py-3 text-button-md transition-colors ${
                  isActive
                    ? 'bg-primary text-on-primary'
                    : 'text-ink active:bg-surface'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1.5 border-t border-hairline-soft pt-4">
          <NavLink
            to="general"
            className={({ isActive }) =>
              `rounded-full px-4 py-3 text-button-md transition-colors ${
                isActive
                  ? 'bg-primary text-on-primary'
                  : 'text-ink active:bg-surface'
              }`
            }
          >
            General
          </NavLink>
          <NavLink
            to="webhooks"
            className={({ isActive }) =>
              `rounded-full px-4 py-3 text-button-md transition-colors ${
                isActive
                  ? 'bg-primary text-on-primary'
                  : 'text-ink active:bg-surface'
              }`
            }
          >
            Webhooks
          </NavLink>
          <NavLink
            to="pin"
            className={({ isActive }) =>
              `rounded-full px-4 py-3 text-button-md transition-colors ${
                isActive
                  ? 'bg-primary text-on-primary'
                  : 'text-ink active:bg-surface'
              }`
            }
          >
            Change PIN
          </NavLink>
          <button
            type="button"
            onClick={handleExit}
            className="rounded-full px-4 py-3 text-left text-button-md text-slate active:bg-surface"
          >
            Exit settings
          </button>
        </div>
      </aside>
      <main className="flex h-full flex-1 flex-col overflow-hidden bg-canvas">
        <div className="flex-1 overflow-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
