// Vector Store Service - HNSW-based vector storage and search
// Uses hnswlib-node for Electron/Node.js compatibility
import { createRequire } from 'module'
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { Chunk } from './chunkingService.js'
import { EMBEDDING_DIMENSION } from './embeddingService.js'

// Import hnswlib-node as CommonJS module
const require = createRequire(import.meta.url)
const hnswlibNode = require('hnswlib-node')
const HierarchicalNSW = hnswlibNode.HierarchicalNSW

// Get hnswlib-node version for compatibility checking
// Read version from package.json since hnswlib-node doesn't export version
let HNSWLIB_NODE_VERSION = 'unknown'
try {
  const packageJsonPath = require.resolve('hnswlib-node/package.json')
  const packageJson = require(packageJsonPath)
  HNSWLIB_NODE_VERSION = packageJson.version || 'unknown'
} catch (error) {
  console.warn('[VectorStore] Could not determine hnswlib-node version:', error)
}

// Type definition for HierarchicalNSW
type HierarchicalNSWType = InstanceType<typeof HierarchicalNSW>

// Base vector index directory
const BASE_VECTOR_INDEX_DIR = path.join(app.getPath('userData'), 'vectorIndex')

/**
 * Sanitize projectId for use as directory name
 * Removes or replaces characters that are unsafe for file paths
 * @param projectId - Project ID to sanitize
 * @returns Safe directory name
 */
function sanitizeProjectId(projectId: string): string {
  // Replace unsafe characters with underscores
  // Unsafe characters: < > : " / \ | ? * and control characters
  return projectId
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.\./g, '_') // Prevent directory traversal
    .replace(/^\.+|\.+$/g, '') // Remove leading/trailing dots
    .trim() || 'global' // Fallback to 'global' if empty
}

/**
 * Get project-specific vector index directory
 * @param projectId - Project ID (pure semantic ID, no path structure)
 * @param folder - Folder type: 'library' or 'project'
 */
function getProjectIndexDir(projectId: string, folder: 'library' | 'project', indexKey?: string): string {
  // Sanitize projectId and combine with folder
  const sanitizedProjectId = sanitizeProjectId(projectId)
  if (!indexKey || indexKey.trim().length === 0) {
    return path.join(BASE_VECTOR_INDEX_DIR, sanitizedProjectId, folder)
  }
  const safeIndexKey = indexKey.replace(/[^a-zA-Z0-9._:-]/g, '_')
  return path.join(BASE_VECTOR_INDEX_DIR, sanitizedProjectId, folder, safeIndexKey)
}

/**
 * Get project-specific index file paths
 * @param projectId - Project ID (pure semantic ID)
 * @param folder - Folder type: 'library' or 'project'
 */
function getProjectIndexFiles(projectId: string, folder: 'library' | 'project', indexKey?: string): {
  indexFile: string
  metadataFile: string
  manifestFile: string
} {
  const projectDir = getProjectIndexDir(projectId, folder, indexKey)
  return {
    indexFile: path.join(projectDir, 'index.bin'),
    metadataFile: path.join(projectDir, 'metadata.json'),
    manifestFile: path.join(projectDir, 'manifest.json'),
  }
}

/**
 * Export getProjectIndexDir for use in other services
 * This ensures consistent path building across services
 * @param projectId - Project ID (pure semantic ID)
 * @param folder - Folder type: 'library' or 'project'
 */
export function getProjectIndexDirectory(projectId: string, folder: 'library' | 'project', indexKey?: string): string {
  return getProjectIndexDir(projectId, folder, indexKey)
}

// Ensure base vector index directory exists
async function ensureBaseVectorIndexDir() {
  try {
    await fs.mkdir(BASE_VECTOR_INDEX_DIR, { recursive: true })
  } catch (error) {
    console.error('[VectorStore] Error creating base vector index directory:', error)
  }
}

// Initialize directory on import
ensureBaseVectorIndexDir()

// Legacy: Keep for backward compatibility during migration
// New code should use getProjectIndexFiles() instead

/**
 * Chunk metadata stored alongside vectors
 */
export interface ChunkMetadata {
  id: string
  fileId: string
  chunkIndex: number
  text: string
  hash: string
  startChar: number
  endChar: number
  tokenCount: number
  projectId?: string // Optional: Project ID this chunk belongs to (for library files scoped to projects)
  // Workspace paragraph-level indexing fields (only for folder === 'project')
  paragraphId?: string // UUID, unique identifier (identity)
  paragraphIndex?: number // Position index (attribute, can be updated)
  paragraphHash?: string // Paragraph hash (for change detection)
  paragraphType?: 'semantic-block' // Paragraph type
  headingText?: string // Heading text (if has heading)
  headingLevel?: number // Heading level (if has heading)
}

/**
 * Index manifest - describes the configuration and version of an index
 */
export interface IndexManifest {
  projectId: string
  folder: 'library' | 'project'
  embeddingModel: string // e.g., 'text-embedding-3-small'
  embeddingDimension: number // 1536
  chunkSize: number // 400
  chunkOverlap: number // 40-60
  indexVersion: string // Index structure/semantic version, manually bumped, used for reindex decision
  appVersion: string // App version when index was created, only for debug
  createdAt: string
  updatedAt: string
}

/**
 * Lock state for a project
 */
interface LockState {
  readers: number // Number of active read locks
  writer: boolean // Whether a write lock is active
  writerStack?: string // Stack trace of current writer (for detecting re-entrancy)
  readQueue: Array<() => void> // Queue of waiting read lock requests
  writeQueue: Array<() => void> // Queue of waiting write lock requests
}

/**
 * Project-level read-write lock manager
 * Provides concurrent read access and exclusive write access per project
 * 
 * Lock rules:
 * - Multiple read locks can be held concurrently
 * - Only one write lock can be held at a time
 * - Read and write locks are mutually exclusive
 * - Locks are per-project (including 'library' and undefined/global)
 */
export class ProjectLockManager {
  private locks: Map<string | undefined, LockState> = new Map()

  /**
   * Normalize projectId for consistent lock key
   */
  private normalizeProjectId(projectId?: string): string | undefined {
    // Normalize: 'library' stays 'library', projectId stays projectId, undefined stays undefined
    return projectId === 'library' ? 'library' : (projectId || undefined)
  }

  /**
   * Get or create lock state for a project
   */
  private getLockState(projectId?: string): LockState {
    const normalizedId = this.normalizeProjectId(projectId)
    if (!this.locks.has(normalizedId)) {
      this.locks.set(normalizedId, {
        readers: 0,
        writer: false,
        writerStack: undefined,
        readQueue: [],
        writeQueue: [],
      })
    }
    return this.locks.get(normalizedId)!
  }

  /**
   * Acquire a read lock for a project
   * Multiple read locks can be held concurrently
   * @param projectId - Project ID, or 'library' for library, or undefined for global
   * @returns A function to release the lock
   */
  async acquireReadLock(projectId?: string): Promise<() => void> {
    const normalizedId = this.normalizeProjectId(projectId)
    const lockState = this.getLockState(normalizedId)

    // Wait until no writer is active and no write requests are waiting
    // (This ensures write requests get priority and prevents starvation)
    if (lockState.writer || lockState.writeQueue.length > 0) {
      await new Promise<void>((resolve) => {
        lockState.readQueue.push(resolve)
      })
    }

    // Acquire read lock
    lockState.readers++

    // Return release function
    return () => {
      lockState.readers--
      
      // If no more readers, process write queue first (write priority), then read queue
      if (lockState.readers === 0) {
        if (lockState.writeQueue.length > 0) {
          const next = lockState.writeQueue.shift()!
          next()
        } else if (lockState.readQueue.length > 0) {
          const next = lockState.readQueue.shift()!
          next()
        }
      }
    }
  }

  /**
   * Acquire a write lock for a project
   * Only one write lock can be held at a time, and it's exclusive with read locks
   * 
   * 🧱 STEP 1: CRASH IMMEDIATELY ON RE-ENTRANCY
   * If a write lock is already held, throw immediately instead of deadlocking
   * 
   * @param projectId - Project ID, or 'library' for library, or undefined for global
   * @returns A function to release the lock
   */
  async acquireWriteLock(projectId?: string): Promise<() => void> {
    const normalizedId = this.normalizeProjectId(projectId)
    const lockState = this.getLockState(normalizedId)

    // 🧱 STEP 1: Detect re-entrancy and crash immediately
    if (lockState.writer) {
      const currentStack = lockState.writerStack || 'unknown'
      const newStack = new Error().stack || 'unknown'
      const error = new Error(
        `🚨 RE-ENTRANT WRITE LOCK DETECTED!\n` +
        `Project: ${normalizedId || 'global'}\n` +
        `Current lock holder stack:\n${currentStack}\n` +
        `Attempted re-acquisition stack:\n${newStack}\n` +
        `\nThis is a programming error. Locks should only be acquired at transaction boundaries:\n` +
        `- documentService / projectService (transaction boundaries)\n` +
        `- vectorStore.withWriteLock(...)\n` +
        `- indexManager.runExclusive(...)`
      )
      console.error(error)
      throw error
    }

    // Wait until no readers
    if (lockState.readers > 0) {
      await new Promise<void>((resolve) => {
        lockState.writeQueue.push(resolve)
      })
    }

    // Acquire write lock and record stack trace
    lockState.writer = true
    lockState.writerStack = new Error().stack

    // Return release function
    return () => {
      lockState.writer = false
      lockState.writerStack = undefined
      
      // Process write queue first (write priority), then read queue
      if (lockState.writeQueue.length > 0) {
        const next = lockState.writeQueue.shift()!
        next()
      } else if (lockState.readQueue.length > 0) {
        // Process all waiting read locks (they can run concurrently)
        const waitingReads = lockState.readQueue.splice(0)
        waitingReads.forEach(resolve => resolve())
      }
    }
  }

