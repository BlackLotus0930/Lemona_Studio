// Desktop Version Service - Manages commit history for projects
import { Commit, DocumentSnapshot } from '../../../shared/types.js'
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { documentService } from './documentService.js'
import { projectService } from './projectService.js'

// Use Electron's userData directory for commits
const COMMITS_BASE_DIR = path.join(app.getPath('userData'), 'commits')

console.log('Desktop Version service initialized:')
console.log('  COMMITS_BASE_DIR:', COMMITS_BASE_DIR)

// Ensure commits base directory exists
async function ensureCommitsBaseDir() {
  try {
    await fs.mkdir(COMMITS_BASE_DIR, { recursive: true })
  } catch (error) {
    console.error('Error creating commits base directory:', error)
  }
}

// Initialize on import
ensureCommitsBaseDir()

/**
 * Get commits directory for a project
 */
function getCommitsDir(projectId: string): string {
  return path.join(COMMITS_BASE_DIR, projectId)
}

/**
 * Ensure commits directory exists for a project
 */
async function ensureCommitsDir(projectId: string) {
  try {
    const commitsDir = getCommitsDir(projectId)
    await fs.mkdir(commitsDir, { recursive: true })
  } catch (error) {
    console.error(`Error creating commits directory for project ${projectId}:`, error)
  }
}

/**
 * Get commit file path
 */
function getCommitPath(projectId: string, commitId: string): string {
  const commitsDir = getCommitsDir(projectId)
  // Use timestamp prefix for easier sorting: {timestamp}_{commitId}.json
  // We'll need to read the commit first to get timestamp, or store it in filename
  // For now, use simple format: {commitId}.json
  return path.join(commitsDir, `${commitId}.json`)
}

/**
 * Generate a unique commit ID
 */
