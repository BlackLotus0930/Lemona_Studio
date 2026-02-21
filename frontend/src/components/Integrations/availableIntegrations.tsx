import React from 'react'
import { useTheme } from '../../contexts/ThemeContext'

const LOGO_SIZE = 18

/** Black SVGs that need invert(1) in dark theme to appear bright */
const DARK_INVERT_KINDS = new Set(['github', 'linear', 'quickbooks', 'rss'])

/** Use relative paths so icons work in packaged Electron app (file:// protocol). Absolute /integrations/... fails because / resolves to filesystem root. */
const LOGO_MAP: Record<string, string> = {
  github: './integrations/github-svgrepo-com.svg',
  gitlab: './integrations/gitlab-svgrepo-com.svg',
  slack: './integrations/slack-svgrepo-com.svg',
  linear: './integrations/linear-svgrepo-com.svg',
  stripe: './integrations/stripe-v2-svgrepo-com.svg',
  hubspot: './integrations/hubspot-svgrepo-com.svg',
  sentry: './integrations/sentry-svgrepo-com.svg',
  posthog: './integrations/posthog-light.svg',
  'db-schema': './integrations/database-svgrepo-com.svg',
  notion: './integrations/notion-svgrepo-com.svg',
  quickbooks: './integrations/brand-quickbooks-svgrepo-com.svg',
  metabase: './integrations/metabase-svgrepo-com.svg',
  rss: './integrations/rss-svgrepo-com.svg',
}

export function getIntegrationLogoSrc(kind: string): string {
  return LOGO_MAP[kind] ?? ''
}

/** Renders integration logo img with theme-aware filter (bright in dark theme for black SVGs) */
export function IntegrationLogoImg({ kind, size = LOGO_SIZE }: { kind: string; size?: number }) {
  const { theme } = useTheme()
  const src = getIntegrationLogoSrc(kind)
  if (!src) return null
  const shouldInvert = theme === 'dark' && DARK_INVERT_KINDS.has(kind)
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{
        flexShrink: 0,
        objectFit: 'contain',
        ...(shouldInvert ? { filter: 'invert(1)' } : {}),
      }}
    />
  )
}

function IntegrationLogo({ kind, size = LOGO_SIZE }: { kind: string; size?: number }) {
  return <IntegrationLogoImg kind={kind} size={size} />
}

export type AvailableIntegrationKind =
  | 'rss'
  | 'github'
  | 'gitlab'
  | 'slack'
  | 'linear'
  | 'stripe'
  | 'hubspot'
  | 'sentry'
  | 'posthog'
  | 'db-schema'
  | 'notion'
  | 'quickbooks'
  | 'metabase'

export interface AvailableIntegrationItem {
  kind: AvailableIntegrationKind
  label: string
  sub: string
  icon: React.ReactNode
}

export const AVAILABLE_INTEGRATIONS: AvailableIntegrationItem[] = [
  { kind: 'github', label: 'GitHub', sub: 'Repo files, Issues, PRs', icon: <IntegrationLogo kind="github" /> },
  { kind: 'gitlab', label: 'GitLab', sub: 'Repos, Issues, MRs', icon: <IntegrationLogo kind="gitlab" /> },
  { kind: 'slack', label: 'Slack', sub: 'Team conversations, channels', icon: <IntegrationLogo kind="slack" /> },
  { kind: 'linear', label: 'Linear', sub: 'Issues, projects, cycles', icon: <IntegrationLogo kind="linear" /> },
  { kind: 'stripe', label: 'Stripe', sub: 'Payments, subscriptions', icon: <IntegrationLogo kind="stripe" /> },
  { kind: 'hubspot', label: 'HubSpot', sub: 'CRM, contacts, deals', icon: <IntegrationLogo kind="hubspot" /> },
  { kind: 'sentry', label: 'Sentry', sub: 'Errors, performance', icon: <IntegrationLogo kind="sentry" /> },
  { kind: 'posthog', label: 'PostHog', sub: 'Product analytics', icon: <IntegrationLogo kind="posthog" /> },
  { kind: 'notion', label: 'Notion', sub: 'Docs, wikis', icon: <IntegrationLogo kind="notion" /> },
  { kind: 'quickbooks', label: 'QuickBooks', sub: 'Accounting, invoices', icon: <IntegrationLogo kind="quickbooks" /> },
  { kind: 'metabase', label: 'Metabase', sub: 'BI, dashboards, queries', icon: <IntegrationLogo kind="metabase" /> },
  { kind: 'db-schema', label: 'DB Schema', sub: 'Migrations, ORM metadata', icon: <IntegrationLogo kind="db-schema" /> },
  { kind: 'rss', label: 'RSS Feed', sub: 'Blogs, news, podcasts', icon: <IntegrationLogo kind="rss" /> },
]

export function getIntegrationLabel(kind: AvailableIntegrationKind): string {
  return AVAILABLE_INTEGRATIONS.find((i) => i.kind === kind)?.label ?? kind
}