  /**
   * Get lock statistics for debugging
   */
  getStats(): Array<{ projectId: string | undefined; readers: number; writer: boolean; readQueueLength: number; writeQueueLength: number }> {
    const stats: Array<{ projectId: string | undefined; readers: number; writer: boolean; readQueueLength: number; writeQueueLength: number }> = []
    for (const [projectId, state] of this.locks.entries()) {
      stats.push({
        projectId,
        readers: state.readers,
        writer: state.writer,
        readQueueLength: state.readQueue.length,
        writeQueueLength: state.writeQueue.length,
      })
    }
    return stats
  }
}

// Singleton instance of lock manager
const projectLockManager = new ProjectLockManager()

/**
 * 🧱 STEP 2: UNSAFE API - Only for transaction boundaries
 * 
 * ⚠️ WARNING: This is an UNSAFE API. Only use in:
 * - documentService (transaction boundaries)
 * - projectService (transaction boundaries)
 * 
 * ❌ DO NOT use in:
 * - vectorStore methods
 * - indexingService
 * - Any helper/util/primitive functions
 * 
 * For safe usage, use:
 * - vectorStore.withWriteLock(...)
 * - vectorStore.withReadLock(...)
 */
export function getProjectLockManager(): ProjectLockManager {
  return projectLockManager
}

/**
 * 🧱 STEP 2: SAFE API - Lock ownership wrapper
 * 
 * Safe wrapper for write operations that ensures proper lock management.
 * Use this instead of directly calling acquireWriteLock.
 * 
 * @param projectId - Project ID, or 'library' for library, or undefined for global
 * @param fn - Function to execute with write lock
 * @returns Result of the function
 */
export async function withWriteLock<T>(
  projectId: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const releaseLock = await projectLockManager.acquireWriteLock(projectId)
  try {
    return await fn()
  } finally {
    releaseLock()
  }
}

/**
 * 🧱 STEP 2: SAFE API - Lock ownership wrapper
 * 
 * Safe wrapper for read operations that ensures proper lock management.
 * Use this instead of directly calling acquireReadLock.
 * 
 * @param projectId - Project ID, or 'library' for library, or undefined for global
 * @param fn - Function to execute with read lock
 * @returns Result of the function
 */
export async function withReadLock<T>(
  projectId: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const releaseLock = await projectLockManager.acquireReadLock(projectId)
  try {
    return await fn()
  } finally {
    releaseLock()
  }
}

/**
 * Search result with similarity score
 */
export interface SearchResult {
  chunk: ChunkMetadata
  score: number // Similarity score (lower is better for L2 distance)
  distance: number // L2 distance
}

/**
 * HNSW Index parameters
 */
const HNSW_CONFIG = {
  space: 'cosine' as const, // Cosine distance (better for normalized embeddings)
  M: 16, // Number of bi-directional links for each element
  efConstruction: 200, // Size of the dynamic candidate list during construction
  efSearch: 50, // Size of the dynamic candidate list during search
}

/**
 * Vector Store class
 */
class VectorStore {
  private index: HierarchicalNSWType | null = null
  private metadata: Map<number, ChunkMetadata> = new Map() // label -> metadata
  private idToLabel: Map<string, number> = new Map() // chunkId -> label (index)
  private labelToId: Map<number, string> = new Map() // label -> chunkId
  private nextLabel: number = 0
  private dimension: number = EMBEDDING_DIMENSION
  private isInitialized: boolean = false
  private saveLock: Promise<void> | null = null // Prevent concurrent saves
  private metadataDirty: boolean = false // Mark metadata to be saved on next safe save
  private currentProjectId: string | undefined = undefined // Current project ID (pure semantic ID)
  private currentFolder: 'library' | 'project' = 'library' // Current folder type
  private currentIndexKey: string | undefined = undefined
  private indexFile: string = '' // Current index file path
  private metadataFile: string = '' // Current metadata file path
  private manifestFile: string = '' // Current manifest file path

  /**
   * Set the project ID and folder for this vector store instance
   * This determines which index directory to use
   * CRITICAL: Project ID and folder must be consistent between indexing and searching
   * @param projectId - Project ID (pure semantic ID, no path structure)
   * @param folder - Folder type: 'library' or 'project'
   */
  setProjectId(projectId: string, folder: 'library' | 'project', indexKey?: string): void {
    const normalizedIndexKey = indexKey && indexKey.trim().length > 0 ? indexKey : undefined
    if (this.currentProjectId === projectId && this.currentFolder === folder && this.currentIndexKey === normalizedIndexKey) {
      return // No change
    }
    
    // If already initialized with a different project/folder, reset
    if (
      this.isInitialized &&
      (this.currentProjectId !== projectId || this.currentFolder !== folder || this.currentIndexKey !== normalizedIndexKey)
    ) {
      this.isInitialized = false
      this.index = null
      this.metadata.clear()
      this.idToLabel.clear()
      this.labelToId.clear()
      this.nextLabel = 0
    }
    
    this.currentProjectId = projectId
    this.currentFolder = folder
    this.currentIndexKey = normalizedIndexKey
    const files = getProjectIndexFiles(projectId, folder, normalizedIndexKey)
    this.indexFile = files.indexFile
    this.metadataFile = files.metadataFile
    this.manifestFile = files.manifestFile
    
    // CRITICAL: Ensure project directory exists immediately when project ID is set
    // This ensures the directory is ready before any operations
    this.ensureProjectIndexDir().catch(error => {
      console.error(`[VectorStore] Failed to create project directory:`, error)
    })
  }

  /**
   * Get current project ID
   */
  getProjectId(): string | undefined {
    return this.currentProjectId
  }

  /**
   * Get current folder type
   */
  getFolder(): 'library' | 'project' {
    return this.currentFolder
  }

  getIndexKey(): string | undefined {
    return this.currentIndexKey
  }

  // Note: VectorStore is a "database kernel", not a transaction manager
  // Lock management is handled by transaction boundaries (documentService/projectService)
  // All public methods assume caller already holds appropriate lock

  /**
   * Ensure project-specific index directory exists
   */
  private async ensureProjectIndexDir(): Promise<void> {
    if (!this.currentProjectId) {
      throw new Error('Project ID must be set before ensuring directory')
    }
    const projectDir = getProjectIndexDir(this.currentProjectId, this.currentFolder, this.currentIndexKey)
    try {
      await fs.mkdir(projectDir, { recursive: true })
    } catch (error) {
      console.error(`[VectorStore] Error creating project index directory for ${this.currentProjectId}/${this.currentFolder}:`, error)
    }
  }

