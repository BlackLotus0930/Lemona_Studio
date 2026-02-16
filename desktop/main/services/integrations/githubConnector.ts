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

interface GithubRepo {
  full_name: string
  name: string
  html_url: string
  default_branch?: string
}

interface GithubTreeEntry {
  path: string
  type: 'blob' | 'tree'
  size?: number
  sha: string
}

interface GithubTree {
  sha: string
  tree: GithubTreeEntry[]
  truncated?: boolean
}

interface GithubContentFile {
  type: 'file'
  path: string
  content?: string
  encoding?: string
  size?: number
  html_url?: string
}

interface GithubIssue {
  id: number
  number: number
  title: string
  body: string | null
  html_url: string
  state: string
  created_at: string
  updated_at: string
  user?: {
    login?: string
  }
  pull_request?: {
    html_url?: string
  }
}

interface GithubPullRequest {
  id: number
  number: number
  title: string
  body: string | null
  html_url: string
  state: string
  created_at: string
  updated_at: string
  user?: {
    login?: string
  }
}

const GITHUB_API = 'https://api.github.com'

function getReposFromConfig(source: IntegrationSource): string[] {
  const config = source.config as { repos?: unknown }
  if (!Array.isArray(config?.repos)) {
    return []
  }
  return config.repos
    .filter((repo): repo is string => typeof repo === 'string' && repo.trim().length > 0)
    .map(repo => repo.trim())
}

async function githubFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Lemona-Desktop',
    },
  })
  if (!response.ok) {
    const text = await response.text()
    const error = new Error(`GitHub API request failed (${response.status})`)
    ;(error as any).status = response.status
    ;(error as any).body = text
    throw error
  }
  return (await response.json()) as T
}

function mapIssueToIntegrationItem(sourceId: string, repoFullName: string, issue: GithubIssue): IntegrationItem {
  const itemType = issue.pull_request ? 'pull_request_issue' : 'issue'
  return {
    sourceId,
    sourceType: 'github',
    id: `${repoFullName}:issue:${issue.number}`,
    externalId: `${repoFullName}:issue:${issue.number}`,
    title: `[${repoFullName}] #${issue.number} ${issue.title}`,
    content: issue.body || '',
    metadata: {
      url: issue.html_url,
      author: issue.user?.login || '',
      state: issue.state,
      createdAt: issue.created_at,
      itemType,
      repo: repoFullName,
    },
    updatedAt: issue.updated_at || issue.created_at,
  }
}

function mapPrToIntegrationItem(sourceId: string, repoFullName: string, pr: GithubPullRequest): IntegrationItem {
  return {
    sourceId,
    sourceType: 'github',
    id: `${repoFullName}:pr:${pr.number}`,
    externalId: `${repoFullName}:pr:${pr.number}`,
    title: `[${repoFullName}] PR #${pr.number} ${pr.title}`,
    content: pr.body || '',
    metadata: {
      url: pr.html_url,
      author: pr.user?.login || '',
      state: pr.state,
      createdAt: pr.created_at,
      itemType: 'pull_request',
      repo: repoFullName,
    },
    updatedAt: pr.updated_at || pr.created_at,
  }
}

export async function fetchGithubRepos(token: string): Promise<string[]> {
  const repos = await githubFetch<GithubRepo[]>('/user/repos?per_page=100&sort=updated', token)
  return repos.map(repo => repo.full_name).filter(Boolean)
}

function shouldIncludeFile(path: string, size?: number): boolean {
  if (size !== undefined && size > MAX_FILE_SIZE) return false
  const parts = path.split('/')
  for (const part of parts) {
    if (EXCLUDE_DIRS.has(part.toLowerCase())) return false
  }
  const ext = path.includes('.') ? '.' + path.split('.').pop()!.toLowerCase() : ''
  if (INCLUDE_EXT.has(ext)) return true
  const baseName = path.split('/').pop()?.toLowerCase() ?? ''
  return INCLUDE_EXTENSIONLESS.has(baseName)
}

async function getDefaultBranch(repoFullName: string, token: string): Promise<string> {
  const repo = await githubFetch<GithubRepo>(`/repos/${repoFullName}`, token)
  return repo.default_branch || 'main'
}

async function fetchRepoFilePaths(
  repoFullName: string,
  branch: string,
  token: string
): Promise<string[]> {
  const tree = await githubFetch<GithubTree>(
    `/repos/${repoFullName}/git/trees/${branch}?recursive=1`,
    token
  )
  const paths: string[] = []
  for (const entry of tree.tree || []) {
    if (entry.type !== 'blob') continue
    if (shouldIncludeFile(entry.path, entry.size) && paths.length < MAX_FILES_PER_REPO) {
      paths.push(entry.path)
    }
  }
  return paths
}

function mapFileToIntegrationItem(
  sourceId: string,
  repoFullName: string,
  path: string,
  content: string,
  branch: string,
  htmlUrl?: string
): IntegrationItem {
  return {
    sourceId,
    sourceType: 'github',
    id: `${repoFullName}:file:${path}`,
    externalId: `${repoFullName}:file:${path}`,
    title: `[${repoFullName}] ${path}`,
    content,
    metadata: {
      url: htmlUrl || `https://github.com/${repoFullName}/blob/${branch}/${path}`,
      itemType: 'file',
      repo: repoFullName,
      path,
    },
    updatedAt: new Date().toISOString(),
  }
}

async function fetchGithubRepoFiles(
  source: IntegrationSource,
  token: string,
  repoFullName: string
): Promise<IntegrationItem[]> {
  const items: IntegrationItem[] = []
  let branch: string
  try {
    branch = await getDefaultBranch(repoFullName, token)
  } catch {
    return items
  }

  const paths = await fetchRepoFilePaths(repoFullName, branch, token)
  const ref = encodeURIComponent(branch)

  for (const filePath of paths) {
    try {
      const encodedPath = filePath.split('/').map(encodeURIComponent).join('/')
      const file = await githubFetch<GithubContentFile>(
        `/repos/${repoFullName}/contents/${encodedPath}?ref=${ref}`,
        token
      )
      if (file.type !== 'file' || !file.content) continue
      const content =
        file.encoding === 'base64'
          ? Buffer.from(file.content, 'base64').toString('utf-8')
          : file.content
      if (!content || content.length > MAX_FILE_SIZE) continue
      items.push(
        mapFileToIntegrationItem(source.id, repoFullName, filePath, content, branch, file.html_url)
      )
    } catch {
      // Skip files that fail to fetch (e.g. binary, too large)
    }
  }
  return items
}

export async function fetchGithubItems(source: IntegrationSource, token: string): Promise<IntegrationItem[]> {
  const selectedRepos = getReposFromConfig(source)
  const repos = selectedRepos.length > 0 ? selectedRepos : await fetchGithubRepos(token)
  const allItems: IntegrationItem[] = []

  for (const repoFullName of repos) {
    const [issues, pulls, fileItems] = await Promise.all([
      githubFetch<GithubIssue[]>(`/repos/${repoFullName}/issues?state=all&per_page=100`, token),
      githubFetch<GithubPullRequest[]>(`/repos/${repoFullName}/pulls?state=all&per_page=100`, token),
      fetchGithubRepoFiles(source, token, repoFullName),
    ])

    for (const issue of issues) {
      allItems.push(mapIssueToIntegrationItem(source.id, repoFullName, issue))
    }
    for (const pr of pulls) {
      allItems.push(mapPrToIntegrationItem(source.id, repoFullName, pr))
    }
    allItems.push(...fileItems)
  }

  return allItems
}
