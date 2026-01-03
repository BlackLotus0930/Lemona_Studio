// Embedding Service - Generate embeddings using Gemini (preferred) or OpenAI
import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'

// Note: fetch is available in Node.js 18+ and Electron's Node.js runtime

// Embedding dimension for both providers
export const EMBEDDING_DIMENSION = 1536

// Cache for API clients to avoid recreating instances
const geminiClientCache: Map<string, GoogleGenerativeAI> = new Map()
const openaiClientCache: Map<string, OpenAI> = new Map()

/**
 * Get Gemini client instance (cached)
 */
function getGeminiClient(apiKey: string): GoogleGenerativeAI {
  if (!apiKey) {
    throw new Error('Gemini API key is not configured.')
  }
  
  if (!geminiClientCache.has(apiKey)) {
    geminiClientCache.set(apiKey, new GoogleGenerativeAI(apiKey))
  }
  
  return geminiClientCache.get(apiKey)!
}

/**
 * Get OpenAI client instance (cached)
 */
function getOpenAIClient(apiKey: string): OpenAI {
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured.')
  }
  
  if (!openaiClientCache.has(apiKey)) {
    openaiClientCache.set(apiKey, new OpenAI({ apiKey }))
  }
  
  return openaiClientCache.get(apiKey)!
}

/**
 * Generate embedding using Gemini API
 * Model: gemini-embedding-001 (1536 dimensions)
 * Uses output_dimensionality parameter to control embedding size
 */
