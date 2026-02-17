import { IntegrationItem, IntegrationSource } from '../integrationTypes.js'

const LINEAR_API = 'https://api.linear.app/graphql'
const ISSUE_PAGE_SIZE = 50
const MAX_ISSUE_PAGES = 4

interface LinearGraphqlResponse<T> {
  data?: T
  errors?: Array<{ message?: string }>
}

interface LinearIssueNode {
  id: string
  identifier?: string
  title?: string
  description?: string
  updatedAt?: string
  createdAt?: string
  url?: string
  priority?: number | null
  state?: { name?: string | null } | null
  team?: { key?: string | null; name?: string | null } | null
  project?: { name?: string | null } | null
  cycle?: { name?: string | null; number?: number | null } | null
  assignee?: { name?: string | null } | null
  labels?: { nodes?: Array<{ name?: string | null }> | null } | null
}

interface LinearIssuesResult {
  issues?: {
    nodes?: LinearIssueNode[]
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }
  }
}

interface LinearProjectNode {
  id: string
  name?: string
  description?: string | null
  state?: string | null
  updatedAt?: string
  createdAt?: string
  url?: string
}

interface LinearCycleNode {
  id: string
  number?: number | null
  name?: string | null
  startsAt?: string | null
  endsAt?: string | null
  progress?: number | null
  updatedAt?: string
  team?: { key?: string | null; name?: string | null } | null
}

interface LinearProjectsResult {
  projects?: { nodes?: LinearProjectNode[] }
}

interface LinearCyclesResult {
  cycles?: { nodes?: LinearCycleNode[] }
}

function requireLinearApiKey(source: IntegrationSource): string {
  const apiKey = (source.config as { apiKey?: unknown })?.apiKey
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('Linear API key is missing. Reconnect Linear and try again.')
  }
  return apiKey.trim()
}

async function linearGraphql<T>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    const body = await response.text()
    const error = new Error(`Linear API request failed (${response.status})`)
    ;(error as any).status = response.status
    ;(error as any).body = body
    throw error
  }

  const payload = (await response.json()) as LinearGraphqlResponse<T>
  if (payload.errors && payload.errors.length > 0) {
    throw new Error(payload.errors.map(err => err?.message || 'Unknown Linear error').join('; '))
  }
  if (!payload.data) {
    throw new Error('Linear API returned empty data')
  }

  return payload.data
}

function joinLines(lines: Array<string | undefined | null>): string {
  return lines
    .map(line => (typeof line === 'string' ? line.trim() : ''))
    .filter(Boolean)
    .join('\n')
}