function generateCommitId(): string {
  return `commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Get all commits for a project
 */
async function getAllCommits(projectId: string): Promise<Commit[]> {
  try {
    if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
      console.warn('[getAllCommits] Invalid projectId:', projectId)
      return []
    }
    
    await ensureCommitsDir(projectId)
    const commitsDir = getCommitsDir(projectId)
    
    // Check if directory exists
    try {
      await fs.access(commitsDir)
    } catch {
      // Directory doesn't exist yet, return empty array
      return []
    }
    
    const files = await fs.readdir(commitsDir)
    const commits: Commit[] = []
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(commitsDir, file)
          const content = await fs.readFile(filePath, 'utf-8')
          const commit = JSON.parse(content) as Commit
          
          // Validate commit has required fields
          if (!commit.id || !commit.projectId) {
            console.warn(`[getAllCommits] Skipping invalid commit: ${file}`)
            continue
          }
          
          commits.push(commit)
        } catch (fileError) {
          console.error(`[getAllCommits] Error reading commit file ${file}:`, fileError)
        }
      }
    }
    
    // Sort by timestamp DESC (most recent first)
    return commits.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  } catch (error) {
    console.error(`[getAllCommits] Error getting commits for project ${projectId}:`, error)
    return []
  }
}

/**
 * Find commits that have no children (leaf commits)
 * These are safe to delete when enforcing the 200 commit limit
 */
function findLeafCommits(commits: Commit[]): Commit[] {
  const commitIds = new Set(commits.map(c => c.id))
  const commitsWithChildren = new Set(
    commits
      .filter(c => c.parentId !== null)
      .map(c => c.parentId!)
  )
  
  // Leaf commits are those that are not referenced as parentId by any other commit
  return commits.filter(c => !commitsWithChildren.has(c.id))
}

export const versionService = {
  /**
   * Create a new commit
   * @param projectId - Project ID
   * @param documentSnapshots - Document snapshots to store
   * @param parentId - Optional parent commit ID. If not provided, uses current HEAD commit
   */
  async createCommit(
    projectId: string,
    documentSnapshots: DocumentSnapshot[],
    parentId?: string | null
  ): Promise<Commit> {
    if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
      throw new Error('Invalid projectId provided')
    }
    
    await ensureCommitsDir(projectId)
    
    // If parentId not provided, get HEAD commit
    let actualParentId: string | null = parentId ?? null
    if (actualParentId === undefined) {
      const headCommit = await this.getHeadCommit(projectId)
      actualParentId = headCommit?.id ?? null
    }
    
    const id = generateCommitId()
    const now = new Date().toISOString()
    
    const commit: Commit = {
      id,
      projectId,
      parentId: actualParentId,
      timestamp: now, // ISO string, used as display name
      documentSnapshots,
      createdAt: now,
    }
    
    const filePath = getCommitPath(projectId, id)
    await fs.writeFile(filePath, JSON.stringify(commit, null, 2))
    
    // Enforce 200 commit limit
    await this.enforceCommitLimit(projectId)
    
    return commit
  },

  /**
   * Get all commits for a project (sorted by timestamp DESC)
   */
  async getCommits(projectId: string): Promise<Commit[]> {
    if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
      console.warn('[getCommits] Invalid projectId:', projectId)
      return []
    }
    return getAllCommits(projectId)
  },

  /**
   * Get a specific commit by ID
   */
  async getCommit(projectId: string, commitId: string): Promise<Commit | null> {
    try {
      if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
        console.warn('[getCommit] Invalid projectId:', projectId)
        return null
      }
      if (!commitId || typeof commitId !== 'string' || commitId.trim() === '') {
        console.warn('[getCommit] Invalid commitId:', commitId)
        return null
      }
      
      const filePath = getCommitPath(projectId, commitId)
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content) as Commit
    } catch (error) {
      return null
    }
  },

  /**
   * Get the HEAD commit (latest commit with no children)
   */
  async getHeadCommit(projectId: string): Promise<Commit | null> {
    if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
      console.warn('[getHeadCommit] Invalid projectId:', projectId)
      return null
    }
    
    const commits = await getAllCommits(projectId)
    if (commits.length === 0) {
      return null
    }
    
    // Find commits that have no children
    const commitIds = new Set(commits.map(c => c.id))
    const commitsWithChildren = new Set(
      commits
        .filter(c => c.parentId !== null)
        .map(c => c.parentId!)
    )
    
    const headCommits = commits.filter(c => !commitsWithChildren.has(c.id))
    
    if (headCommits.length === 0) {
      // Fallback: return most recent commit by timestamp
      return commits[0]
    }
    
    // If multiple HEAD commits, return the one with latest timestamp
    return headCommits.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0]
  },

  /**
   * Restore a commit (restore document contents from commit snapshot)
   * Returns the restored commit so it can be used as parent for next commit
   */
  async restoreCommit(projectId: string, commitId: string): Promise<Commit> {
    console.log(`[restoreCommit] Starting restore - projectId: ${projectId}, commitId: ${commitId}`)
    
    if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
      console.error(`[restoreCommit] Invalid projectId: ${projectId}`)
      throw new Error('Invalid projectId provided')
    }
    if (!commitId || typeof commitId !== 'string' || commitId.trim() === '') {
      console.error(`[restoreCommit] Invalid commitId: ${commitId}`)
      throw new Error('Invalid commitId provided')
    }
    
    console.log(`[restoreCommit] Loading commit ${commitId}...`)
    const commit = await this.getCommit(projectId, commitId)
    if (!commit) {
      console.error(`[restoreCommit] Commit ${commitId} not found`)
      throw new Error(`Commit ${commitId} not found`)
    }
    
    console.log(`[restoreCommit] Commit loaded successfully`)
    console.log(`[restoreCommit] Commit ID: ${commit.id}`)
    console.log(`[restoreCommit] Commit timestamp: ${commit.timestamp}`)
    console.log(`[restoreCommit] Found ${commit.documentSnapshots.length} document snapshot(s)`)
    
    // Get project to check documentIds list
    const project = await projectService.getById(projectId)
    if (!project) {
      throw new Error(`Project ${projectId} not found`)
    }
    
    // Track which documents are currently in the project
    const projectDocumentIds = new Set(project.documentIds)
    
    // Get all project documents to determine folder for missing files
    const allProjectDocs = (await documentService.getAll()).filter(
      doc => doc.projectId === projectId
    )
    
    // Create a map of document IDs to their folder info
    const docFolderMap = new Map<string, 'library' | 'project'>()
    allProjectDocs.forEach(doc => {
      if (doc.folder) {
        docFolderMap.set(doc.id, doc.folder)
      }
    })
    
    // Restore each document snapshot
    let restoredCount = 0
    let createdCount = 0
    let failedCount = 0
    
    for (let i = 0; i < commit.documentSnapshots.length; i++) {
      const snapshot = commit.documentSnapshots[i]
      console.log(`[restoreCommit] [${i + 1}/${commit.documentSnapshots.length}] Processing document snapshot:`)
      console.log(`[restoreCommit]   - Document ID: ${snapshot.documentId}`)
      console.log(`[restoreCommit]   - Title: ${snapshot.title}`)
      console.log(`[restoreCommit]   - Content length: ${snapshot.content?.length || 0} chars`)
      
      try {
        // Check if document exists first
        let existingDoc = await documentService.getById(snapshot.documentId)
        
        if (!existingDoc) {
          // Document doesn't exist - create it
          console.log(`[restoreCommit] Document ${snapshot.documentId} does not exist, creating...`)
          
          // Determine folder: use existing folder info if available, otherwise default to 'project'
          const folder = docFolderMap.get(snapshot.documentId) || 'project'
          
          // Create document file directly
          const now = new Date().toISOString()
          const newDocument = {
            id: snapshot.documentId,
            title: snapshot.title,
            content: snapshot.content || JSON.stringify({ type: 'doc', content: [] }),
            createdAt: now,
            updatedAt: now,
            projectId: projectId,
            folder: folder,
            deleted: false
          }
          
          // Write document file directly (using same path logic as documentService)
          const DOCUMENTS_DIR = path.join(app.getPath('userData'), 'documents')
          const documentPath = path.join(DOCUMENTS_DIR, `${snapshot.documentId}.json`)
          await fs.mkdir(DOCUMENTS_DIR, { recursive: true })
          await fs.writeFile(documentPath, JSON.stringify(newDocument, null, 2))
          
          // Add document to project if it's not already in the list
          if (!projectDocumentIds.has(snapshot.documentId)) {
            await projectService.addDocument(projectId, snapshot.documentId)
            console.log(`[restoreCommit] ✓ Added new document ${snapshot.documentId} to project`)
          }
          
          createdCount++
          restoredCount++
          console.log(`[restoreCommit] ✓ Successfully created document ${snapshot.documentId} (${snapshot.title})`)
          continue
        }
        
        // Document exists - restore it (update content and ensure not deleted)
        const wasDeleted = existingDoc.deleted === true
        const wasRemovedFromProject = !projectDocumentIds.has(snapshot.documentId)
        const snapshotContent = snapshot.content || ''
        const currentContent = existingDoc.content || ''
        const contentChanged = currentContent !== snapshotContent
        const needsRestore = wasDeleted || wasRemovedFromProject || contentChanged
        
        // If document was logically deleted, removed from project, or content changed, restore it
        if (needsRestore) {
          // Update document: restore deleted status, projectId, and update content
          existingDoc.deleted = false
          existingDoc.content = snapshotContent
          existingDoc.updatedAt = new Date().toISOString()
          
          // Ensure document belongs to project
          if (!existingDoc.projectId || existingDoc.projectId !== projectId) {
            existingDoc.projectId = projectId
          }
          
          // Write document file directly
          const DOCUMENTS_DIR = path.join(app.getPath('userData'), 'documents')
          const documentPath = path.join(DOCUMENTS_DIR, `${snapshot.documentId}.json`)
          await fs.writeFile(documentPath, JSON.stringify(existingDoc, null, 2))
          
          // Add document back to project if it was removed
          if (wasRemovedFromProject) {
            await projectService.addDocument(projectId, snapshot.documentId)
            console.log(`[restoreCommit] ✓ Added document ${snapshot.documentId} back to project`)
          }
          
          restoredCount++
          if (wasDeleted) {
            console.log(`[restoreCommit] ✓ Successfully restored deleted document ${snapshot.documentId} (${snapshot.title})`)
          } else {
            console.log(`[restoreCommit] ✓ Successfully restored document ${snapshot.documentId} (${snapshot.title})`)
          }
        } else {
          // Content unchanged and not deleted - no update needed
          console.log(`[restoreCommit] ⚠ Document ${snapshot.documentId} (${snapshot.title}) content unchanged, skipping update`)
          restoredCount++ // Count as successful (no update needed)
        }
      } catch (error: any) {
        failedCount++
        console.error(`[restoreCommit] ✗ Failed to restore document ${snapshot.documentId}:`, error)
        console.error(`[restoreCommit]   Error message: ${error?.message || 'Unknown error'}`)
        console.error(`[restoreCommit]   Error stack:`, error?.stack)
        // Continue with other documents even if one fails
      }
    }
    
    console.log(`[restoreCommit] ====== Restore Summary ======`)
    console.log(`[restoreCommit] Total snapshots: ${commit.documentSnapshots.length}`)
    console.log(`[restoreCommit] Successfully restored: ${restoredCount}`)
    console.log(`[restoreCommit] Created: ${createdCount}`)
    console.log(`[restoreCommit] Failed: ${failedCount}`)
    console.log(`[restoreCommit] Note: Files not in commit snapshot are preserved`)
    console.log(`[restoreCommit] ============================`)
    
    return commit
  },

  /**
   * Enforce 200 commit limit by deleting oldest leaf commits
   * Only deletes commits that have no children to preserve commit tree structure
   */
  async enforceCommitLimit(projectId: string): Promise<void> {
    const commits = await getAllCommits(projectId)
    
    if (commits.length <= 200) {
      return // No need to delete anything
    }
    
    // Find leaf commits (commits with no children)
    const leafCommits = findLeafCommits(commits)
    
    if (leafCommits.length === 0) {
      console.warn(`[enforceCommitLimit] No leaf commits found, cannot enforce limit`)
      return
    }
    
    // Sort leaf commits by timestamp (oldest first)
    const sortedLeafCommits = leafCommits.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
    
    // Calculate how many to delete
    const commitsToDelete = commits.length - 200
    
    // Delete oldest leaf commits
    let deletedCount = 0
    for (const commit of sortedLeafCommits) {
      if (deletedCount >= commitsToDelete) {
        break
      }
      
      try {
        const filePath = getCommitPath(projectId, commit.id)
        await fs.unlink(filePath)
        deletedCount++
      } catch (error) {
        console.error(`[enforceCommitLimit] Failed to delete commit ${commit.id}:`, error)
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[enforceCommitLimit] Deleted ${deletedCount} oldest leaf commits for project ${projectId}`)
    }
  },
}

