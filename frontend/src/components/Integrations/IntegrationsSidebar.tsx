import { useTheme } from '../../contexts/ThemeContext'
import { useIntegrations } from './IntegrationsContext'
import type { IntegrationTabItem } from './IntegrationsContext'
import RssFeedIcon from '@mui/icons-material/RssFeed'
import CodeIcon from '@mui/icons-material/Code'

const SIDEBAR_WIDTH = 220

function toTabItem(
  item: { type: 'source'; source: { id: string; sourceType: string; displayName?: string; config: Record<string, unknown> } } | { type: 'available'; kind: 'rss' | 'github' }
): IntegrationTabItem {
  if (item.type === 'source') {
    const cfg = item.source.config as { url?: string; login?: string }
    const title = item.source.displayName ||
      (item.source.sourceType === 'github' ? `GitHub${cfg?.login ? ` @${cfg.login}` : ''}` : cfg?.url) ||
      item.source.sourceType
    return { id: `int-source-${item.source.id}`, title, type: 'source', source: item.source as any }
  }
  const title = item.kind === 'rss' ? 'RSS Feed' : 'GitHub'
  return { id: `int-available-${item.kind}`, title, type: 'available', kind: item.kind }
}

interface IntegrationsSidebarProps {
  projectId: string | null
  onOpenInEditor: (tab: IntegrationTabItem) => void
}

export default function IntegrationsSidebar({ projectId, onOpenInEditor }: IntegrationsSidebarProps) {
  const { theme } = useTheme()
  const { sources, getStatusInfo } = useIntegrations()

  const bgColor = theme === 'dark' ? '#141414' : '#FAFAFA'
  const subTextColor = theme === 'dark' ? '#858585' : '#6e6e6e'

  const listItem = (label: string, sub?: string, icon?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      {icon && <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: subTextColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
    </div>
  )

  if (!projectId) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: subTextColor, fontSize: 13 }}>
        Open a project to manage integrations.
      </div>
    )
  }

  return (
    <div
      style={{
        width: SIDEBAR_WIDTH,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: bgColor,
        borderRight: `1px solid ${theme === 'dark' ? '#3c3c3c' : '#e0e0e0'}`,
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: subTextColor, textTransform: 'uppercase' }}>
          CONNECTED ({sources.length})
        </div>
        {sources.map(source => {
          const cfg = source.config as { url?: string; login?: string }
          const label = source.displayName || (source.sourceType === 'github' ? `GitHub${cfg.login ? ` @${cfg.login}` : ''}` : cfg.url) || source.sourceType
          return (
            <div
              key={source.id}
              onClick={() => onOpenInEditor(toTabItem({ type: 'source', source }))}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderLeft: `3px solid transparent`,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2d2e' : '#e8e8e8'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              {listItem(
                label,
                getStatusInfo(source).label,
                source.sourceType === 'github' ? <CodeIcon style={{ fontSize: 18, color: subTextColor }} /> : <RssFeedIcon style={{ fontSize: 18, color: subTextColor }} />
              )}
            </div>
          )
        })}
        <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: subTextColor, textTransform: 'uppercase', marginTop: 8 }}>
          AVAILABLE (2)
        </div>
        {[
          { kind: 'rss' as const, label: 'RSS Feed', sub: 'Blogs, news, podcasts', icon: <RssFeedIcon style={{ fontSize: 18, color: subTextColor }} /> },
          { kind: 'github' as const, label: 'GitHub', sub: 'Issues, PRs, repo files', icon: <CodeIcon style={{ fontSize: 18, color: subTextColor }} /> },
        ].map(({ kind, label, sub, icon }) => (
          <div
            key={kind}
            onClick={() => onOpenInEditor(toTabItem({ type: 'available', kind }))}
            style={{ padding: '8px 12px', cursor: 'pointer' }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2d2e' : '#e8e8e8'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            {listItem(label, sub, icon)}
          </div>
        ))}
      </div>
    </div>
  )
}