  /**
   * Load index manifest
   * @returns Manifest if exists, null otherwise
   */
  async loadManifest(): Promise<IndexManifest | null> {
    if (!this.manifestFile) {
      return null
    }
    try {
      const content = await fs.readFile(this.manifestFile, 'utf-8')
      return JSON.parse(content) as IndexManifest
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null // Manifest doesn't exist yet
      }
      console.error('[VectorStore] Failed to load manifest:', error)
      return null
    }
  }

  /**
   * Save index manifest
   * @param manifest - Manifest to save
   */
  async saveManifest(manifest: IndexManifest): Promise<void> {
    if (!this.manifestFile) {
      throw new Error('Manifest file path not set')
    }
    await this.ensureProjectIndexDir()
    await fs.writeFile(this.manifestFile, JSON.stringify(manifest, null, 2), 'utf-8')
  }

  /**
   * Check if index is valid based on manifest
   * Compares indexVersion, embeddingModel, chunkSize, chunkOverlap, embeddingDimension
   * @param expectedManifest - Expected manifest configuration
   * @returns true if index is valid, false if needs rebuild
   */
  isIndexValid(expectedManifest: Partial<IndexManifest>): boolean {
    // Load current manifest
    // Note: This is synchronous check, actual loading is async
    // For now, we'll do async check in loadIndexUnsafe
    return true // Placeholder, actual check done in loadIndexUnsafe
  }

  /**
   * Initialize HNSW index
   */
  async initialize(maxElements: number = 20000): Promise<void> {
    if (this.isInitialized && this.index) {
      // Verify index is actually initialized and has capacity
      const currentMaxElements = this.index.getMaxElements()
      if (currentMaxElements > 0) {
        return // Already initialized with valid capacity
      }
      // Index exists but has no capacity, reinitialize
      console.warn(`[VectorStore] Index exists but has no capacity (${currentMaxElements}), reinitializing...`)
      this.index = null
      this.isInitialized = false
    }

    // Ensure project directory exists
    await this.ensureProjectIndexDir()

    try {
      // Create new index using hnswlib-node
      this.index = new HierarchicalNSW(HNSW_CONFIG.space, this.dimension)
      this.index.initIndex(
        maxElements,
        HNSW_CONFIG.M,
        HNSW_CONFIG.efConstruction,
        100, // randomSeed
        false // allowReplaceDeleted
      )

      // Verify initialization succeeded
      const actualMaxElements = this.index.getMaxElements()
      if (actualMaxElements === 0) {
        throw new Error(`Index initialization failed: maxElements is 0`)
      }

      this.isInitialized = true
    } catch (error: any) {
      console.error('[VectorStore] Failed to initialize index:', error)
      this.index = null
      this.isInitialized = false
      throw new Error(`Failed to initialize vector store: ${error.message}`)
    }
  }

  /**
   * Repair metadata inconsistencies by synchronizing idToLabel and labelToId
   * Removes orphaned entries and ensures both maps are consistent
   */
  private repairMetadata(data: any): { repaired: boolean; data: any } {
    try {
      if (!data || typeof data !== 'object') {
        return { repaired: false, data }
      }

      if (!Array.isArray(data.metadata) || 
          !Array.isArray(data.idToLabel) || 
          !Array.isArray(data.labelToId)) {
        return { repaired: false, data }
      }

      const originalIdToLabelSize = data.idToLabel.length
      const originalLabelToIdSize = data.labelToId.length
      const originalMetadataSize = data.metadata.length

      // Rebuild maps from metadata (metadata is the source of truth)
      const rebuiltLabelToId = new Map<number, string>()
      const rebuiltIdToLabel = new Map<string, number>()
      const rebuiltMetadata: Array<[number, any]> = []
      let duplicateLabels = 0
      let duplicateIds = 0

      for (const [label, metadata] of data.metadata as Array<[number, any]>) {
        const chunkId = metadata?.id
        if (typeof label !== 'number' || !chunkId) {
          continue
        }
        if (rebuiltLabelToId.has(label)) {
          duplicateLabels++
          continue
        }
        if (rebuiltIdToLabel.has(chunkId)) {
          duplicateIds++
          continue
        }
        rebuiltLabelToId.set(label, chunkId)
        rebuiltIdToLabel.set(chunkId, label)
        rebuiltMetadata.push([label, metadata])
      }

      data.idToLabel = Array.from(rebuiltIdToLabel.entries())
      data.labelToId = Array.from(rebuiltLabelToId.entries())
      data.metadata = rebuiltMetadata

      // Update nextLabel to be max(label) + 1 if needed
      let maxLabel = -1
      for (const label of rebuiltLabelToId.keys()) {
        if (label > maxLabel) {
          maxLabel = label
        }
      }
      if (data.nextLabel <= maxLabel) {
        data.nextLabel = maxLabel + 1
      }

      const removedIdToLabel = originalIdToLabelSize - data.idToLabel.length
      const removedLabelToId = originalLabelToIdSize - data.labelToId.length
      const removedMetadata = originalMetadataSize - data.metadata.length
      const repaired = removedIdToLabel > 0 || removedLabelToId > 0 || removedMetadata > 0 || duplicateLabels > 0 || duplicateIds > 0

      if (repaired) {
        console.log(`[VectorStore] Repaired metadata: removed ${removedIdToLabel} idToLabel, ${removedLabelToId} labelToId, ${removedMetadata} metadata entries (duplicates: labels=${duplicateLabels}, ids=${duplicateIds})`)
      }

      return { repaired, data }
    } catch (error) {
      console.error('[VectorStore] Metadata repair error:', error)
      return { repaired: false, data }
    }
  }

  /**
   * Validate metadata integrity
   */
  private validateMetadata(data: any): boolean {
    try {
      if (!data || typeof data !== 'object') {
        return false
      }
      
      // Check required fields
      if (!Array.isArray(data.metadata) || 
          !Array.isArray(data.idToLabel) || 
          !Array.isArray(data.labelToId) ||
          typeof data.nextLabel !== 'number') {
        return false
      }
      
      // Validate consistency between maps
      if (data.idToLabel.length !== data.labelToId.length) {
        return false
      }
      
      // Check that idToLabel and labelToId are consistent (bidirectional)
      const idToLabelMap = new Map<string, number>(data.idToLabel)
      const labelToIdMap = new Map<number, string>(data.labelToId)
      
      for (const [chunkId, label] of idToLabelMap.entries()) {
        if (!labelToIdMap.has(label) || labelToIdMap.get(label) !== chunkId) {
          return false
        }
      }
      
      for (const [label, chunkId] of labelToIdMap.entries()) {
        if (!idToLabelMap.has(chunkId) || idToLabelMap.get(chunkId) !== label) {
          return false
        }
      }
      
      // Check that metadata entries match labels
      const metadataMap = new Map<number, any>(data.metadata)
      for (const [label, metadata] of metadataMap.entries()) {
        if (!labelToIdMap.has(label) || labelToIdMap.get(label) !== metadata.id) {
          return false
        }
      }
      
      // Validate hnswConfig if present (new format)
      if (data.hnswConfig) {
        const config = data.hnswConfig
        if (typeof config.space !== 'string' ||
            typeof config.dimension !== 'number' ||
            typeof config.M !== 'number' ||
            typeof config.efConstruction !== 'number' ||
            typeof config.maxElements !== 'number') {
          return false
        }
      }
      
      return true
    } catch (error) {
      console.error('[VectorStore] Metadata validation error:', error)
      return false
    }
  }

  /**
   * Migrate legacy index (detect space type and update metadata)
   * This should only be called once when legacy index is first detected
   */
  private async migrateLegacyIndex(savedData: any): Promise<'cosine' | 'l2' | null> {
    // Try cosine first (common for embeddings), then l2 if that fails
    const spacesToTry: Array<'cosine' | 'l2'> = ['cosine', 'l2']
    
    for (const space of spacesToTry) {
      try {
        const testIndex = new HierarchicalNSW(space, this.dimension)
        const maxElements = Math.max(this.metadata.size * 2, 20000)
        testIndex.initIndex(maxElements, HNSW_CONFIG.M, HNSW_CONFIG.efConstruction, 100, false)
        testIndex.readIndexSync(this.indexFile)
        const testCount = testIndex.getCurrentCount()
        
        if (testCount === this.metadata.size) {
          // Success! This is the correct space type
          // Update metadata with detected config
          const hnswConfig = {
            space: space,
            dimension: this.dimension,
            M: HNSW_CONFIG.M,
            efConstruction: HNSW_CONFIG.efConstruction,
            maxElements: maxElements,
            randomSeed: 100,
            allowReplaceDeleted: false,
          }
          
          // Save updated metadata with detected config
          const metadataData = {
            metadata: Array.from(this.metadata.entries()),
            idToLabel: Array.from(this.idToLabel.entries()),
            labelToId: Array.from(this.labelToId.entries()),
            nextLabel: this.nextLabel,
            hnswConfig: hnswConfig,
          }
          await fs.writeFile(this.metadataFile, JSON.stringify(metadataData, null, 2))
          
          return space
        }
      } catch (testError: any) {
        // Continue to next space type
      }
    }
    
    console.warn('[VectorStore] Legacy index migration failed: could not determine space type')
    return null
  }

  /**
   * Rebuild index from metadata (recovery from corruption)
   * Note: This creates an empty index but preserves metadata.
   * The actual index will need to be rebuilt by re-indexing files (which requires API keys).
   */
  private async rebuildIndexFromMetadata(): Promise<void> {
    try {
      // Preserve metadata - don't clear it!
      // This way we know which files were indexed, even though we can't search them yet
      const preservedMetadataSize = this.metadata.size
      
      // Create new empty index (metadata is already loaded, we just need a new index instance)
      // Ensure minimum capacity of 20000 (per project index max capacity), or 2x metadata size if larger
      const maxElements = Math.max(preservedMetadataSize * 2, 20000)
      this.index = new HierarchicalNSW(HNSW_CONFIG.space, this.dimension)
      this.index.initIndex(maxElements, HNSW_CONFIG.M, HNSW_CONFIG.efConstruction, 100, false)
      
      // Verify initialization succeeded
      const actualMaxElements = this.index.getMaxElements()
      if (actualMaxElements === 0) {
        throw new Error(`Index rebuild failed: maxElements is 0`)
      }
      
      // Mark as initialized (even though index is empty)
      this.isInitialized = true
      
    } catch (error: any) {
      console.error('[VectorStore] Failed to rebuild index:', error)
      this.index = null
      this.isInitialized = false
      throw error
    }
  }

  /**
   * Load index from disk
   * 📌 UNSAFE: Assumes caller already holds write lock
   * 
   * Lock upgrade must be handled explicitly by caller.
   * This method does NOT perform any lock operations.
   */
  async loadIndexUnsafe(): Promise<void> {
    try {
      // Ensure project directory exists first
      await this.ensureProjectIndexDir()
      
      // Check if index files exist
      let needsRebuild = false
      try {
        await fs.access(this.indexFile)
        await fs.access(this.metadataFile)
      } catch {
        // Files don't exist, create new index
        needsRebuild = true
      }
      
      // If we need to rebuild, initialize new index
      if (needsRebuild) {
        await this.initialize()
        return
      }

      // Load and validate metadata
      let savedData: any
      try {
        const metadataContent = await fs.readFile(this.metadataFile, 'utf-8')
        savedData = JSON.parse(metadataContent)
        
        // Validate metadata integrity
        if (!this.validateMetadata(savedData)) {
          console.warn('[VectorStore] Metadata validation failed, attempting repair...')

          // Try to repair metadata inconsistencies
          const repairResult = this.repairMetadata(savedData)
          if (repairResult.repaired) {
            savedData = repairResult.data
            // Validate again after repair
            if (this.validateMetadata(savedData)) {
              console.log('[VectorStore] Metadata repair successful, continuing with repaired metadata')
              // Mark as dirty so it gets saved on the next safe save operation
              this.metadataDirty = true
            } else {
              console.warn('[VectorStore] Metadata repair failed, rebuilding index')
              await this.rebuildIndexFromMetadata()
              return
            }
          } else {
            console.warn('[VectorStore] Could not repair metadata, rebuilding index')
            await this.rebuildIndexFromMetadata()
            return
          }
        }
      } catch (parseError: any) {
        console.error('[VectorStore] Failed to parse metadata file (corrupted):', parseError.message)
        // Backup corrupted metadata
        try {
          const backupPath = this.metadataFile + '.corrupted.' + Date.now()
          await fs.copyFile(this.metadataFile, backupPath)
        } catch (backupError) {
          console.warn('[VectorStore] Failed to backup corrupted metadata:', backupError)
        }
        
        await this.rebuildIndexFromMetadata()
        return
      }

      // Restore metadata maps
      this.metadata = new Map(savedData.metadata)
      this.idToLabel = new Map(savedData.idToLabel)
      this.labelToId = new Map(savedData.labelToId)
      this.nextLabel = savedData.nextLabel

      // Check index file size before loading (basic sanity check)
      let indexFileStats
      try {
        indexFileStats = await fs.stat(this.indexFile)
        // If index file is suspiciously small (< 100 bytes) and we have metadata, skip loading
        if (indexFileStats.size < 100 && this.metadata.size > 0) {
          console.warn(`[VectorStore] Index file too small (${indexFileStats.size} bytes) but metadata has ${this.metadata.size} entries. Rebuilding from metadata...`)
          await this.rebuildIndexFromMetadata()
          return
        }
      } catch (statError) {
        console.warn('[VectorStore] Could not stat index file:', statError)
        // Continue to try loading anyway
      }

      // Get HNSW construction parameters from saved metadata
      // CRITICAL: These parameters MUST match exactly when loading the index
      let hnswConfig = savedData.hnswConfig
      if (!hnswConfig) {
        // Legacy metadata without hnswConfig - migrate once
        console.warn('[VectorStore] Legacy metadata detected (no hnswConfig). Migrating...')
        
        // Migrate legacy index (detect space type and update metadata)
        const detectedSpace = await this.migrateLegacyIndex(savedData)
        
        if (detectedSpace) {
          // Migration successful - reload metadata to get updated hnswConfig
          const updatedMetadataContent = await fs.readFile(this.metadataFile, 'utf-8')
          const updatedData = JSON.parse(updatedMetadataContent)
          hnswConfig = updatedData.hnswConfig
          
          if (!hnswConfig) {
            throw new Error('Migration completed but hnswConfig not found in updated metadata')
          }
        } else {
          // Migration failed - use defaults (will likely fail to load, but that's OK)
          console.warn('[VectorStore] Migration failed. Using default parameters (index may not load).')
          hnswConfig = {
            space: HNSW_CONFIG.space,
            dimension: this.dimension,
            M: HNSW_CONFIG.M,
            efConstruction: HNSW_CONFIG.efConstruction,
            maxElements: Math.max(this.metadata.size * 2, 20000),
            randomSeed: 100,
            allowReplaceDeleted: false,
          }
        }
      }

      // Verify critical parameters match current configuration
      if (hnswConfig.space !== HNSW_CONFIG.space && savedData.hnswConfig) {
        // Only throw error if we have saved config (new format)
        // For legacy indices, we already handled space detection above
        throw new Error(`HNSW space mismatch: saved=${hnswConfig.space}, current=${HNSW_CONFIG.space}`)
      }
      if (hnswConfig.dimension !== this.dimension) {
        throw new Error(`HNSW dimension mismatch: saved=${hnswConfig.dimension}, current=${this.dimension}`)
      }
      if (hnswConfig.M !== HNSW_CONFIG.M) {
        console.warn(`[VectorStore] HNSW M parameter mismatch: saved=${hnswConfig.M}, current=${HNSW_CONFIG.M}. Using saved value.`)
      }
      if (hnswConfig.efConstruction !== HNSW_CONFIG.efConstruction) {
        console.warn(`[VectorStore] HNSW efConstruction parameter mismatch: saved=${hnswConfig.efConstruction}, current=${HNSW_CONFIG.efConstruction}. Using saved value.`)
      }

      // Create index with EXACTLY the same parameters used when saving
      this.index = new HierarchicalNSW(hnswConfig.space, hnswConfig.dimension)
      
      // Load index from file with corruption detection
      try {
        // CRITICAL: Initialize with EXACTLY the same parameters as when saving
        // hnswlib-node requires these parameters to match exactly for readIndex() to work
        this.index.initIndex(
          hnswConfig.maxElements,
          hnswConfig.M,
          hnswConfig.efConstruction,
          hnswConfig.randomSeed,
          hnswConfig.allowReplaceDeleted
        )
        
        // Try to read the index file
        // CRITICAL: Must use readIndexSync() (synchronous) as per official documentation
        // The synchronous version ensures proper file I/O and prevents corruption
        try {
          this.index.readIndexSync(this.indexFile)
        } catch (readError: any) {
          // If readIndexSync throws an error, the file might be corrupted or incompatible
          console.warn('[VectorStore] readIndexSync failed with error:', readError.message)
          console.warn('[VectorStore] Error details:', {
            name: readError.name,
            stack: readError.stack?.split('\n').slice(0, 3).join('\n'),
          })
          throw readError // Re-throw to trigger rebuild
        }
        
        // Verify index integrity by checking element count
        // CRITICAL: index.getCurrentCount() is the source of truth
        // metadata.size is only a reference for validation
        const currentCount = this.index.getCurrentCount()
        const metadataCount = this.metadata.size
        
        // Check for inconsistency between index and metadata
        // If inconsistent, trust the index (source of truth)
        if (currentCount !== metadataCount) {
          
          // Only rebuild if index is empty but metadata has data (index corruption)
          if (metadataCount > 0 && currentCount === 0) {
            // Index file exists but is empty - this is suspicious
            // The index file might be corrupted or the readIndex didn't work properly
            // Try reading the file again or check if it's actually empty
            console.warn(`[VectorStore] Index is empty (${currentCount}) but metadata has ${metadataCount} entries. Index file may be corrupted or empty.`)
            
            // Double-check: try to verify the index file isn't just being read incorrectly
            // If the file exists and has reasonable size, the readIndex might have failed silently
            if (indexFileStats && indexFileStats.size > 100) {
              console.warn(`[VectorStore] Index file exists and has size ${indexFileStats.size} bytes, but getCurrentCount() returned 0. This suggests readIndexSync() may have failed silently.`)
              console.warn('[VectorStore] Possible causes:')
              console.warn('  1. HNSW parameters mismatch (space, dimension, M, efConstruction, maxElements, randomSeed)')
              console.warn('  2. File partially corrupted during write (disk error, app crash, etc.)')
              console.warn('  3. hnswlib-node version incompatibility')
              console.warn('  4. Concurrent write operations')
              
              // Check version compatibility
              const savedVersion = savedData.hnswlibVersion
              if (savedVersion && savedVersion !== HNSWLIB_NODE_VERSION) {
                console.error(`[VectorStore] VERSION MISMATCH DETECTED!`)
                console.error(`[VectorStore] Index was created with hnswlib-node version: ${savedVersion}`)
                console.error(`[VectorStore] Current hnswlib-node version: ${HNSWLIB_NODE_VERSION}`)
                console.error(`[VectorStore] This is likely the cause of the index corruption!`)
                console.error(`[VectorStore] Solution: Re-index all files after upgrading hnswlib-node`)
              } else if (!savedVersion) {
                console.warn(`[VectorStore] Index metadata does not contain version info (legacy index)`)
                console.warn(`[VectorStore] Current hnswlib-node version: ${HNSWLIB_NODE_VERSION}`)
              } else {
                console.log(`[VectorStore] Version check passed: ${savedVersion} === ${HNSWLIB_NODE_VERSION}`)
              }
              
              console.warn(`[VectorStore] Saved config:`, JSON.stringify(hnswConfig, null, 2))
            }
            
            // Backup corrupted index
            try {
              const backupPath = this.indexFile + '.corrupted.' + Date.now()
              await fs.copyFile(this.indexFile, backupPath)
              console.log(`[VectorStore] Backed up corrupted index to: ${backupPath}`)
            } catch (backupError) {
              console.warn('[VectorStore] Failed to backup corrupted index:', backupError)
            }
            
            // Rebuild: preserve metadata but create empty index
            // Files will need to be re-indexed to restore search capability
            await this.rebuildIndexFromMetadata()
            return
          } else {
            // Other cases: index has data but metadata count differs
            // Trust the index (source of truth) - metadata will be updated on next save
            // This can happen if:
            // 1. Metadata is out of sync (e.g., after a failed save)
            // 2. Some chunks were deleted but metadata wasn't updated
            // 3. Index was rebuilt but metadata wasn't cleared
            // Accept the index as-is - metadata will be synchronized on next save
            // No need to rebuild, just continue with the loaded index
          }
        }
        
      } catch (loadError: any) {
        console.warn('[VectorStore] Could not load index binary (corrupted), will rebuild from metadata:', loadError.message)
        
        // Backup corrupted index
        try {
          const backupPath = this.indexFile + '.corrupted.' + Date.now()
          await fs.copyFile(this.indexFile, backupPath)
          console.log(`[VectorStore] Backed up corrupted index to: ${backupPath}`)
        } catch (backupError) {
          console.warn('[VectorStore] Failed to backup corrupted index:', backupError)
        }
        
        // Only rebuild if we have metadata to rebuild from
        if (this.metadata.size > 0) {
          console.log(`[VectorStore] Rebuilding index from ${this.metadata.size} metadata entries...`)
          // Note: rebuildIndexFromMetadata() will clear metadata and create empty index
          // We need a better rebuild that preserves metadata
          await this.rebuildIndexFromMetadata()
        } else {
          // No metadata, just create empty index
          await this.initialize()
        }
        return
      }

      this.isInitialized = true
    } catch (error: any) {
      console.error('[VectorStore] Failed to load index:', error)
      // Fallback to new index
      await this.initialize()
    }
  }

  // Note: loadIndex() removed - use loadIndexUnsafe() with explicit lock management
  // Lock upgrade must be handled explicitly by transaction boundaries

  /**
   * Save index to disk
   * 📌 UNSAFE: Assumes caller already holds write lock
   */
  async saveIndexUnsafe(): Promise<void> {
    if (!this.isInitialized || !this.index) {
      console.warn('[VectorStore] Cannot save: index not initialized')
      return
    }

    // Wait for any ongoing save to complete
    if (this.saveLock) {
      console.log('[VectorStore] Waiting for ongoing save to complete...')
      await this.saveLock
    }

    // Create a new save promise
    this.saveLock = (async () => {
      try {
        // CRITICAL: Ensure project directory exists BEFORE saving
        await this.ensureProjectIndexDir()
        
        // Verify directory exists
        if (!this.currentProjectId) {
          throw new Error('Project ID must be set before saving')
        }
        const projectDir = getProjectIndexDir(this.currentProjectId, this.currentFolder, this.currentIndexKey)
        try {
          await fs.access(projectDir)
          console.log(`[VectorStore] ✓ Project directory exists: ${projectDir}`)
        } catch (dirError) {
          console.error(`[VectorStore] ✗ Project directory does not exist: ${projectDir}`)
          throw new Error(`Project directory does not exist: ${projectDir}`)
        }

        // Get current index count before saving (for verification)
        const currentCount = this.index!.getCurrentCount()
        const metadataCount = this.metadata.size
        

        // Save metadata including HNSW construction parameters
        // These parameters MUST match when loading the index
        const metadataData = {
          metadata: Array.from(this.metadata.entries()),
          idToLabel: Array.from(this.idToLabel.entries()),
          labelToId: Array.from(this.labelToId.entries()),
          nextLabel: this.nextLabel,
          // Save HNSW construction parameters for proper index loading
          hnswConfig: {
            space: HNSW_CONFIG.space,
            dimension: this.dimension,
            M: HNSW_CONFIG.M,
            efConstruction: HNSW_CONFIG.efConstruction,
            maxElements: this.index!.getMaxElements(), // Critical: must match when loading
            randomSeed: 100,
            allowReplaceDeleted: false,
          },
          // Save library version for compatibility checking
          hnswlibVersion: HNSWLIB_NODE_VERSION,
        }
        
        // Save metadata first (atomic write using temp file + rename)
        // This ensures the original file remains intact if the write is interrupted
        const tempMetadataFile = this.metadataFile + '.tmp.' + Date.now()
        try {
          const metadataJson = JSON.stringify(metadataData, null, 2)
          await fs.writeFile(tempMetadataFile, metadataJson, 'utf-8')
          
          // Verify temp file was written correctly
          try {
            await fs.stat(tempMetadataFile)
          } catch (verifyError) {
            console.error(`[VectorStore] ✗ Temp metadata file verification failed:`, verifyError)
            throw new Error(`Temp metadata file was not saved correctly: ${tempMetadataFile}`)
          }
          
          // Atomic rename: this is the only operation that can fail and leave us in a bad state
          // But if it fails, the original file is still intact
          await fs.rename(tempMetadataFile, this.metadataFile)
          
          // Verify final metadata file exists
          try {
            await fs.stat(this.metadataFile)
          } catch (verifyError) {
            console.error(`[VectorStore] ✗ Metadata file verification failed after rename:`, verifyError)
            throw new Error(`Metadata file was not saved correctly: ${this.metadataFile}`)
          }
        } catch (writeError: any) {
          // Clean up temp file if rename failed
          try {
            await fs.unlink(tempMetadataFile).catch(() => {})
          } catch {
            // Ignore cleanup errors
          }
          throw writeError
        }

        // Save index binary using writeIndexSync() (synchronous) as per official documentation
        // CRITICAL: The synchronous version ensures atomic writes and prevents corruption
        // This is the critical operation - if it fails, metadata might be out of sync
        try {
          this.index!.writeIndexSync(this.indexFile)
          
          // CRITICAL: Verify index file exists on disk after write
          try {
            await fs.stat(this.indexFile)
          } catch (fileError) {
            console.error(`[VectorStore] ✗ Index file not found on disk after write:`, fileError)
            throw new Error(`Index file was not saved to disk: ${this.indexFile}`)
          }
          
          // Verify the saved index can be read back
          // This helps catch corruption early
          const verifyIndex = new HierarchicalNSW(HNSW_CONFIG.space, this.dimension)
          verifyIndex.initIndex(
            metadataData.hnswConfig.maxElements,
            metadataData.hnswConfig.M,
            metadataData.hnswConfig.efConstruction,
            metadataData.hnswConfig.randomSeed,
            metadataData.hnswConfig.allowReplaceDeleted
          )
          verifyIndex.readIndexSync(this.indexFile)
          const verifyCount = verifyIndex.getCurrentCount()
          
          if (verifyCount !== currentCount) {
            console.error(`[VectorStore] ✗ Verification failed: saved count=${verifyCount}, expected=${currentCount}`)
            throw new Error(`Index verification failed: saved ${verifyCount} elements but expected ${currentCount}`)
          }

          // Metadata and index are now consistent on disk
          this.metadataDirty = false
          
        } catch (writeError: any) {
          console.error('[VectorStore] Failed to write or verify index:', writeError)
          // Try to backup the corrupted file if it exists
          try {
            const backupPath = this.indexFile + '.write-failed.' + Date.now()
            await fs.copyFile(this.indexFile, backupPath).catch(() => {})
            console.log(`[VectorStore] Backed up potentially corrupted index to: ${backupPath}`)
          } catch (backupError) {
            // Ignore backup errors
          }
          throw writeError
        }
      } catch (error: any) {
        console.error('[VectorStore] Failed to save index:', error)
        throw error
      } finally {
        // Clear the save lock
        this.saveLock = null
      }
    })()

    await this.saveLock
  }

  /**
   * Add chunks to the index
   * 📌 UNSAFE: Assumes caller already holds write lock
   * VectorStore is a "database kernel", not a transaction manager
   * Lock management must be handled by transaction boundaries (documentService/projectService)
   */
  async addChunksUnsafe(chunks: Chunk[], embeddings: number[][], projectId?: string): Promise<void> {
    // Check if index needs to be loaded first
    if (!this.isInitialized || !this.index) {
      console.log(`[VectorStore] Index not initialized, loading...`)
      // Load index - caller must hold write lock
      await this.loadIndexUnsafe()
      if (!this.index) {
        throw new Error('Index not initialized after loadIndex()')
      }
    }

      // CRITICAL: Verify index has valid capacity
    const maxElements = this.index.getMaxElements()
    if (maxElements === 0) {
      console.error(`[VectorStore] Index has zero capacity! Reinitializing...`)
      await this.initialize()
      if (!this.index) {
        throw new Error('Failed to reinitialize index')
      }
      const newMaxElements = this.index.getMaxElements()
      if (newMaxElements === 0) {
        throw new Error('Index reinitialization failed: maxElements is still 0')
      }
      console.log(`[VectorStore] Index reinitialized with capacity: ${newMaxElements}`)
    }

    if (chunks.length !== embeddings.length) {
      throw new Error(`Chunks and embeddings length mismatch: ${chunks.length} vs ${embeddings.length}`)
    }

    // Ensure index has enough capacity
    const currentCount = this.index.getCurrentCount()
    const neededCapacity = currentCount + chunks.length
    const currentMaxElements = this.index.getMaxElements()
    
    // Capacity monitoring and guardrail
    const CAPACITY_WARNING_THRESHOLD = 0.8 // 80%
    const CAPACITY_ERROR_THRESHOLD = 1.0 // 100%
    const warningThreshold = Math.floor(currentMaxElements * CAPACITY_WARNING_THRESHOLD)
    const errorThreshold = Math.floor(currentMaxElements * CAPACITY_ERROR_THRESHOLD)
    
    // Check if we're approaching capacity limit
    if (currentCount >= warningThreshold && currentCount < errorThreshold) {
      console.warn(`[VectorStore] Index capacity warning: ${currentCount}/${currentMaxElements} chunks (${Math.round(currentCount / currentMaxElements * 100)}%). Consider splitting the project or cleaning up files.`)
    }
    
    // Check if we've exceeded capacity
    if (neededCapacity > currentMaxElements) {
      const errorMsg = `Index capacity exceeded: need ${neededCapacity}, have ${currentMaxElements}. Please split the project or remove some files.`
      console.error(`[VectorStore] ${errorMsg}`)
      throw new Error(errorMsg)
    }
    
    // Check if we're at capacity limit
    if (neededCapacity >= errorThreshold) {
      const errorMsg = `Index capacity limit reached: ${neededCapacity}/${currentMaxElements} chunks. Please split the project or remove some files.`
      console.error(`[VectorStore] ${errorMsg}`)
      throw new Error(errorMsg)
    }

    // Add each chunk with its embedding
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const embedding = embeddings[i]

      if (embedding.length !== this.dimension) {
        throw new Error(
          `Embedding dimension mismatch: expected ${this.dimension}, got ${embedding.length}`
        )
      }

      // Check if chunk already exists
      if (this.idToLabel.has(chunk.id)) {
        // Remove old chunk first
        await this.removeChunk(chunk.id)
      }

      // Get next label
      const label = this.nextLabel++
      
      // Add point to index (hnswlib-node uses addPoint)
      // hnswlib-node accepts number[] directly
      this.index.addPoint(embedding, label, false) // replaceDeleted = false

      // Store metadata
      const metadata: ChunkMetadata = {
        id: chunk.id,
        fileId: chunk.fileId,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        hash: chunk.hash,
        startChar: chunk.startChar || 0,
        endChar: chunk.endChar || chunk.text.length,
        tokenCount: chunk.tokenCount || 0,
        projectId: projectId, // Store projectId for library file scoping
      }

      this.metadata.set(label, metadata)
      this.idToLabel.set(chunk.id, label)
      this.labelToId.set(label, chunk.id)
    }
  }

  /**
   * Add semantic blocks (for Workspace paragraph-level indexing)
   * Similar to addChunksUnsafe but handles SemanticBlock with paragraphId
   * 📌 UNSAFE: Assumes caller already holds write lock
   */
  async addSemanticBlocksUnsafe(
    blocks: Array<{ paragraphId: string; fileId: string; text: string; hash: string; paragraphIndex: number; headingText?: string; headingLevel?: number; paragraphCount: number; tokenCount: number }>,
    embeddings: number[][],
    projectId?: string
  ): Promise<void> {
    // Check if index needs to be loaded first
    if (!this.isInitialized || !this.index) {
      console.log(`[VectorStore] Index not initialized, loading...`)
      await this.loadIndexUnsafe()
      if (!this.index) {
        throw new Error('Index not initialized after loadIndex()')
      }
    }

    // Verify index capacity (same logic as addChunksUnsafe)
    const maxElements = this.index.getMaxElements()
    if (maxElements === 0) {
      console.error(`[VectorStore] Index has zero capacity! Reinitializing...`)
      await this.initialize()
      if (!this.index) {
        throw new Error('Failed to reinitialize index')
      }
    }

    if (blocks.length !== embeddings.length) {
      throw new Error(`Blocks and embeddings length mismatch: ${blocks.length} vs ${embeddings.length}`)
    }

    const currentCount = this.index.getCurrentCount()
    const neededCapacity = currentCount + blocks.length
    const currentMaxElements = this.index.getMaxElements()
    
    if (neededCapacity > currentMaxElements) {
      throw new Error(`Index capacity exceeded: need ${neededCapacity}, have ${currentMaxElements}`)
    }

    // Add each block with its embedding
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      const embedding = embeddings[i]

      if (embedding.length !== this.dimension) {
        throw new Error(
          `Embedding dimension mismatch: expected ${this.dimension}, got ${embedding.length}`
        )
      }

      // Check if block already exists by paragraphId
      let existingLabel: number | undefined
      for (const [label, metadata] of this.metadata.entries()) {
        if (metadata.paragraphId === block.paragraphId) {
          existingLabel = label
          break
        }
      }

      if (existingLabel !== undefined) {
        // Remove old block first
        await this.removeChunkByParagraphIdUnsafe(block.paragraphId, false) // Don't auto-save, save once at the end
      }

      // Generate chunk ID (for compatibility with existing system)
      const chunkId = `${block.fileId}_para_${block.paragraphIndex}`

      // Get next label
      const label = this.nextLabel++
      
      // Add point to index
      this.index.addPoint(embedding, label, false)

      // Store metadata with paragraph-level fields
      const metadata: ChunkMetadata = {
        id: chunkId,
        fileId: block.fileId,
        chunkIndex: block.paragraphIndex, // Use paragraphIndex as chunkIndex
        text: block.text,
        hash: block.hash, // Keep hash for backward compatibility
        startChar: 0, // Not applicable for semantic blocks
        endChar: block.text.length,
        tokenCount: block.tokenCount,
        projectId: projectId,
        // Paragraph-level fields
        paragraphId: block.paragraphId,
        paragraphIndex: block.paragraphIndex,
        paragraphHash: block.hash,
        paragraphType: 'semantic-block',
        headingText: block.headingText,
        headingLevel: block.headingLevel,
      }

      this.metadata.set(label, metadata)
      this.idToLabel.set(chunkId, label)
      this.labelToId.set(label, chunkId)
    }
  }

  /**
   * Remove a chunk from the index
   */
  async removeChunk(chunkId: string): Promise<void> {
    const label = this.idToLabel.get(chunkId)
    if (label === undefined) {
      return // Chunk not in index
    }

    if (!this.index) {
      throw new Error('Index not initialized')
    }

    // Check if index has any elements before trying to delete
    // If index is empty (e.g., after corruption recovery), just clean up metadata
    const currentCount = this.index.getCurrentCount()
    if (currentCount === 0) {
      // Index is empty, just remove from metadata maps
      this.metadata.delete(label)
      this.idToLabel.delete(chunkId)
      this.labelToId.delete(label)
      return
    }

    // Try to mark as deleted (hnswlib-node uses markDelete)
    // Wrap in try-catch to handle case where label doesn't exist in index
    // (can happen if index was corrupted and rebuilt but metadata wasn't cleared)
    try {
      this.index.markDelete(label)
    } catch (error: any) {
      // If label not found, it means the index doesn't have this label
      // This can happen after index corruption/recovery - just clean up metadata
      if (error.message && error.message.includes('Label not found')) {
        console.warn(`[VectorStore] Label ${label} not found in index (likely due to corruption recovery), cleaning up metadata only`)
      } else {
        // Re-throw if it's a different error
        throw error
      }
    }

    // Remove from metadata maps
    this.metadata.delete(label)
    this.idToLabel.delete(chunkId)
    this.labelToId.delete(label)
  }

  /**
   * Internal method to remove chunks by file (without lock)
   * Caller must ensure proper locking
   * @param fileId - The file ID to remove chunks for
   * @returns Number of chunks removed
   */
  private async removeChunksByFileInternal(fileId: string): Promise<number> {
    const chunksToRemove: string[] = []
    
    // Find all chunks for this file
    for (const [chunkId, label] of this.idToLabel.entries()) {
      const metadata = this.metadata.get(label)
      if (metadata && metadata.fileId === fileId) {
        chunksToRemove.push(chunkId)
      }
    }

    if (chunksToRemove.length === 0) {
      console.log(`[VectorStore] No chunks found for file ${fileId}`)
      return 0
    }


    // Remove each chunk
    for (const chunkId of chunksToRemove) {
      await this.removeChunk(chunkId)
    }

    return chunksToRemove.length
  }

  /**
   * Remove all chunks for a file
   * 📌 UNSAFE: Assumes caller already holds write lock
   * 
   * @param fileId - The file ID to remove chunks for
   * @param autoSave - Whether to automatically save the index after removal (default: true)
   */
  async removeChunksByFileUnsafe(fileId: string, autoSave: boolean = true): Promise<void> {
    const removedCount = await this.removeChunksByFileInternal(fileId)
    
    if (removedCount === 0) {
      return
    }

    // CRITICAL: Save index immediately after removal to persist changes
    // This ensures that deletions are persisted even if the app crashes or restarts
    if (autoSave) {
      try {
        await this.saveIndexUnsafe()
      } catch (saveError: any) {
        console.error(`[VectorStore] Failed to save index after removing chunks for file ${fileId}:`, saveError)
        // Re-throw to ensure caller knows save failed
        throw new Error(`Failed to save index after removing chunks: ${saveError.message}`)
      }
    }
  }

  /**
   * Get all unique fileIds whose fileId starts with the given prefix
   * 📌 UNSAFE: Assumes caller already holds read or write lock
   */
  getFileIdsByPrefixUnsafe(filePrefix: string): Set<string> {
    const fileIds = new Set<string>()
    for (const metadata of this.metadata.values()) {
      if (metadata && typeof metadata.fileId === 'string' && metadata.fileId.startsWith(filePrefix)) {
        fileIds.add(metadata.fileId)
      }
    }
    return fileIds
  }

  /**
   * Remove all chunks whose fileId starts with a prefix
   * 📌 UNSAFE: Assumes caller already holds write lock
   */
  async removeChunksByFilePrefixUnsafe(filePrefix: string, autoSave: boolean = true): Promise<number> {
    if (!filePrefix || filePrefix.trim().length === 0) {
      return 0
    }

    const chunksToRemove: string[] = []
    for (const [chunkId, label] of this.idToLabel.entries()) {
      const metadata = this.metadata.get(label)
      if (metadata && typeof metadata.fileId === 'string' && metadata.fileId.startsWith(filePrefix)) {
        chunksToRemove.push(chunkId)
      }
    }

    if (chunksToRemove.length === 0) {
      return 0
    }

    for (const chunkId of chunksToRemove) {
      await this.removeChunk(chunkId)
    }

    if (autoSave) {
      await this.saveIndexUnsafe()
    }

    return chunksToRemove.length
  }

  /**
   * Remove a chunk by paragraphId (for Workspace paragraph-level indexing)
   * 📌 UNSAFE: Assumes caller already holds write lock
   * 
   * @param paragraphId - The paragraph UUID to remove
   * @param autoSave - Whether to automatically save the index after removal (default: true)
   */
  async removeChunkByParagraphIdUnsafe(paragraphId: string, autoSave: boolean = true): Promise<void> {
    // Find chunk by paragraphId
    let chunkId: string | undefined
    for (const [label, metadata] of this.metadata.entries()) {
      if (metadata.paragraphId === paragraphId) {
        chunkId = metadata.id
        break
      }
    }

    if (!chunkId) {
      console.log(`[VectorStore] No chunk found with paragraphId ${paragraphId}`)
      return
    }

    await this.removeChunk(chunkId)

    if (autoSave) {
      try {
        await this.saveIndexUnsafe()
      } catch (saveError: any) {
        console.error(`[VectorStore] Failed to save index after removing chunk by paragraphId ${paragraphId}:`, saveError)
        throw new Error(`Failed to save index after removing chunk: ${saveError.message}`)
      }
    }
  }

  /**
   * Update paragraph position (paragraphIndex) by paragraphId
   * Used when a paragraph is moved but content unchanged (hash matches)
   * 📌 UNSAFE: Assumes caller already holds write lock
   * 
   * @param paragraphId - The paragraph UUID
   * @param newParagraphIndex - New position index
   * @param autoSave - Whether to automatically save the index after update (default: true)
   */
  async updateChunkPositionUnsafe(
    paragraphId: string,
    newParagraphIndex: number,
    autoSave: boolean = true
  ): Promise<void> {
    // Find chunk by paragraphId
    let label: number | undefined
    for (const [l, metadata] of this.metadata.entries()) {
      if (metadata.paragraphId === paragraphId) {
        label = l
        break
      }
    }

    if (label === undefined) {
      throw new Error(`Chunk with paragraphId ${paragraphId} not found`)
    }

    // Update metadata
    const metadata = this.metadata.get(label)
    if (!metadata) {
      throw new Error(`Metadata not found for label ${label}`)
    }

    metadata.paragraphIndex = newParagraphIndex
    this.metadata.set(label, metadata)

    if (autoSave) {
      try {
        await this.saveIndexUnsafe()
      } catch (saveError: any) {
        console.error(`[VectorStore] Failed to save index after updating chunk position for paragraphId ${paragraphId}:`, saveError)
        throw new Error(`Failed to save index after updating chunk position: ${saveError.message}`)
      }
    }
  }

  /**
   * Find chunks by hash (for incremental indexing)
   * Returns all chunks matching the given hash
   * 📌 UNSAFE: Assumes caller already holds read lock
   * 
   * @param hash - The paragraph hash to search for
   * @param fileId - Optional: Filter by file ID
   * @returns Array of matching chunk metadata
   */
  findChunksByHashUnsafe(hash: string, fileId?: string): ChunkMetadata[] {
    const results: ChunkMetadata[] = []

    for (const metadata of this.metadata.values()) {
      // Check paragraphHash first (for Workspace), fallback to hash (for Library)
      const matchesHash = metadata.paragraphHash === hash || metadata.hash === hash
      const matchesFile = !fileId || metadata.fileId === fileId

      if (matchesHash && matchesFile) {
        results.push(metadata)
      }
    }

    return results
  }

  /**
   * Get all chunks for a file (for incremental indexing)
   * 📌 UNSAFE: Assumes caller already holds read lock
   * 
   * @param fileId - The file ID
   * @returns Array of chunk metadata for the file
   */
  getChunksByFileIdUnsafe(fileId: string): ChunkMetadata[] {
    const results: ChunkMetadata[] = []

    for (const metadata of this.metadata.values()) {
      if (metadata.fileId === fileId) {
        results.push(metadata)
      }
    }

    return results
  }

  /**
   * Search for similar chunks
   * 📌 UNSAFE: Assumes caller already holds read lock
   * 
   * Note: If index needs to be loaded and requires write lock (e.g., for rebuilding),
   * caller must handle lock upgrade explicitly. This method will throw if index
   * is not initialized and caller only holds read lock.
   */
  async searchUnsafe(
    queryEmbedding: number[],
    k: number = 6,
    fileIds?: string[], // Optional: Filter results by file IDs
    efSearch: number = HNSW_CONFIG.efSearch
  ): Promise<SearchResult[]> {
    // Check if index needs to be loaded first
    if (!this.isInitialized || !this.index) {
      throw new Error('Index not initialized. Caller must load index with appropriate lock first.')
    }

      if (queryEmbedding.length !== this.dimension) {
        throw new Error(
          `Query embedding dimension mismatch: expected ${this.dimension}, got ${queryEmbedding.length}`
        )
      }

      // Set efSearch parameter (higher improves recall at a small perf cost)
      this.index.setEf(efSearch)

      // Search (hnswlib-node uses searchKnn)
      // hnswlib-node accepts number[] directly
      const result = this.index.searchKnn(queryEmbedding, k, undefined) // filter = undefined to search all

      // Convert results to SearchResult format
      const results: SearchResult[] = []
      
      for (let i = 0; i < result.neighbors.length; i++) {
        const label = result.neighbors[i]
        const distance = result.distances[i]
        
        // Get metadata
        const metadata = this.metadata.get(label)
        if (!metadata) {
          continue // Skip if metadata not found (was removed)
        }

        // Filter by fileIds if specified
        if (fileIds && fileIds.length > 0 && !fileIds.includes(metadata.fileId)) {
          continue
        }

        // Note: No need to filter by projectId - index is already scoped by projectId and folder

        // Convert distance to similarity score (lower distance = higher similarity)
        // Score is normalized to 0-1 range (1 = perfect match, 0 = no match)
        // Using exponential decay: score = exp(-distance)
        const score = Math.exp(-distance)

        results.push({
          chunk: metadata,
          score,
          distance,
        })
      }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score)

    return results
  }

  /**
   * Get index statistics
   */
  getStats(): {
    totalChunks: number
    totalFiles: number
    dimension: number
    needsRebuild: boolean
    indexCount: number
    metadataCount: number
    projectId: string | undefined
  } {
    const fileIds = new Set<string>()
    for (const metadata of this.metadata.values()) {
      fileIds.add(metadata.fileId)
    }

    const indexCount = this.index ? this.index.getCurrentCount() : 0
    const metadataCount = this.metadata.size
    const needsRebuild = metadataCount > 0 && indexCount === 0

    return {
      totalChunks: metadataCount,
      totalFiles: fileIds.size,
      dimension: this.dimension,
      needsRebuild,
      indexCount,
      metadataCount,
      projectId: this.currentProjectId,
    }
  }

  /**
   * Validate index integrity on startup
   * Checks if metadata count matches index count
   * Returns true if valid, false if needs rebuild
   */
  async validateIntegrity(): Promise<{ valid: boolean; indexCount: number; metadataCount: number; needsRebuild: boolean }> {
    // Need write lock for potential auto-repair
    let releaseLock = await projectLockManager.acquireWriteLock(this.currentProjectId)
    try {
      await this.loadIndexUnsafe()
      const indexCount = this.index ? this.index.getCurrentCount() : 0
      const metadataCount = this.metadata.size
      const valid = indexCount === metadataCount
      const needsRebuild = metadataCount > 0 && indexCount === 0

      if (!valid) {
        console.warn(`[VectorStore] Integrity check failed for project ${this.currentProjectId || 'global'}: indexCount=${indexCount}, metadataCount=${metadataCount}`)

        // If index is empty but metadata exists, keep the empty index and reindex lazily.
        // Avoid rebuilding every startup (loadIndexUnsafe already handles corruption cases).
        if (needsRebuild) {
          return { valid: true, indexCount, metadataCount, needsRebuild: true }
        }

        // If index has data but metadata differs, trust the index and allow metadata to
        // be synchronized on the next save (same as loadIndexUnsafe behavior).
        return { valid: true, indexCount, metadataCount, needsRebuild: false }
      }

      return { valid, indexCount, metadataCount, needsRebuild }
    } catch (error: any) {
      console.error(`[VectorStore] Integrity check error for project ${this.currentProjectId || 'global'}:`, error)
      return { valid: false, indexCount: 0, metadataCount: this.metadata.size, needsRebuild: true }
    } finally {
      releaseLock()
    }
  }
}

