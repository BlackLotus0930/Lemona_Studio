import { IntegrationItem, IntegrationSource } from '../integrationTypes.js'

const MAX_FILE_SIZE = 100_000
const MAX_FILES_PER_REPO = 150
const INCLUDE_EXT = new Set([
  '.md', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.kt', '.go', '.rs',
  '.cpp', '.c', '.h', '.hpp', '.json', '.yaml', '.yml', '.toml', '.txt', '.html', '.htm',
  '.css', '.scss', '.less', '.vue', '.svelte', '.graphql', '.sql', '.sh', '.bash',
])
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '__pycache__', '.next', 'coverage',
  'vendor', '.venv', 'venv', '.tox', '.gradle', 'target', '.idea', '.vscode',
])
const INCLUDE_EXTENSIONLESS = new Set([
  'readme', 'license', 'makefile', 'dockerfile', 'changelog', 'authors', 'contributing',
])

const GITLAB_API = 'https://gitlab.com/api/v4'

interface GitlabProject {
  id: number
  path_with_namespace: string
  path: string
  name: string
  web_url: string
  default_branch?: string
}

interface GitlabTreeEntry {
  id: string
  name: string
  type: 'blob' | 'tree'
  path: string
  mode?: string
}

interface GitlabFile {
  file_name: string
  file_path: string
  content?: string
  encoding?: string
  size?: number
  ref?: string
}

interface GitlabIssue {
  id: number
  iid: number
  title: string
  description: string | null
  web_url: string
  state: string
  created_at: string
  updated_at: string
  author?: { username?: string }
}

interface GitlabMergeRequest {
  id: number
  iid: number
  title: string
  description: string | null
  web_url: string
  state: string
  created_at: string
  updated_at: string
  author?: { username?: string }
}

function getReposFromConfig(source: IntegrationSource): string[] {
  const config = source.config as { repos?: unknown }
  if (!Array.isArray(config?.repos)) {
    return []
  }
  return config.repos
    .filter((repo): repo is string => typeof repo === 'string' && repo.trim().length > 0)
    .map(repo => repo.trim())
}

async function gitlabFetch<T>(path: string, token: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${GITLAB_API}${path}`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Lemona-Desktop',
    },
  })
  if (!response.ok) {
    const text = await response.text()
    const error = new Error(`GitLab API request failed (${response.status})`)
    ;(error as { status?: number; body?: string }).status = response.status
    ;(error as { status?: number; body?: string }).body = text
    throw error
  }
  return (await response.json()) as T
}

export async function fetchGitlabRepos(token: string): Promise<string[]> {
  const projects = await gitlabFetch<GitlabProject[]>(
    '/projects?membership=true&order_by=last_activity_at&per_page=100',
    token
  )
  return projects.map(p => p.path_with_namespace).filter(Boolean)
}

function shouldIncludeFile(path: string, _size?: number): boolean {
  const parts = path.split('/')
  for (const part of parts) {
    if (EXCLUDE_DIRS.has(part.toLowerCase())) return false
  }
  const ext = path.includes('.') ? '.' + path.split('.').pop()!.toLowerCase() : ''
  if (INCLUDE_EXT.has(ext)) return true
  const baseName = path.split('/').pop()?.toLowerCase() ?? ''
  return INCLUDE_EXTENSIONLESS.has(baseName)
}

function mapIssueToIntegrationItem(sourceId: string, projectPath: string, issue: GitlabIssue): IntegrationItem {
  return {
    sourceId,
    sourceType: 'gitlab',
    id: `${projectPath}:issue:${issue.iid}`,
    externalId: `${projectPath}:issue:${issue.iid}`,
    title: `[${projectPath}] #${issue.iid} ${issue.title}`,
    content: issue.description || '',
    metadata: {
      url: issue.web_url,
      author: issue.author?.username || '',
      state: issue.state,
      createdAt: issue.created_at,
      itemType: 'issue',
      repo: projectPath,
    },
    updatedAt: issue.updated_at || issue.created_at,
  }
}

