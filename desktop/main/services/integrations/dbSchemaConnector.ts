import fs from 'node:fs'
import path from 'node:path'
import { IntegrationItem, IntegrationSource } from '../integrationTypes.js'
import type { DbSchemaIntegrationConfig } from '../integrationTypes.js'

const DEFAULT_MIGRATION_PATHS = [
  '**/*.sql',
  '**/schema.prisma',
  '**/schema.rs', // diesel
  '**/migrations/**/*.sql',
  '**/db/schema.rb', // rails
]

/**
 * Convert a glob pattern to a regex for matching relative file paths.
 * Supports: * (single path segment), ** (zero or more path segments).
 */
function globToRegex(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/')
  let regex = ''
  let i = 0
  while (i < normalized.length) {
    if (normalized.slice(i, i + 2) === '**') {
      regex += '(?:[^/]+/)*'
      i += 2
      if (normalized[i] === '/') i++
    } else if (normalized[i] === '*') {
      regex += '[^/]*'
      i++
    } else if (/[.+?^${}()|[\]\\]/.test(normalized[i])) {
      regex += '\\' + normalized[i]
      i++
    } else {
      regex += normalized[i]
      i++
    }
  }
  return new RegExp('^' + regex + '$')
}

function matchesGlob(relativePath: string, pattern: string): boolean {
  const rel = relativePath.replace(/\\/g, '/')
  try {
    return globToRegex(pattern).test(rel)
  } catch {
    return false
  }
}

function collectMatchingFiles(basePath: string, patterns: string[]): { relPath: string; absPath: string }[] {
  const seen = new Set<string>()
  const results: { relPath: string; absPath: string }[] = []

  function walk(dir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const e of entries) {
      const absPath = path.join(dir, e.name)
      const relPath = path.relative(basePath, absPath).replace(/\\/g, '/')

      if (e.isDirectory()) {
        walk(absPath)
      } else if (e.isFile()) {
        if (seen.has(relPath)) continue
        for (const pattern of patterns) {
          if (matchesGlob(relPath, pattern)) {
            seen.add(relPath)
            results.push({ relPath, absPath })
            break
          }
        }
      }
    }
  }

  walk(basePath)
  return results
}

function requireBasePath(config: DbSchemaIntegrationConfig): string {
  const base = config.basePath
  if (typeof base !== 'string' || base.trim().length === 0) {
    throw new Error('DB Schema source config is missing basePath. Choose a project folder.')
  }
  const resolved = path.resolve(base.trim())
  if (!fs.existsSync(resolved)) {
    throw new Error(`DB Schema base path does not exist: ${resolved}`)
  }
  const stat = fs.statSync(resolved)
  if (!stat.isDirectory()) {
    throw new Error(`DB Schema base path is not a directory: ${resolved}`)
  }
  return resolved
}

export async function fetchDbSchemaItems(source: IntegrationSource): Promise<IntegrationItem[]> {
  const config = source.config as DbSchemaIntegrationConfig
  const basePath = requireBasePath(config)
  const patterns = (config.migrationPaths && config.migrationPaths.length > 0)
    ? config.migrationPaths
    : DEFAULT_MIGRATION_PATHS

  const files = collectMatchingFiles(basePath, patterns)
  const items: IntegrationItem[] = []

  for (const { relPath, absPath } of files) {
    let content: string
    try {
      content = fs.readFileSync(absPath, 'utf-8')
    } catch {
      continue
    }

    const stat = fs.statSync(absPath)
    const updatedAt = stat.mtime?.toISOString?.() ?? new Date().toISOString()
    const basename = path.basename(relPath)

    items.push({
      sourceId: source.id,
      sourceType: 'db-schema',
      id: `file:${relPath}`,
      externalId: relPath,
      title: `[DB Schema] ${basename}`,
      content,
      updatedAt,
      metadata: {
        itemType: 'db-schema:file',
        filePath: relPath,
        basename,
      },
    })
  }

  return items
}
