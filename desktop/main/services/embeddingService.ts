// Embedding Service - Generate embeddings using Gemini (preferred) or OpenAI
import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'

// Note: fetch is available in Node.js 18+ and Electron's Node.js runtime

// Embedding dimension for both providers
export const EMBEDDING_DIMENSION = 1536

export interface EmbeddingProviderConfig {
  providerType: 'builtin-gemini' | 'builtin-openai' | 'custom-openai'
  model: string
  dimension: number
  apiKey?: string
  baseUrl?: string
}

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
function getOpenAIClient(apiKey: string, baseUrl?: string): OpenAI {
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured.')
  }

  const cacheKey = `${apiKey}::${baseUrl || ''}`
  if (!openaiClientCache.has(cacheKey)) {
    openaiClientCache.set(
      cacheKey,
      new OpenAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      })
    )
  }

  return openaiClientCache.get(cacheKey)!
}

/**
 * Generate embedding using Gemini API
 * Model: gemini-embedding-001 (1536 dimensions)
 * Uses output_dimensionality parameter to control embedding size
 */
async function generateGeminiEmbedding(
  text: string,
  apiKey: string,
  model: string = 'gemini-embedding-001',
  dimension: number = EMBEDDING_DIMENSION
): Promise<number[]> {
  try {
    const genAI = getGeminiClient(apiKey)
    
    // Gemini embedding API uses REST endpoint
    // According to Google's API docs: https://ai.google.dev/gemini-api/docs/embeddings
    // Model: gemini-embedding-001
    // output_dimensionality: 1536 (recommended: 768, 1536, or 3072)
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: `models/${model}`,
          content: {
            parts: [{ text }],
          },
          // CRITICAL: Specify output_dimensionality to ensure 1536 dimensions
          // Default is 3072, but we need 1536 to match our index
          output_dimensionality: dimension,
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
    
    if (embedding.length !== dimension) {
      console.error(
        `[Embedding] Gemini embedding dimension mismatch: expected ${dimension}, got ${embedding.length}. This may cause search failures.`
      )
      throw new Error(`Gemini embedding dimension mismatch: expected ${dimension}, got ${embedding.length}`)
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
  apiKey: string,
  model: string = 'text-embedding-3-small',
  dimension: number = EMBEDDING_DIMENSION,
  baseUrl?: string
): Promise<number[]> {
  try {
    const client = getOpenAIClient(apiKey, baseUrl)
    
    const response = await client.embeddings.create({
      model,
      input: text,
    })
    
    const embedding = response.data[0]?.embedding
    
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('Invalid embedding response from OpenAI API')
    }
    
    if (embedding.length !== dimension) {
      console.warn(
        `[Embedding] OpenAI embedding dimension mismatch: expected ${dimension}, got ${embedding.length}`
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
      // If it's a quota error, don't fallback - throw immediately
      if (isQuotaError(error)) {
        console.error('[Embedding] Gemini quota exceeded, stopping:', error.message)
        throw error
      }
      console.warn('[Embedding] Gemini embedding failed, trying OpenAI:', error.message)
      // Fall through to OpenAI for other errors
    }
  }
  
  // Fall back to OpenAI
  if (openaiApiKey && openaiApiKey.trim().length > 0) {
    try {
      const embedding = await generateOpenAIEmbedding(text, openaiApiKey)
      return { embedding, provider: 'openai' }
    } catch (error: any) {
      // If OpenAI also has quota error, throw it
      if (isQuotaError(error)) {
        console.error('[Embedding] OpenAI quota exceeded:', error.message)
        throw error
      }
      throw error
    }
  }
  
  throw new Error('No embedding API key available. Please configure Gemini or OpenAI API key.')
}

export async function generateEmbeddingWithConfig(
  text: string,
  config: EmbeddingProviderConfig,
  fallbackGeminiApiKey?: string,
  fallbackOpenaiApiKey?: string
): Promise<{ embedding: number[]; provider: 'gemini' | 'openai' | 'custom-openai' }> {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty')
  }

  const model = config.model || (config.providerType === 'builtin-gemini' ? 'gemini-embedding-001' : 'text-embedding-3-small')
  const dimension = config.dimension || EMBEDDING_DIMENSION

  if (config.providerType === 'builtin-gemini') {
    const apiKey = config.apiKey || fallbackGeminiApiKey
    if (!apiKey) throw new Error('Gemini API key is not configured.')
    const embedding = await generateGeminiEmbedding(text, apiKey, model, dimension)
    return { embedding, provider: 'gemini' }
  }

  if (config.providerType === 'builtin-openai') {
    const apiKey = config.apiKey || fallbackOpenaiApiKey
    if (!apiKey) throw new Error('OpenAI API key is not configured.')
    const embedding = await generateOpenAIEmbedding(text, apiKey, model, dimension)
    return { embedding, provider: 'openai' }
  }

  const customApiKey = config.apiKey || fallbackOpenaiApiKey
  if (!customApiKey) throw new Error('Custom OpenAI-compatible API key is not configured.')
  const embedding = await generateOpenAIEmbedding(text, customApiKey, model, dimension, config.baseUrl)
  return { embedding, provider: 'custom-openai' }
}

/**
 * Check if error is a quota/billing error (should not retry)
 * Exported for use in other services
 */
export function isQuotaError(error: any): boolean {
  const errorMsg = (error.message || '').toLowerCase()
  return errorMsg.includes('quota') ||
         errorMsg.includes('billing') ||
         errorMsg.includes('exceeded your current quota') ||
         errorMsg.includes('resource_exhausted') ||
         (error.status === 429 && errorMsg.includes('quota'))
}

/**
 * Check if error is a temporary rate limit (can retry)
 */
function isTemporaryRateLimit(error: any): boolean {
  const errorMsg = (error.message || '').toLowerCase()
  // Rate limit without quota/billing keywords might be temporary
  return (error.status === 429 || error.message?.includes('429')) &&
         !isQuotaError(error) &&
         !errorMsg.includes('quota') &&
         !errorMsg.includes('billing')
}

/**
 * Retry helper with exponential backoff
 * Does NOT retry on quota/billing errors (permanent errors)
 * For rate limit errors (RPM limits), waits 1 minute between retries
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
      
      // Check if it's a quota/billing error - DO NOT RETRY
      if (isQuotaError(error)) {
        console.error('[Embedding] Quota/billing error detected, stopping retries:', error.message)
        throw error // Immediately throw, don't retry
      }
      
      // Check if it's a temporary rate limit (429 but not quota exceeded)
      // These are RPM limits that reset every minute, so we wait 1 minute and retry
      const isRateLimit = isTemporaryRateLimit(error) ||
                         (error.status === 429 && !isQuotaError(error)) ||
                         error.message?.includes('rate limit') ||
                         error.code === 'rate_limit_exceeded'
      
      // Check if it's a temporary error (network, timeout, etc.)
      const isTemporary = error.message?.includes('network') ||
                         error.message?.includes('timeout') ||
                         error.message?.includes('ECONNREFUSED') ||
                         error.code === 'ECONNREFUSED'
      
      // Only retry on temporary rate limits or temporary errors
      if (!isRateLimit && !isTemporary) {
        throw error // Don't retry on permanent errors
      }
      
      if (attempt < maxRetries - 1) {
        // For rate limit errors (RPM limits), use fixed 1 minute delay
        // For other temporary errors, use exponential backoff
        const delay = isRateLimit ? 60000 : (baseDelay * Math.pow(2, attempt))
        const delaySeconds = Math.round(delay / 1000)
        
        if (isRateLimit) {
          console.warn(`[Embedding] Rate limit (RPM) detected, waiting ${delaySeconds} seconds before retry ${attempt + 1}/${maxRetries}:`, error.message)
        } else {
          console.warn(`[Embedding] Retry attempt ${attempt + 1}/${maxRetries} after ${delaySeconds}s delay:`, error.message)
        }
        
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
 * For rate limit errors (RPM), waits 1 minute between retries
 * Stops immediately on quota/billing errors
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
    // Increased max retries for rate limit errors (RPM limits reset every minute)
    const batchPromises = batch.map(async (text, batchIndex) => {
      return retryWithBackoff(
        () => generateEmbedding(text, geminiApiKey, openaiApiKey),
        10, // max retries (allows up to 10 minutes for rate limit recovery)
        1000 // base delay 1 second (for non-rate-limit errors)
      ).catch((error: any) => {
        // If quota error, throw immediately to stop batch processing
        if (isQuotaError(error)) {
          console.error(`[Embedding] Quota error detected, stopping batch processing:`, error.message)
          throw error
        }
        console.error(`[Embedding] Failed to generate embedding after retries for text at index ${i + batchIndex}:`, error.message)
        throw error
      })
    })
    
    try {
      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
    } catch (error: any) {
      // If it's a quota error, stop immediately - don't try individual processing
      if (isQuotaError(error)) {
        console.error('[Embedding] Quota error detected, stopping all batch processing:', error.message)
        throw error
      }
      
      // If batch fails, try processing items individually (only for non-quota errors)
      console.warn(`[Embedding] Batch failed, processing items individually:`, error.message)
      for (const text of batch) {
        try {
          const result = await retryWithBackoff(
            () => generateEmbedding(text, geminiApiKey, openaiApiKey),
            10, // max retries for rate limit recovery
            1000 // base delay
          )
          results.push(result)
        } catch (itemError: any) {
          // If quota error during individual processing, stop immediately
          if (isQuotaError(itemError)) {
            console.error('[Embedding] Quota error during individual processing, stopping:', itemError.message)
            throw itemError
          }
          console.error(`[Embedding] Failed to generate embedding for individual item:`, itemError.message)
          // Continue with other items even if one fails (only for non-quota errors)
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

export async function generateEmbeddingsBatchWithConfig(
  texts: string[],
  config: EmbeddingProviderConfig,
  fallbackGeminiApiKey?: string,
  fallbackOpenaiApiKey?: string,
  batchSize: number = 10
): Promise<Array<{ embedding: number[]; provider: 'gemini' | 'openai' | 'custom-openai' }>> {
  if (texts.length === 0) {
    return []
  }

  const results: Array<{ embedding: number[]; provider: 'gemini' | 'openai' | 'custom-openai' }> = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const batchPromises = batch.map(async (text, batchIndex) => {
      return retryWithBackoff(
        () => generateEmbeddingWithConfig(text, config, fallbackGeminiApiKey, fallbackOpenaiApiKey),
        10,
        1000
      ).catch((error: any) => {
        if (isQuotaError(error)) {
          console.error('[Embedding] Quota error detected, stopping batch processing:', error.message)
          throw error
        }
        console.error(`[Embedding] Failed embedding for text index ${i + batchIndex}:`, error.message)
        throw error
      })
    })

    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)

    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 200))
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
  generateEmbeddingWithConfig,
  generateEmbeddingsBatch,
  generateEmbeddingsBatchWithConfig,
  estimateTokens,
  EMBEDDING_DIMENSION,
  isQuotaError,
}