function mapMrToIntegrationItem(sourceId: string, projectPath: string, mr: GitlabMergeRequest): IntegrationItem {
  return {
    sourceId,
    sourceType: 'gitlab',
    id: `${projectPath}:mr:${mr.iid}`,
    externalId: `${projectPath}:mr:${mr.iid}`,
    title: `[${projectPath}] !${mr.iid} ${mr.title}`,
    content: mr.description || '',
    metadata: {
      url: mr.web_url,
      author: mr.author?.username || '',
      state: mr.state,
      createdAt: mr.created_at,
      itemType: 'pull_request',
      repo: projectPath,
    },
    updatedAt: mr.updated_at || mr.created_at,
  }
}

function mapFileToIntegrationItem(
  sourceId: string,
  projectPath: string,
  path: string,
  content: string,
  ref: string,
  webUrl?: string
): IntegrationItem {
  return {
    sourceId,
    sourceType: 'gitlab',
    id: `${projectPath}:file:${path}`,
    externalId: `${projectPath}:file:${path}`,
    title: `[${projectPath}] ${path}`,
    content,
    metadata: {
      url: webUrl || `https://gitlab.com/${projectPath}/-/blob/${ref}/${path}`,
      itemType: 'file',
      repo: projectPath,
      path,
    },
    updatedAt: new Date().toISOString(),
  }
}

async function getDefaultBranch(projectPath: string, token: string): Promise<string> {
  const encoded = encodeURIComponent(projectPath)
  const project = await gitlabFetch<GitlabProject>(`/projects/${encoded}`, token)
  return project.default_branch || 'main'
}

async function fetchRepoFilePaths(projectPath: string, ref: string, token: string): Promise<string[]> {
  const encoded = encodeURIComponent(projectPath)
  const tree = await gitlabFetch<GitlabTreeEntry[]>(
    `/projects/${encoded}/repository/tree?recursive=1&per_page=100&ref=${encodeURIComponent(ref)}`,
    token
  )
  const paths: string[] = []
  for (const entry of tree || []) {
    if (entry.type !== 'blob') continue
    if (shouldIncludeFile(entry.path) && paths.length < MAX_FILES_PER_REPO) {
      paths.push(entry.path)
    }
  }
  return paths
}

async function fetchGitlabRepoFiles(
  source: IntegrationSource,
  token: string,
  projectPath: string
): Promise<IntegrationItem[]> {
  const items: IntegrationItem[] = []
  let ref: string
  try {
    ref = await getDefaultBranch(projectPath, token)
  } catch {
    return items
  }

  const paths = await fetchRepoFilePaths(projectPath, ref, token)
  const encodedProject = encodeURIComponent(projectPath)

  for (const filePath of paths) {
    try {
      const encodedPath = filePath.split('/').map(encodeURIComponent).join('/')
      const file = await gitlabFetch<GitlabFile>(
        `/projects/${encodedProject}/repository/files/${encodedPath}?ref=${encodeURIComponent(ref)}`,
        token
      )
      if (!file?.content) continue
      const content =
        file.encoding === 'base64'
          ? Buffer.from(file.content, 'base64').toString('utf-8')
          : file.content
      if (!content || content.length > MAX_FILE_SIZE) continue
      const webUrl = `https://gitlab.com/${projectPath}/-/blob/${ref}/${filePath}`
      items.push(mapFileToIntegrationItem(source.id, projectPath, filePath, content, ref, webUrl))
    } catch {
      // Skip files that fail (e.g. binary, too large)
    }
  }
  return items
}

export async function fetchGitlabItems(source: IntegrationSource, token: string): Promise<IntegrationItem[]> {
  const selectedRepos = getReposFromConfig(source)
  const repos = selectedRepos.length > 0 ? selectedRepos : await fetchGitlabRepos(token)
  const allItems: IntegrationItem[] = []

  for (const projectPath of repos) {
    const encoded = encodeURIComponent(projectPath)
    const [issues, mrs, fileItems] = await Promise.all([
      gitlabFetch<GitlabIssue[]>(`/projects/${encoded}/issues?per_page=100`, token),
      gitlabFetch<GitlabMergeRequest[]>(`/projects/${encoded}/merge_requests?per_page=100`, token),
      fetchGitlabRepoFiles(source, token, projectPath),
    ])

    for (const issue of issues) {
      allItems.push(mapIssueToIntegrationItem(source.id, projectPath, issue))
    }
    for (const mr of mrs) {
      allItems.push(mapMrToIntegrationItem(source.id, projectPath, mr))
    }
    allItems.push(...fileItems)
  }

  return allItems
}
