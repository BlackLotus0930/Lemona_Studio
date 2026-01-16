// Desktop WorldLab Service - Manages WorldLab files and structure
import { WorldLab, WorldLabNode, WorldLabEdge, WorldLabMetadata } from '../../../shared/types.js'
import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

// Use Electron's userData directory for WorldLab
// Structure: /worldlab/WorldLab(1).worldlab/nodes/..., edges.json, metadata.json
const WORLDLAB_DIR = path.join(app.getPath('userData'), 'worldlab')

console.log('Desktop WorldLab service initialized:')
console.log('  WORLDLAB_DIR:', WORLDLAB_DIR)

// Ensure worldlab directory exists
async function ensureWorldLabDir() {
  try {
    await fs.mkdir(WORLDLAB_DIR, { recursive: true })
  } catch (error) {
    console.error('Error creating worldlab directory:', error)
  }
}

// Initialize on import
ensureWorldLabDir()

/**
 * Get the path to a Lab directory (with .worldlab extension)
 * Lab name should be like "WorldLab(1)" and will be stored as "WorldLab(1).worldlab"
 */
function getLabPath(labName: string): string {
  // Ensure lab name has .worldlab extension
  const labFolderName = labName.endsWith('.worldlab') ? labName : `${labName}.worldlab`
  return path.join(WORLDLAB_DIR, labFolderName)
}

/**
 * Extract lab name from folder name (remove .worldlab extension if present)
 */