function mapIssueToItem(source: IntegrationSource, issue: LinearIssueNode): IntegrationItem | null {
  const id = issue.identifier || issue.id
  const title = (issue.title || '').trim()
  if (!id || !title) return null

  const labels = Array.isArray(issue.labels?.nodes)
    ? issue.labels.nodes.map(label => label?.name).filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    : []

  const content = joinLines([
    issue.description || '',
    issue.state?.name ? `State: ${issue.state.name}` : '',
    issue.team?.name ? `Team: ${issue.team.name}${issue.team.key ? ` (${issue.team.key})` : ''}` : '',
    issue.project?.name ? `Project: ${issue.project.name}` : '',
    issue.cycle?.name ? `Cycle: ${issue.cycle.name}${issue.cycle.number ? ` (#${issue.cycle.number})` : ''}` : '',
    issue.assignee?.name ? `Assignee: ${issue.assignee.name}` : '',
    typeof issue.priority === 'number' ? `Priority: ${issue.priority}` : '',
    labels.length > 0 ? `Labels: ${labels.join(', ')}` : '',
    issue.url ? `URL: ${issue.url}` : '',
  ])

  return {
    sourceId: source.id,
    sourceType: 'linear',
    id: `issue:${id}`,
    externalId: `issue:${id}`,
    title: `[Linear] ${id} ${title}`,
    content,
    updatedAt: issue.updatedAt || issue.createdAt || new Date().toISOString(),
    metadata: {
      itemType: 'issue',
      identifier: id,
      url: issue.url,
      state: issue.state?.name || undefined,
      team: issue.team?.key || issue.team?.name || undefined,
      project: issue.project?.name || undefined,
    },
  }
}

function mapProjectToItem(source: IntegrationSource, project: LinearProjectNode): IntegrationItem | null {
  if (!project.id || !project.name) return null
  const content = joinLines([
    project.description || '',
    project.state ? `State: ${project.state}` : '',
    project.url ? `URL: ${project.url}` : '',
  ])

  return {
    sourceId: source.id,
    sourceType: 'linear',
    id: `project:${project.id}`,
    externalId: `project:${project.id}`,
    title: `[Linear Project] ${project.name}`,
    content,
    updatedAt: project.updatedAt || project.createdAt || new Date().toISOString(),
    metadata: {
      itemType: 'project',
      url: project.url,
      state: project.state || undefined,
    },
  }
}

function mapCycleToItem(source: IntegrationSource, cycle: LinearCycleNode): IntegrationItem | null {
  if (!cycle.id) return null
  const cycleName = cycle.name || (typeof cycle.number === 'number' ? `Cycle #${cycle.number}` : `Cycle ${cycle.id}`)
  const content = joinLines([
    cycle.team?.name ? `Team: ${cycle.team.name}${cycle.team.key ? ` (${cycle.team.key})` : ''}` : '',
    cycle.startsAt ? `Starts: ${cycle.startsAt}` : '',
    cycle.endsAt ? `Ends: ${cycle.endsAt}` : '',
    typeof cycle.progress === 'number' ? `Progress: ${Math.round(cycle.progress * 100)}%` : '',
  ])

  return {
    sourceId: source.id,
    sourceType: 'linear',
    id: `cycle:${cycle.id}`,
    externalId: `cycle:${cycle.id}`,
    title: `[Linear Cycle] ${cycleName}`,
    content,
    updatedAt: cycle.updatedAt || cycle.startsAt || new Date().toISOString(),
    metadata: {
      itemType: 'cycle',
      team: cycle.team?.key || cycle.team?.name || undefined,
      number: cycle.number || undefined,
    },
  }
}

async function fetchLinearIssues(apiKey: string): Promise<LinearIssueNode[]> {
  const issues: LinearIssueNode[] = []
  let after: string | null = null
  let page = 0

  while (page < MAX_ISSUE_PAGES) {
    const data: LinearIssuesResult = await linearGraphql<LinearIssuesResult>(
      apiKey,
      `
      query LinearIssues($first: Int!, $after: String) {
        issues(first: $first, after: $after, orderBy: updatedAt) {
          nodes {
            id
            identifier
            title
            description
            updatedAt
            createdAt
            url
            priority
            state { name }
            team { key name }
            project { name }
            cycle { name number }
            assignee { name }
            labels { nodes { name } }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      `,
      { first: ISSUE_PAGE_SIZE, after }
    )

    const pageIssues = Array.isArray(data.issues?.nodes) ? data.issues!.nodes! : []
    issues.push(...pageIssues)

    const hasNext = Boolean(data.issues?.pageInfo?.hasNextPage)
    const endCursor: string | null = data.issues?.pageInfo?.endCursor || null
    if (!hasNext || !endCursor) break

    after = endCursor
    page += 1
  }

  return issues
}

async function fetchLinearProjects(apiKey: string): Promise<LinearProjectNode[]> {
  const data = await linearGraphql<LinearProjectsResult>(
    apiKey,
    `
    query LinearProjects {
      projects(first: 50, orderBy: updatedAt) {
        nodes {
          id
          name
          description
          state
          updatedAt
          createdAt
          url
        }
      }
    }
    `
  )
  return Array.isArray(data.projects?.nodes) ? data.projects!.nodes! : []
}

async function fetchLinearCycles(apiKey: string): Promise<LinearCycleNode[]> {
  const data = await linearGraphql<LinearCyclesResult>(
    apiKey,
    `
    query LinearCycles {
      cycles(first: 30) {
        nodes {
          id
          number
          name
          startsAt
          endsAt
          progress
          updatedAt
          team { key name }
        }
      }
    }
    `
  )
  return Array.isArray(data.cycles?.nodes) ? data.cycles!.nodes! : []
}

export async function fetchLinearItems(source: IntegrationSource): Promise<IntegrationItem[]> {
  const apiKey = requireLinearApiKey(source)
  const [issues, projects, cycles] = await Promise.all([
    fetchLinearIssues(apiKey),
    fetchLinearProjects(apiKey),
    fetchLinearCycles(apiKey),
  ])

  const items: IntegrationItem[] = []
  for (const issue of issues) {
    const item = mapIssueToItem(source, issue)
    if (item) items.push(item)
  }
  for (const project of projects) {
    const item = mapProjectToItem(source, project)
    if (item) items.push(item)
  }
  for (const cycle of cycles) {
    const item = mapCycleToItem(source, cycle)
    if (item) items.push(item)
  }

  return items
}
