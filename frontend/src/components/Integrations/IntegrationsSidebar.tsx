import React from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { useIntegrations } from './IntegrationsContext'
import type { IntegrationTabItem } from './IntegrationsContext'
import { AVAILABLE_INTEGRATIONS, getIntegrationLabel, getIntegrationLogoSrc, IntegrationLogoImg, type AvailableIntegrationKind } from './availableIntegrations'

const SIDEBAR_WIDTH = 220

function toTabItem(
  item: { type: 'source'; source: { id: string; sourceType: string; displayName?: string; config: Record<string, unknown> } } | { type: 'available'; kind: AvailableIntegrationKind }
): IntegrationTabItem {
  if (item.type === 'source') {
    const cfg = item.source.config as { url?: string; login?: string; teamName?: string; workspaceName?: string; companyName?: string }
    const fallbackTitle = item.source.sourceType === 'github'
      ? `GitHub${cfg?.login ? ` @${cfg.login}` : ''}`
      : item.source.sourceType === 'gitlab'
        ? `GitLab${cfg?.login ? ` @${cfg.login}` : ''}`
        : item.source.sourceType === 'slack'
          ? `Slack${cfg?.teamName ? ` (${cfg.teamName})` : ''}`
          : item.source.sourceType === 'notion'
            ? `Notion${cfg?.workspaceName ? ` (${cfg.workspaceName})` : ''}`
            : item.source.sourceType === 'quickbooks'
              ? `QuickBooks${cfg?.companyName ? ` (${cfg.companyName})` : ''}`
              : item.source.sourceType === 'rss'
        ? (cfg?.url || 'RSS')
        : getIntegrationLabel(item.source.sourceType as AvailableIntegrationKind)
    const title = item.source.displayName ||
      fallbackTitle ||
      item.source.sourceType
    return { id: `int-source-${item.source.id}`, title, type: 'source', source: item.source as any }
  }
  return { id: `int-available-${item.kind}`, title: getIntegrationLabel(item.kind), type: 'available', kind: item.kind }
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
          const cfg = source.config as { url?: string; login?: string; teamName?: string; workspaceName?: string; companyName?: string }
          const label = source.displayName ||
            (source.sourceType === 'github'
              ? `GitHub${cfg.login ? ` @${cfg.login}` : ''}`
              : source.sourceType === 'gitlab'
                ? `GitLab${cfg.login ? ` @${cfg.login}` : ''}`
                : source.sourceType === 'slack'
                  ? `Slack${cfg.teamName ? ` (${cfg.teamName})` : ''}`
                  : source.sourceType === 'notion'
                    ? `Notion${cfg.workspaceName ? ` (${cfg.workspaceName})` : ''}`
                    : source.sourceType === 'quickbooks'
                      ? `QuickBooks${cfg.companyName ? ` (${cfg.companyName})` : ''}`
                      : source.sourceType === 'rss'
                ? (cfg.url || 'RSS')
                : getIntegrationLabel(source.sourceType as AvailableIntegrationKind)) ||
            source.sourceType
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
                getIntegrationLogoSrc(source.sourceType) ? (
                  <IntegrationLogoImg kind={source.sourceType} size={18} />
                ) : null
              )}
            </div>
          )
        })}
        <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: subTextColor, textTransform: 'uppercase', marginTop: 8 }}>
          AVAILABLE ({AVAILABLE_INTEGRATIONS.filter(i => !sources.some(s => s.sourceType === i.kind)).length})
        </div>
        {AVAILABLE_INTEGRATIONS.filter(i => !sources.some(s => s.sourceType === i.kind)).map(({ kind, label, sub, icon }) => (
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