function extractLabName(folderName: string): string {
  if (folderName.endsWith('.worldlab')) {
    return folderName.slice(0, -10) // Remove .worldlab extension
  }
  return folderName
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

      // Load edges.json to get node positions and metadata (if stored there)
      let nodePositions: Map<string, { x: number; y: number }> = new Map()
      let nodeMetadata: Map<string, { label?: string; category?: string; elementName?: string }> = new Map()
      try {
        const edgesPath = getEdgesPath(labPath)
        const edgesContent = await fs.readFile(edgesPath, 'utf-8')
        const edgesData = JSON.parse(edgesContent)
        // Check if edges.json contains node positions
        if (edgesData.nodePositions && typeof edgesData.nodePositions === 'object') {
          Object.entries(edgesData.nodePositions).forEach(([nodeId, pos]: [string, any]) => {
            if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
              nodePositions.set(nodeId, { x: pos.x, y: pos.y })
            }
          })
        }
        // Check if edges.json contains node metadata
        if (edgesData.nodeMetadata && typeof edgesData.nodeMetadata === 'object') {
          Object.entries(edgesData.nodeMetadata).forEach(([nodeId, metadata]: [string, any]) => {
            if (metadata && typeof metadata === 'object') {
              nodeMetadata.set(nodeId, {
                label: typeof metadata.label === 'string' ? metadata.label : undefined,
                category: typeof metadata.category === 'string' ? metadata.category : undefined,
                elementName: typeof metadata.elementName === 'string' ? metadata.elementName : undefined,
              })
            }
          })
        }
      } catch {
        // edges.json doesn't exist or doesn't have positions/metadata, that's okay
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
          
          // Extract title/label from content (fallback if not in metadata)
          const defaultLabel = extractTitleFromMarkdown(content)
          
          // Get metadata from edges.json or use defaults
          const savedMetadata = nodeMetadata.get(nodeId)
          const label = savedMetadata?.label || defaultLabel
          const category = savedMetadata?.category
          const elementName = savedMetadata?.elementName
          
          // Get position from loaded positions or use default
          const savedPosition = nodePositions.get(nodeId)
          const position = savedPosition || { 
            x: Math.random() * 400 + 100, 
            y: Math.random() * 400 + 100 
          }
          
          nodes.push({
            id: nodeId,
            label,
            category,
            elementName,
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
   * edges.json may contain both edges array and nodePositions object
   */
  async loadEdges(labName: string): Promise<WorldLabEdge[]> {
    try {
      const labPath = getLabPath(labName)
      const edgesPath = getEdgesPath(labPath)
      
      try {
        const content = await fs.readFile(edgesPath, 'utf-8')
        const data = JSON.parse(content)
        
        // Handle both formats: array of edges, or object with edges array
        let edges: any[] = []
        if (Array.isArray(data)) {
          edges = data
        } else if (data.edges && Array.isArray(data.edges)) {
          edges = data.edges
        } else if (Array.isArray(data)) {
          edges = data
        }
        
        // Filter out nodePositions if it exists in the array (shouldn't happen, but just in case)
        edges = edges.filter(item => item && typeof item === 'object' && ('source' in item || 'target' in item))
        
        // Validate and return edges array
        return edges.map((edge: any, index: number) => ({
          id: edge.id || `edge_${index}`,
          source: edge.source,
          target: edge.target,
          type: edge.type || 'default',
          label: edge.label,
          animated: edge.animated || false,
          style: edge.style,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
        }))
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
   * Load a single node file content (raw markdown)
   */
  async loadNodeContent(labName: string, nodeId: string): Promise<string | null> {
    try {
      const labPath = getLabPath(labName)
      const filePath = getNodeFilePath(labPath, nodeId)
      
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        return content
      } catch {
        // File doesn't exist, return null
        return null
      }
    } catch (error) {
      console.error(`[worldLabService] Error loading node content ${nodeId} for Lab ${labName}:`, error)
      return null
    }
  },

  /**
   * Load metadata.json content as string
   */
  async loadMetadataContent(labName: string): Promise<string | null> {
    try {
      const labPath = getLabPath(labName)
      const metadataPath = getMetadataPath(labPath)
      
      try {
        const content = await fs.readFile(metadataPath, 'utf-8')
        return content
      } catch {
        // metadata.json doesn't exist, return default JSON
        return JSON.stringify({
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, null, 2)
      }
    } catch (error) {
      console.error(`[worldLabService] Error loading metadata content for Lab ${labName}:`, error)
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
   * Also optionally saves node positions and node metadata in the same file
   */
  async saveEdges(
    labName: string, 
    edges: WorldLabEdge[], 
    nodePositions?: Map<string, { x: number; y: number }>,
    nodeMetadata?: Map<string, { label?: string; category?: string; elementName?: string }>
  ): Promise<boolean> {
    try {
      const labPath = getLabPath(labName)
      const edgesPath = getEdgesPath(labPath)
      
      // Ensure Lab directory exists
      await fs.mkdir(labPath, { recursive: true })
      
      // Load existing edges.json to preserve any existing data
      let existingData: any = {}
      try {
        const existingContent = await fs.readFile(edgesPath, 'utf-8')
        existingData = JSON.parse(existingContent)
      } catch {
        // File doesn't exist, start fresh
      }
      
      // Prepare edges data - preserve structure
      const edgesData: any = {
        ...existingData,
        edges: edges,
      }
      
      // Add node positions if provided
      if (nodePositions && nodePositions.size > 0) {
        const positionsObj: Record<string, { x: number; y: number }> = {}
        nodePositions.forEach((pos, nodeId) => {
          positionsObj[nodeId] = pos
        })
        edgesData.nodePositions = positionsObj
      }
      
      // Add node metadata if provided
      if (nodeMetadata && nodeMetadata.size > 0) {
        const metadataObj: Record<string, { label?: string; category?: string; elementName?: string }> = {}
        nodeMetadata.forEach((meta, nodeId) => {
          metadataObj[nodeId] = meta
        })
        edgesData.nodeMetadata = metadataObj
      }
      
      await fs.writeFile(edgesPath, JSON.stringify(edgesData, null, 2), 'utf-8')
      
      // Update metadata updatedAt
      await this.updateMetadataTimestamp(labName)
      
      return true
    } catch (error) {
      console.error(`[worldLabService] Error saving edges for Lab ${labName}:`, error)
      return false
    }
  },

  /**
   * Save node positions and metadata (updates edges.json with positions and metadata)
   */
  async saveNodePositions(labName: string, nodes: WorldLabNode[]): Promise<boolean> {
    try {
      // Load existing edges
      const edges = await this.loadEdges(labName)
      
      // Create positions map
      const nodePositions = new Map<string, { x: number; y: number }>()
      nodes.forEach(node => {
        nodePositions.set(node.id, node.position)
      })
      
      // Create metadata map
      const nodeMetadata = new Map<string, { label?: string; category?: string; elementName?: string }>()
      nodes.forEach(node => {
        nodeMetadata.set(node.id, {
          label: node.label,
          category: node.category,
          elementName: node.elementName,
        })
      })
      
      // Save edges with positions and metadata
      return await this.saveEdges(labName, edges, nodePositions, nodeMetadata)
    } catch (error) {
      console.error(`[worldLabService] Error saving node positions for Lab ${labName}:`, error)
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
      
      // Write content as-is (empty string will show placeholder in editor)
      await fs.writeFile(filePath, content, 'utf-8')
      
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
      console.log(`[worldLabService] deleteNode called for lab: ${labName}, nodeId: ${nodeId}`)
      const labPath = getLabPath(labName)
      const filePath = getNodeFilePath(labPath, nodeId)
      console.log(`[worldLabService] deleteNode - labPath: ${labPath}`)
      console.log(`[worldLabService] deleteNode - filePath: ${filePath}`)
      
      // Check if file exists before attempting to delete
      let fileExists = false
      try {
        await fs.access(filePath)
        fileExists = true
        console.log(`[worldLabService] deleteNode - File exists, proceeding with deletion`)
      } catch (accessError) {
        console.warn(`[worldLabService] deleteNode - File does not exist or cannot be accessed: ${filePath}`, accessError)
        // File doesn't exist - this is okay, we'll treat it as already deleted
      }
      
      // Only try to delete if file exists
      if (fileExists) {
        try {
          await fs.unlink(filePath)
          console.log(`[worldLabService] deleteNode - Successfully deleted file: ${filePath}`)
        } catch (unlinkError: any) {
          // If file was deleted between access check and unlink, that's okay
          if (unlinkError?.code === 'ENOENT') {
            console.log(`[worldLabService] deleteNode - File was already deleted: ${filePath}`)
          } else {
            throw unlinkError // Re-throw if it's a different error
          }
        }
      } else {
        console.log(`[worldLabService] deleteNode - File does not exist, skipping deletion`)
      }
      
      // Also remove edges connected to this node (even if file didn't exist)
      console.log(`[worldLabService] deleteNode - Loading edges to remove connections`)
      const edges = await this.loadEdges(labName)
      console.log(`[worldLabService] deleteNode - Loaded ${edges.length} edges`)
      const filteredEdges = edges.filter(
        edge => edge.source !== nodeId && edge.target !== nodeId
      )
      console.log(`[worldLabService] deleteNode - Filtered to ${filteredEdges.length} edges (removed ${edges.length - filteredEdges.length} edges connected to node)`)
      await this.saveEdges(labName, filteredEdges)
      console.log(`[worldLabService] deleteNode - Saved filtered edges`)
      
      // Update metadata updatedAt
      console.log(`[worldLabService] deleteNode - Updating metadata timestamp`)
      await this.updateMetadataTimestamp(labName)
      console.log(`[worldLabService] deleteNode - Successfully completed deletion for node ${nodeId}`)
      
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
   * Get all Lab names (returns names without .worldlab extension)
   */
  async getAllLabNames(): Promise<string[]> {
    try {
      await ensureWorldLabDir()
      const entries = await fs.readdir(WORLDLAB_DIR, { withFileTypes: true })
      return entries
        .filter(entry => entry.isDirectory() && entry.name.endsWith('.worldlab'))
        .map(entry => extractLabName(entry.name))
    } catch (error) {
      console.error('[worldLabService] Error getting all Lab names:', error)
      return []
    }
  },
}
