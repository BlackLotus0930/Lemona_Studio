import { useTheme } from '../../contexts/ThemeContext'
import './TopBar.css'

interface TopBarProps {
  // Add any props you need for menu actions
}

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.electron !== undefined

export default function TopBar({}: TopBarProps) {
  const { theme } = useTheme()
  
  const menuItems = [
    'File',
    'Edit',
    'Selection',
    'View',
    'Go',
    'Run',
    'Terminal',
    'Help'
  ]

  const handleMinimize = () => {
    if (isElectron && window.electron) {
      window.electron.invoke('window:minimize')
    }
  }

  const handleMaximize = () => {
    if (isElectron && window.electron) {
      window.electron.invoke('window:maximize')
    }
  }

  const handleClose = () => {
    if (isElectron && window.electron) {
      window.electron.invoke('window:close')
    }
  }

  return (
    <div className={`topbar ${theme === 'dark' ? 'topbar-dark' : 'topbar-light'}`}>
      <div className="topbar-content">
        {/* Logo */}
        <div className="topbar-logo">
          <img 
            src="/lemonalogo.png" 
            alt="Lemona" 
            className="logo-image"
          />
        </div>
        
        {/* Menu Items */}
        <div className="topbar-menu">
          {menuItems.map((item) => (
            <button
              key={item}
              className="menu-item"
              onClick={() => {
                // TODO: Implement menu actions
                console.log(`Menu: ${item}`)
              }}
            >
              {item}
            </button>
          ))}
        </div>
        
        {/* Right side - Window controls on Windows/Linux */}
        <div className="topbar-right">
          {isElectron && window.electron && window.electron.platform !== 'darwin' && (
            <div className="window-controls">
              <button 
                className="window-control-btn minimize-btn"
                onClick={handleMinimize}
                title="Minimize"
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <rect x="0" y="5" width="12" height="1" fill="currentColor" />
                </svg>
              </button>
              <button 
                className="window-control-btn maximize-btn"
                onClick={handleMaximize}
                title="Maximize / Restore"
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
                </svg>
              </button>
              <button 
                className="window-control-btn close-btn"
                onClick={handleClose}
                title="Close"
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M1 1 L11 11 M11 1 L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