async function generateGeminiEmbedding(
  text: string,
  apiKey: string
): Promise<number[]> {
  try {
    const genAI = getGeminiClient(apiKey)
    
    // Gemini embedding API uses REST endpoint
    // According to Google's API docs: https://ai.google.dev/gemini-api/docs/embeddings
    // Model: gemini-embedding-001
    // output_dimensionality: 1536 (recommended: 768, 1536, or 3072)
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: {
            parts: [{ text }],
          },
          // CRITICAL: Specify output_dimensionality to ensure 1536 dimensions
          // Default is 3072, but we need 1536 to match our index
          output_dimensionality: EMBEDDING_DIMENSION,
        }),
      }
    )
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gemini embedding API error: ${response.status} ${error}`)
    }
    
    const data = await response.json() as {
      embedding?: {
        values?: number[]
      }
    }
    const embedding = data.embedding?.values
    
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('Invalid embedding response from Gemini API')
    }
    
    if (embedding.length !== EMBEDDING_DIMENSION) {
      console.error(
        `[Embedding] Gemini embedding dimension mismatch: expected ${EMBEDDING_DIMENSION}, got ${embedding.length}. This may cause search failures.`
      )
      throw new Error(`Gemini embedding dimension mismatch: expected ${EMBEDDING_DIMENSION}, got ${embedding.length}`)
    }
    
    return embedding
  } catch (error: any) {
    console.error('[Embedding] Gemini embedding error:', error)
    throw new Error(`Failed to generate Gemini embedding: ${error.message}`)
  }
}

/**
 * Generate embedding using OpenAI API
 * Model: text-embedding-3-small (1536 dimensions)
 */
async function generateOpenAIEmbedding(
  text: string,
  apiKey: string
): Promise<number[]> {
  try {
    const client = getOpenAIClient(apiKey)
    
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    })
    
    const embedding = response.data[0]?.embedding
    
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('Invalid embedding response from OpenAI API')
    }
    
    if (embedding.length !== EMBEDDING_DIMENSION) {
      console.warn(
        `[Embedding] OpenAI embedding dimension mismatch: expected ${EMBEDDING_DIMENSION}, got ${embedding.length}`
      )
    }
    
    return embedding
  } catch (error: any) {
    console.error('[Embedding] OpenAI embedding error:', error)
    throw new Error(`Failed to generate OpenAI embedding: ${error.message}`)
  }
}

/**
 * Generate a single embedding
 * Prefers Gemini if available, falls back to OpenAI
 */
export async function generateEmbedding(
  text: string,
  geminiApiKey?: string,
  openaiApiKey?: string
): Promise<{ embedding: number[]; provider: 'gemini' | 'openai' }> {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty')
  }
  
  // Prefer Gemini if API key is available
  if (geminiApiKey && geminiApiKey.trim().length > 0) {
    try {
      const embedding = await generateGeminiEmbedding(text, geminiApiKey)
      return { embedding, provider: 'gemini' }
    } catch (error: any) {
      console.warn('[Embedding] Gemini embedding failed, trying OpenAI:', error.message)
      // Fall through to OpenAI
    }
  }
  
  // Fall back to OpenAI
  if (openaiApiKey && openaiApiKey.trim().length > 0) {
    const embedding = await generateOpenAIEmbedding(text, openaiApiKey)
    return { embedding, provider: 'openai' }
  }
  
  throw new Error('No embedding API key available. Please configure Gemini or OpenAI API key.')
}

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      
      // Check if it's a rate limit error
      const isRateLimit = error.message?.includes('rate limit') || 
                         error.message?.includes('429') ||
                         error.status === 429 ||
                         error.code === 'rate_limit_exceeded'
      
      // Check if it's a temporary error (network, timeout, etc.)
      const isTemporary = error.message?.includes('network') ||
                         error.message?.includes('timeout') ||
                         error.message?.includes('ECONNREFUSED') ||
                         error.code === 'ECONNREFUSED'
      
      // Only retry on rate limits or temporary errors
      if (!isRateLimit && !isTemporary) {
        throw error // Don't retry on permanent errors
      }
      
      if (attempt < maxRetries - 1) {
        // Exponential backoff: delay increases with each retry
        const delay = baseDelay * Math.pow(2, attempt)
        console.warn(`[Embedding] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay:`, error.message)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}

/**
 * Generate embeddings for multiple texts (batch)
 * Processes in batches to respect API rate limits
 * Includes retry logic for rate limits and temporary failures
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  geminiApiKey?: string,
  openaiApiKey?: string,
  batchSize: number = 10
): Promise<Array<{ embedding: number[]; provider: 'gemini' | 'openai' }>> {
  if (texts.length === 0) {
    return []
  }
  
  // Determine provider preference
  const useGemini = geminiApiKey && geminiApiKey.trim().length > 0
  const useOpenAI = openaiApiKey && openaiApiKey.trim().length > 0
  
  if (!useGemini && !useOpenAI) {
    throw new Error('No embedding API key available. Please configure Gemini or OpenAI API key.')
  }
  
  const results: Array<{ embedding: number[]; provider: 'gemini' | 'openai' }> = []
  
  // Process in batches
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    
    // Process batch in parallel with retry logic
    const batchPromises = batch.map(async (text, batchIndex) => {
      return retryWithBackoff(
        () => generateEmbedding(text, geminiApiKey, openaiApiKey),
        3, // max retries
        1000 // base delay 1 second
      ).catch((error: any) => {
        console.error(`[Embedding] Failed to generate embedding after retries for text at index ${i + batchIndex}:`, error.message)
        throw error
      })
    })
    
    try {
      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
    } catch (error: any) {
      // If batch fails, try processing items individually
      console.warn(`[Embedding] Batch failed, processing items individually:`, error.message)
      for (const text of batch) {
        try {
          const result = await retryWithBackoff(
            () => generateEmbedding(text, geminiApiKey, openaiApiKey),
            3,
            1000
          )
          results.push(result)
        } catch (itemError: any) {
          console.error(`[Embedding] Failed to generate embedding for individual item:`, itemError.message)
          // Continue with other items even if one fails
          // This allows partial success for large batches
        }
      }
    }
    
    // Small delay between batches to respect rate limits
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 200)) // Increased delay
    }
  }
  
  return results
}

/**
 * Estimate tokens in text (rough approximation)
 * Used for chunking: ~4 characters per token
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export const embeddingService = {
  generateEmbedding,
  generateEmbeddingsBatch,
  estimateTokens,
  EMBEDDING_DIMENSION,
}