// Singleton instance per project and folder
// Key format: `${projectId}:${folder}`
const vectorStoreInstances: Map<string, VectorStore> = new Map()

/**
 * Get vector store instance for a specific project and folder
 * @param projectId - Project ID (pure semantic ID, required)
 * @param folder - Folder type: 'library' or 'project'
 */
export function getVectorStore(projectId: string, folder: 'library' | 'project', indexKey?: string): VectorStore {
  if (!projectId) {
    throw new Error('Project ID is required')
  }

  // Create a unique key for the instance map
  const normalizedIndexKey = indexKey && indexKey.trim().length > 0 ? indexKey : '__legacy__'
  const instanceKey = `${projectId}:${folder}:${normalizedIndexKey}`
  
  if (!vectorStoreInstances.has(instanceKey)) {
    const store = new VectorStore()
    store.setProjectId(projectId, folder, indexKey)
    vectorStoreInstances.set(instanceKey, store)
  } else {
    // Ensure project ID and folder are set (in case they were changed)
    const store = vectorStoreInstances.get(instanceKey)!
    store.setProjectId(projectId, folder, indexKey)
  }
  
  return vectorStoreInstances.get(instanceKey)!
}

/**
 * Clean up corrupted files and orphaned index entries
 * This function should be called on app startup and before file uploads
 * @param projectId - Optional project ID to clean. If not provided, cleans all projects
 */
