import { NavLink, Outlet, Link } from 'react-router-dom'
import './AdminLayout.css'

function AdminLayout() {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link to="/admin" className="admin-logo">
          The Cincinnati Hotel
        </Link>
        <span className="admin-logo-sub">Admin</span>

        <nav className="admin-nav">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              isActive ? 'admin-nav-link admin-nav-link--active' : 'admin-nav-link'
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/admin/upload"
            className={({ isActive }) =>
              isActive ? 'admin-nav-link admin-nav-link--active' : 'admin-nav-link'
            }
          >
            Upload PDF Document
          </NavLink>
        </nav>

        <Link to="/" className="admin-exit-link">
          &larr; Exit to main site
        </Link>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout
