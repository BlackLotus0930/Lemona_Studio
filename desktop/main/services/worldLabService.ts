// Desktop WorldLab Service - Manages WorldLab files and structure
import { WorldLab, WorldLabNode, WorldLabEdge, WorldLabMetadata } from '../../../shared/types.js'
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

// Use Electron's userData directory for Labs
const LABS_DIR = path.join(app.getPath('userData'), 'Labs')

console.log('Desktop WorldLab service initialized:')
console.log('  LABS_DIR:', LABS_DIR)

// Ensure Labs directory exists
async function ensureLabsDir() {
  try {
    await fs.mkdir(LABS_DIR, { recursive: true })
  } catch (error) {
    console.error('Error creating Labs directory:', error)
  }
}

// Initialize on import
ensureLabsDir()

/**
 * Get the path to a Lab directory
 */
function getLabPath(labName: string): string {
  return path.join(LABS_DIR, labName)
}

/**
 * Get the path to the nodes directory within a Lab
 */
function getNodesDirPath(labPath: string): string {
  return path.join(labPath, 'nodes')
}

/**
 * Get the path to edges.json within a Lab
 */
function getEdgesPath(labPath: string): string {
  return path.join(labPath, 'edges.json')
}

/**
 * Get the path to metadata.json within a Lab
 */
function getMetadataPath(labPath: string): string {
  return path.join(labPath, 'metadata.json')
}

/**
 * Get the path to a node file
 */
function getNodeFilePath(labPath: string, nodeId: string): string {
  return path.join(labPath, 'nodes', `${nodeId}.md`)
}

/**
 * Extract node ID from filename (remove .md extension)
 */
function extractNodeId(filename: string): string {
  if (filename.endsWith('.md')) {
    return filename.slice(0, -3)
  }
  return filename
}

/**
 * Extract first line or title from markdown content
 */
function extractTitleFromMarkdown(content: string): string {
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      return trimmed.slice(0, 50) // First 50 chars
    }
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim()
    }
  }
  return 'Untitled'
}

export const worldLabService = {
  /**
   * Load a WorldLab by lab name
   */
  async load(labName: string): Promise<WorldLab | null> {
    try {
      const labPath = getLabPath(labName)
      console.log(`[worldLabService] Loading Lab: labName=${labName}, labPath=${labPath}`)
      
      // Check if Lab directory exists
      try {
        await fs.access(labPath)
        console.log(`[worldLabService] Lab directory exists: ${labPath}`)
      } catch {
        console.log(`[worldLabService] Lab directory not found: ${labPath}, will create empty structure`)
        // Instead of returning null, create empty Lab structure
        // This allows users to start with an empty canvas
        return {
          labPath,
          labName,
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          nodes: [],
          edges: [],
        }
      }

      // Load metadata
      const metadata = await this.loadMetadata(labName)
      console.log(`[worldLabService] Loaded metadata:`, metadata)
      
      // Load nodes
      const nodes = await this.loadNodes(labName)
      console.log(`[worldLabService] Loaded ${nodes.length} nodes`)
      
      // Load edges
      const edges = await this.loadEdges(labName)
      console.log(`[worldLabService] Loaded ${edges.length} edges`)

      return {
        labPath,
        labName,
        metadata: metadata || {},
        nodes,
        edges,
      }
    } catch (error) {
      console.error(`[worldLabService] Error loading Lab ${labName}:`, error)
      // Return empty structure instead of null to allow empty canvas
      return {
        labPath: getLabPath(labName),
        labName,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        nodes: [],
        edges: [],
      }
    }
  },

  /**
   * Load all nodes from a Lab
   */
  async loadNodes(labName: string): Promise<WorldLabNode[]> {
    try {
      const labPath = getLabPath(labName)
      const nodesDir = getNodesDirPath(labPath)
      
      // Ensure nodes directory exists
      try {
        await fs.mkdir(nodesDir, { recursive: true })
      } catch (error) {
        console.error(`[worldLabService] Error creating nodes directory:`, error)
      }

      // Check if nodes directory exists
      try {
        await fs.access(nodesDir)
      } catch {
        // Nodes directory doesn't exist, return empty array
        return []
      }

      // Read all .md files in nodes directory
      const files = await fs.readdir(nodesDir)
      const nodeFiles = files.filter(file => file.endsWith('.md'))
      
      const nodes: WorldLabNode[] = []
      
      for (const file of nodeFiles) {
        try {
          const nodeId = extractNodeId(file)
          const filePath = getNodeFilePath(labPath, nodeId)
          const content = await fs.readFile(filePath, 'utf-8')
          
          // Extract title/label from content
          const label = extractTitleFromMarkdown(content)
          
          // Try to load position from edges.json or use default
          // For now, use default position - we'll enhance this later
          const position = { x: Math.random() * 400, y: Math.random() * 400 }
          
          nodes.push({
            id: nodeId,
            label,
            position,
            data: {
              content,
              description: content.slice(0, 200), // Preview
            },
          })
        } catch (error) {
          console.error(`[worldLabService] Error reading node file ${file}:`, error)
        }
      }
      
      return nodes
    } catch (error) {
      console.error(`[worldLabService] Error loading nodes for Lab ${labName}:`, error)
      return []
    }
  },

  /**
   * Load edges from edges.json
   */
  async loadEdges(labName: string): Promise<WorldLabEdge[]> {
    try {
      const labPath = getLabPath(labName)
      const edgesPath = getEdgesPath(labPath)
      
      try {
        const content = await fs.readFile(edgesPath, 'utf-8')
        const edges = JSON.parse(content)
        
        // Validate edges array
        if (Array.isArray(edges)) {
          return edges.map((edge: any, index: number) => ({
            id: edge.id || `edge_${index}`,
            source: edge.source,
            target: edge.target,
            type: edge.type || 'default',
            label: edge.label,
            animated: edge.animated || false,
            style: edge.style,
          }))
        }
        
        return []
      } catch {
        // edges.json doesn't exist, return empty array
        return []
      }
    } catch (error) {
      console.error(`[worldLabService] Error loading edges for Lab ${labName}:`, error)
      return []
    }
  },

  /**
   * Load metadata from metadata.json
   */
  async loadMetadata(labName: string): Promise<WorldLabMetadata | null> {
    try {
      const labPath = getLabPath(labName)
      const metadataPath = getMetadataPath(labPath)
      
      try {
        const content = await fs.readFile(metadataPath, 'utf-8')
        return JSON.parse(content)
      } catch {
        // metadata.json doesn't exist, return default metadata
        return {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      }
    } catch (error) {
      console.error(`[worldLabService] Error loading metadata for Lab ${labName}:`, error)
      return null
    }
  },

  /**
   * Save a node file
   */
  async saveNode(labName: string, nodeId: string, content: string): Promise<boolean> {
    try {
      const labPath = getLabPath(labName)
      const nodesDir = getNodesDirPath(labPath)
      
      // Ensure nodes directory exists
      await fs.mkdir(nodesDir, { recursive: true })
      
      const filePath = getNodeFilePath(labPath, nodeId)
      await fs.writeFile(filePath, content, 'utf-8')
      
      // Update metadata updatedAt
      await this.updateMetadataTimestamp(labName)
      
      return true
    } catch (error) {
      console.error(`[worldLabService] Error saving node ${nodeId} for Lab ${labName}:`, error)
      return false
    }
  },

  /**
   * Save edges to edges.json
   */
  async saveEdges(labName: string, edges: WorldLabEdge[]): Promise<boolean> {
    try {
      const labPath = getLabPath(labName)
      const edgesPath = getEdgesPath(labPath)
      
      // Ensure Lab directory exists
      await fs.mkdir(labPath, { recursive: true })
      
      await fs.writeFile(edgesPath, JSON.stringify(edges, null, 2), 'utf-8')
      
      // Update metadata updatedAt
      await this.updateMetadataTimestamp(labName)
      
      return true
    } catch (error) {
      console.error(`[worldLabService] Error saving edges for Lab ${labName}:`, error)
      return false
    }
  },

  /**
   * Create a new node
   */
  async createNode(labName: string, nodeId: string, content: string = ''): Promise<boolean> {
    try {
      const labPath = getLabPath(labName)
      const nodesDir = getNodesDirPath(labPath)
      
      // Ensure nodes directory exists
      await fs.mkdir(nodesDir, { recursive: true })
      
      const filePath = getNodeFilePath(labPath, nodeId)
      
      // Check if node already exists
      try {
        await fs.access(filePath)
        // Node already exists, don't overwrite
        return false
      } catch {
        // Node doesn't exist, create it
      }
      
      await fs.writeFile(filePath, content || `# ${nodeId}\n\n`, 'utf-8')
      
      // Update metadata updatedAt
      await this.updateMetadataTimestamp(labName)
      
      return true
    } catch (error) {
      console.error(`[worldLabService] Error creating node ${nodeId} for Lab ${labName}:`, error)
      return false
    }
  },

  /**
   * Delete a node file
   */
  async deleteNode(labName: string, nodeId: string): Promise<boolean> {
    try {
      const labPath = getLabPath(labName)
      const filePath = getNodeFilePath(labPath, nodeId)
      
      await fs.unlink(filePath)
      
      // Also remove edges connected to this node
      const edges = await this.loadEdges(labName)
      const filteredEdges = edges.filter(
        edge => edge.source !== nodeId && edge.target !== nodeId
      )
      await this.saveEdges(labName, filteredEdges)
      
      // Update metadata updatedAt
      await this.updateMetadataTimestamp(labName)
      
      return true
    } catch (error) {
      console.error(`[worldLabService] Error deleting node ${nodeId} for Lab ${labName}:`, error)
      return false
    }
  },

  /**
   * Update metadata timestamp
   */
  async updateMetadataTimestamp(labName: string): Promise<void> {
    try {
      const metadata = await this.loadMetadata(labName)
      const updatedMetadata: WorldLabMetadata = {
        ...metadata,
        updatedAt: new Date().toISOString(),
      }
      
      const labPath = getLabPath(labName)
      const metadataPath = getMetadataPath(labPath)
      
      await fs.mkdir(labPath, { recursive: true })
      await fs.writeFile(metadataPath, JSON.stringify(updatedMetadata, null, 2), 'utf-8')
    } catch (error) {
      console.error(`[worldLabService] Error updating metadata timestamp for Lab ${labName}:`, error)
    }
  },

  /**
   * Save metadata
   */
  async saveMetadata(labName: string, metadata: WorldLabMetadata): Promise<boolean> {
    try {
      const labPath = getLabPath(labName)
      const metadataPath = getMetadataPath(labPath)
      
      await fs.mkdir(labPath, { recursive: true })
      
      const updatedMetadata: WorldLabMetadata = {
        ...metadata,
        updatedAt: new Date().toISOString(),
      }
      
      await fs.writeFile(metadataPath, JSON.stringify(updatedMetadata, null, 2), 'utf-8')
      
      return true
    } catch (error) {
      console.error(`[worldLabService] Error saving metadata for Lab ${labName}:`, error)
      return false
    }
  },

  /**
   * Check if a Lab exists
   */
  async labExists(labName: string): Promise<boolean> {
    try {
      const labPath = getLabPath(labName)
      await fs.access(labPath)
      return true
    } catch {
      return false
    }
  },

  /**
   * Get all Lab names
   */
  async getAllLabNames(): Promise<string[]> {
    try {
      await ensureLabsDir()
      const entries = await fs.readdir(LABS_DIR, { withFileTypes: true })
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
    } catch (error) {
      console.error('[worldLabService] Error getting all Lab names:', error)
      return []
    }
  },
}