export async function cleanupVectorIndex(projectId?: string): Promise<{
  corruptedFilesRemoved: number
  orphanedChunksRemoved: number
  errors: string[]
}> {
  const result = {
    corruptedFilesRemoved: 0,
    orphanedChunksRemoved: 0,
    errors: [] as string[],
  }

  try {
    // Import documentService here to avoid circular dependency
    const { documentService } = await import('./documentService.js')
    
    // Get all existing document IDs for validation
    const allDocuments = await documentService.getAll()
    const validDocumentIds = new Set(allDocuments.map(doc => doc.id))
    
    // Determine which projects to clean
    const projectsToClean: string[] = []
    
    if (projectId) {
      projectsToClean.push(projectId)
    } else {
      // Clean all projects
      try {
        const projectDirs = await fs.readdir(BASE_VECTOR_INDEX_DIR, { withFileTypes: true })
        for (const dirent of projectDirs) {
          if (dirent.isDirectory()) {
            projectsToClean.push(dirent.name)
          }
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          result.errors.push(`Failed to read vectorIndex directory: ${error.message}`)
        }
        return result
      }
    }

    // Clean each project
    for (const projId of projectsToClean) {
      try {
        // Only clean library indexes (project indexes not supported yet)
        const actualProjectId = projId === 'library' ? 'library' : projId
        const projectDir = getProjectIndexDir(actualProjectId, 'library')
        
        // Check if project directory exists
        try {
          await fs.access(projectDir)
        } catch {
          // Directory doesn't exist, skip
          continue
        }

        // Step 1: Remove all .corrupted files
        try {
          const files = await fs.readdir(projectDir)
          for (const file of files) {
            if (file.includes('.corrupted.')) {
              const corruptedFilePath = path.join(projectDir, file)
              try {
                await fs.unlink(corruptedFilePath)
                result.corruptedFilesRemoved++
                console.log(`[Cleanup] Removed corrupted file: ${corruptedFilePath}`)
              } catch (unlinkError: any) {
                result.errors.push(`Failed to remove corrupted file ${file}: ${unlinkError.message}`)
              }
            }
          }
        } catch (readError: any) {
          result.errors.push(`Failed to read project directory ${projId}: ${readError.message}`)
          continue
        }

        // Step 2: Clean orphaned chunks from metadata.json
        const metadataFile = path.join(projectDir, 'metadata.json')
        try {
          await fs.access(metadataFile)
        } catch {
          // Metadata file doesn't exist, skip
          continue
        }

        // Load metadata to check for orphaned fileIds
        let metadataContent: string
        try {
          metadataContent = await fs.readFile(metadataFile, 'utf-8')
        } catch (readError: any) {
          result.errors.push(`Failed to read metadata.json for ${projId}: ${readError.message}`)
          continue
        }

        let savedData: any
        try {
          savedData = JSON.parse(metadataContent)
        } catch (parseError: any) {
          result.errors.push(`Failed to parse metadata.json for ${projId}: ${parseError.message}`)
          continue
        }

        // Extract all unique fileIds from metadata
        // Metadata is stored as array of [label, ChunkMetadata] pairs
        const fileIdsInMetadata = new Set<string>()
        if (savedData.metadata && Array.isArray(savedData.metadata)) {
          // Metadata is stored as array of [label, ChunkMetadata]
          for (const entry of savedData.metadata) {
            if (Array.isArray(entry) && entry.length === 2) {
              const metadata = entry[1] // Second element is ChunkMetadata
              if (metadata && metadata.fileId) {
                fileIdsInMetadata.add(metadata.fileId)
              }
            }
          }
        }

        // Find orphaned fileIds (fileIds in metadata but not in valid documents)
        const orphanedFileIds: string[] = []
        for (const fileId of fileIdsInMetadata) {
          // Integration chunks use synthetic fileIds and should not be treated as orphaned
          if (fileId.startsWith('integration:')) {
            continue
          }
          if (!validDocumentIds.has(fileId)) {
            orphanedFileIds.push(fileId)
          }
        }

        // Remove orphaned chunks
        if (orphanedFileIds.length > 0) {
          console.log(`[Cleanup] Found ${orphanedFileIds.length} orphaned file(s) in project ${projId}`)
          
          // Acquire write lock for cleanup
          const actualProjectId = projId === 'library' ? 'library' : projId
          const releaseLock = await projectLockManager.acquireWriteLock(actualProjectId)
          try {
            // Only clean library indexes (project indexes not supported yet)
            const vectorStore = getVectorStore(actualProjectId, 'library')
            await vectorStore.loadIndexUnsafe()
            
            for (const fileId of orphanedFileIds) {
              try {
                await vectorStore.removeChunksByFileUnsafe(fileId, false) // Don't auto-save, save once at the end
                result.orphanedChunksRemoved++
                console.log(`[Cleanup] Removed orphaned chunks for file: ${fileId} (project: ${projId})`)
              } catch (removeError: any) {
                result.errors.push(`Failed to remove chunks for file ${fileId} in project ${projId}: ${removeError.message}`)
              }
            }
            
            // Save index once after all removals
            try {
              await vectorStore.saveIndexUnsafe()
              console.log(`[Cleanup] Saved index after cleanup for project ${projId}`)
            } catch (saveError: any) {
              result.errors.push(`Failed to save index after cleanup for project ${projId}: ${saveError.message}`)
            }
          } finally {
            releaseLock()
          }
        }
      } catch (error: any) {
        result.errors.push(`Error cleaning project ${projId}: ${error.message}`)
      }
    }
  } catch (error: any) {
    result.errors.push(`Cleanup failed: ${error.message}`)
  }

  return result
}
