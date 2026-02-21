import { useState, useRef, useEffect } from 'react'
import { AIChatMessage, ChatAttachment, Document, IndexingStatus, AgentProgressEvent } from '@shared/types'
import { aiApi, chatApi, documentApi, projectApi, settingsApi } from '../../services/api'
import { indexingApi, integrationApi, type IntegrationSource } from '../../services/desktop-api'
import { useAiSettings } from '../AISettings/AiSettingsContext'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import katex from 'katex'
import { useTheme } from '../../contexts/ThemeContext'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism'
// @ts-ignore
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
// @ts-ignore
import CropOriginalIcon from '@mui/icons-material/CropOriginal'
// @ts-ignore
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail'
// @ts-ignore
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
// @ts-ignore
import CloseIcon from '@mui/icons-material/Close'
// @ts-ignore
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
// @ts-ignore
import CheckIcon from '@mui/icons-material/Check'
// @ts-ignore
import EditIcon from '@mui/icons-material/Edit'
// @ts-ignore
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
// @ts-ignore
import AddIcon from '@mui/icons-material/Add'
// @ts-ignore
import AttachFileIcon from '@mui/icons-material/AttachFile'
// @ts-ignore
import FormatQuoteIcon from '@mui/icons-material/FormatQuote'
// @ts-ignore
import StopIcon from '@mui/icons-material/Stop'
// @ts-ignore
import FolderIcon from '@mui/icons-material/Folder'
// @ts-ignore
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'

type ChatMode = 'ask' | 'agent'

/** Format integration fileIds for display (e.g. GitHub, Notion) instead of "integrat..." */
function formatIntegrationFileIdForDisplay(fileId: string): string | null {
  if (!fileId.startsWith('integration:')) return null
  const parts = fileId.split(':')
  if (parts.length < 4) return null
  const sourceType = parts[1]?.toLowerCase()
  const itemId = parts.slice(3).join(':')
  const labels: Record<string, string> = { github: 'GitHub', notion: 'Notion', rss: 'RSS' }
  const label = labels[sourceType || ''] || sourceType
  if (!label || !itemId) return null
  if (sourceType === 'github' && itemId.includes(':')) {
    const idx = itemId.indexOf(':')
    const repo = itemId.slice(0, idx)
    const rest = itemId.slice(idx + 1)
    const typeAndPath = rest.indexOf(':') >= 0 ? rest.split(':') : [rest]
    const type = typeAndPath[0]
    const pathOrNum = typeAndPath.slice(1).join(':') || typeAndPath[0]
    if (repo && type === 'file') return `${label} (${repo}): ${pathOrNum}`
    if (repo && (type === 'issue' || type === 'pr' || type === 'pull_request_issue')) return `${label} (${repo}): #${pathOrNum}`
  }
  return `${label}: ${itemId.length > 40 ? itemId.slice(0, 40) + '…' : itemId}`
}

interface AgentActionPayload {
  actions?: Array<{
    actionId?: string
    type: 'create_file' | 'edit_file' | 'edit_block'
    fileName?: string
    targetDocumentId?: string
    targetBlockId?: string
    content: string
    oldContent?: string
    newContent?: string
  }>
}
type AgentAction = NonNullable<AgentActionPayload['actions']>[number]

interface AgentFileProposal {
  id: string
  actionId?: string
  messageId: string
  type: 'create_file' | 'edit_file' | 'edit_block'
  fileName: string
  content: string
  patchOldText?: string
  patchNewText?: string
  patchOccurrenceIndex?: number
  patchPrefixAnchor?: string
  patchSuffixAnchor?: string
  targetDocumentId?: string
  candidateTargets?: Array<{ documentId: string; title: string }>
  oldText: string
  status: 'pending' | 'needs_target' | 'accepted' | 'rejected' | 'error'
  error?: string
}

type MentionOption = {
  type: 'library' | 'file' | 'folder' | 'integration'
  id?: string
  name: string
  mentionToken?: string
  sourceType?: IntegrationSource['sourceType']
  folder?: string
  fileType?: 'pdf' | 'docx'
}

type ProjectFolderMention = {
  id: string
  fullPath: string
}

type AddToChatReference = {
  mentionToken: string
  fileName: string
  lineRange?: string
  selectedText: string
}

const AGENT_ACTION_BLOCK_NAME = 'lemona-actions'
const AGENT_LOCATE_BLOCK_NAME = 'lemona-block-locate'
const AGENT_PROMPT_PREFIX = `You are in AGENT MODE.

When the user asks to create or edit files, include exactly one fenced block:
\`\`\`${AGENT_ACTION_BLOCK_NAME}
{
  "actions": [
    { "type": "edit_block", "targetDocumentId": "doc_id", "targetBlockId": "blk_x", "fileName": "display-title", "oldContent": "existing text to replace", "newContent": "replacement" }
  ]
}
\`\`\`

Rules:
- edit_block: oldContent = text to replace (verbatim). newContent = improved text — you may add, split, or merge paragraphs within the block.
- If target blocks are provided, include targetBlockId and output at most one edit_block per targetBlockId.
- create_file: requires "fileName" and "content".
- edit_file: avoid unless rewriting an empty file.
- targetDocumentId from AVAILABLE_FILES. fileName is display-only for edits.
- newContent: match style and tone of original; keep prose as prose.
- REFERENCED_SNIPPETS: use selectedText as authoritative context for mentionToken.
- Explain outside the block. No extra keys.`

function formatTraceQuery(rawQuery: string | undefined, action?: string): string | null {
  if (!rawQuery) {
    return null
  }
  const query = rawQuery.trim()
  if (!query) {
    return null
  }

  let sanitized = query
  if (sanitized.startsWith('You are in AGENT MODE.')) {
    const userRequestMatch = sanitized.match(/User request:\s*([\s\S]*)$/i)
    sanitized = userRequestMatch?.[1]?.trim() || '[Agent instruction hidden]'
  }

  const maxLength = action === 'read' ? 120 : 200
  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, maxLength)}...`
  }
  return sanitized
}

function stripTimingText(input?: string): string | undefined {
  if (!input) return input
  return input
    .replace(/\(\s*\d+\s*ms\s*\)/gi, '')
    .replace(/\b\d+\s*ms\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}


const ONBOARDING_DOCUMENT_TITLE = 'Lemona'
const ONBOARDING_USER_MESSAGE = 'What can you do to help me?'
const PROJECT_FOLDERS_STORAGE_KEY = 'projectFolders'
const PROJECT_ROOT_FOLDER_META_KEY = 'projectRootFolderMeta'
const SUPPORTED_INTEGRATION_SOURCE_TYPES: IntegrationSource['sourceType'][] = [
  'github',
  'gitlab',
  'slack',
  'notion',
  'quickbooks',
  'hubspot',
  'linear',
  'stripe',
  'sentry',
  'posthog',
  'metabase',
  'db-schema',
]
const INTEGRATION_SOURCE_LABELS: Record<IntegrationSource['sourceType'], string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  slack: 'Slack',
  notion: 'Notion',
  quickbooks: 'QuickBooks',
  hubspot: 'HubSpot',
  linear: 'Linear',
  stripe: 'Stripe',
  sentry: 'Sentry',
  posthog: 'PostHog',
  metabase: 'Metabase',
  'db-schema': 'DB Schema',
  rss: 'RSS',
}

const parseIntegrationSourceMentions = (text: string): IntegrationSource['sourceType'][] => {
  if (!text || typeof text !== 'string') return []
  const mentionPattern = /(^|\s)@\s*("([^"]+)"|'([^']+)'|([^\s@]+))/g
  const found = new Set<IntegrationSource['sourceType']>()
  const matches = Array.from(text.matchAll(mentionPattern))
  for (const match of matches) {
    const rawMention = (match[3] || match[4] || match[5] || '').trim().toLowerCase().replace(/[.,:;!?]+$/, '')
    if (!rawMention) continue
    if (rawMention === 'integration') {
      for (const sourceType of SUPPORTED_INTEGRATION_SOURCE_TYPES) {
        found.add(sourceType)
      }
      continue
    }
    if (SUPPORTED_INTEGRATION_SOURCE_TYPES.includes(rawMention as IntegrationSource['sourceType'])) {
      found.add(rawMention as IntegrationSource['sourceType'])
    }
  }
  return Array.from(found)
}

const ONBOARDING_ASSISTANT_MESSAGE = [
  "Welcome to Lemona! I'm your writing copilot. I use semantic search to find the most relevant context from your project, keeping my suggestions grounded in your work. It's faster, more accurate, and more efficient than uploading full documents to AI models.",
  '',
  'Quick tips:',
  '- Upload PDFs to index them for search. DOCX files are editable and indexed when you press Ctrl+S.',
  '- Ctrl+S to save and index your written files ($0.02-0.15 per 1M tokens).',
  '- Use @ to mention a file for precise search.',
  '- Use one API key for the best AI experience.',
].join('\n')

interface ChatInterfaceProps {
  documentId?: string
  projectId?: string
  chatId: string
  documentContent?: string
  getRealtimeDocumentContent?: () => string | undefined
  isStreaming: boolean
  setIsStreaming: (streaming: boolean) => void
  onFirstMessage?: (message: string) => void
  initialInput?: string
  initialInputReferences?: AddToChatReference[]
  initialInputVersion?: number
  onInputSet?: () => void
}

export default function ChatInterface({ documentId, projectId, chatId, documentContent, getRealtimeDocumentContent, isStreaming, setIsStreaming, onFirstMessage, initialInput, initialInputReferences, initialInputVersion, onInputSet }: ChatInterfaceProps) {
  const { theme } = useTheme()
  const [messages, setMessages] = useState<AIChatMessage[]>([])
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set()) // Track expanded actions by messageId:action
  const [expandedReasoningChains, setExpandedReasoningChains] = useState<Set<string>>(new Set()) // Track expanded reasoning chain by message id
  const [showOriginalMessages, setShowOriginalMessages] = useState<Set<string>>(new Set()) // Track "show original" toggles by message id
  const [progressEventsByMessageId, setProgressEventsByMessageId] = useState<Record<string, AgentProgressEvent[]>>({})
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingMessageContent, setEditingMessageContent] = useState('')
  const [input, setInput] = useState(initialInput || '')
  const [pendingAddToChatReferences, setPendingAddToChatReferences] = useState<AddToChatReference[]>([])
  const lastAppliedInitialInputVersionRef = useRef(0)
  const [isLoading, setIsLoading] = useState(false)

  const upsertProgressEvent = (messageId: string, event: AgentProgressEvent) => {
    setProgressEventsByMessageId(prev => {
      const existing = prev[messageId] ? [...prev[messageId]] : []
      const index = existing.findIndex(item => item.stepId === event.stepId)
      if (index >= 0) {
        existing[index] = { ...existing[index], ...event }
      } else {
        existing.push(event)
      }
      return {
        ...prev,
        [messageId]: existing.slice(-20),
      }
    })
  }
  
  // Handle initial input from external source (e.g., "Add to Chat" from editor)
  useEffect(() => {
    const version = initialInputVersion ?? 0
    if (initialInput && version > lastAppliedInitialInputVersionRef.current) {
      lastAppliedInitialInputVersionRef.current = version
      const currentValue = textareaRef.current?.value ?? input
      const appendedInput = currentValue.trim().length > 0
        ? `${currentValue} ${initialInput}`
        : initialInput
      setInput(appendedInput)
      if (initialInputReferences && initialInputReferences.length > 0) {
        setPendingAddToChatReferences(prev => [...prev, ...initialInputReferences])
      }
      if (textareaRef.current) {
        textareaRef.current.value = appendedInput
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
        textareaRef.current.focus()
      }
      if (onInputSet) {
        onInputSet()
      }
    }
  }, [initialInput, initialInputReferences, initialInputVersion, input, onInputSet])
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [useWebSearch, setUseWebSearch] = useState(false)
  const BUILTIN_MODELS = ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gpt-4.1-nano', 'gpt-5-mini', 'gpt-5.2'] as const
  type BuiltinModel = (typeof BUILTIN_MODELS)[number]
  // Load saved model from localStorage, or use default
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      const savedModel = localStorage.getItem('aiChatSelectedModel')
      if (savedModel && BUILTIN_MODELS.includes(savedModel as BuiltinModel)) {
        return savedModel
      }
    } catch (error) {
      console.error('Failed to load saved model:', error)
    }
    return 'gemini-3-flash-preview'
  })
  const [selectedStyle, setSelectedStyle] = useState<'Normal' | 'Learning' | 'Concise' | 'Explanatory' | 'Formal'>('Concise')
  const [chatMode, setChatMode] = useState<ChatMode>(() => {
    try {
      const saved = localStorage.getItem('lemonaChatMode')
      return saved === 'agent' ? 'agent' : 'ask'
    } catch {
      return 'ask'
    }
  })
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [showStyleMenu, setShowStyleMenu] = useState(false)
  const [googleApiKey, setGoogleApiKey] = useState('')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [modalPosition, setModalPosition] = useState<{ top: number; left?: number; right?: number }>({ top: 0, left: 0 })
  const modelDropdownRef = useRef<HTMLDivElement>(null)
  const modelNameRef = useRef<HTMLButtonElement>(null)
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const plusButtonRef = useRef<HTMLButtonElement>(null)
  const styleMenuRef = useRef<HTMLDivElement>(null)
  const styleButtonRef = useRef<HTMLButtonElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const apiKeyInputRef = useRef<HTMLInputElement>(null)
  const hasNotifiedFirstMessage = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentAssistantMessageIdRef = useRef<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionOverlayRef = useRef<HTMLDivElement>(null)
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const unifiedContainerRef = useRef<HTMLDivElement>(null)
  const previousMessageCountRef = useRef<number>(0)
  const hasRestoredScrollRef = useRef<boolean>(false)
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isStreamCancelledRef = useRef<boolean>(false)
  const lastStreamingContentLengthRef = useRef<number>(0)
  const streamingScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [inputContainerWidth, setInputContainerWidth] = useState<number | null>(null)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [copiedCodeBlocks, setCopiedCodeBlocks] = useState<Set<string>>(new Set())
  const { state: aiProviderState, setActiveProviders } = useAiSettings()
  const activeChatProfile = (aiProviderState?.profiles || []).find(
    p => p.id === aiProviderState?.activeChatProviderId
  ) || null
  const effectiveProviderType = activeChatProfile?.type ?? 'builtin-gemini'
  const customChatProfiles = (aiProviderState?.profiles || []).filter(p => p.type === 'custom-openai')
  const hasGoogleKeyConfigured = !!googleApiKey?.trim()
  const hasOpenaiKeyConfigured = !!openaiApiKey?.trim()
  const shortModelLabel =
    selectedModel === 'gemini-3-flash-preview' ? 'Flash 3' :
    selectedModel === 'gemini-3-pro-preview' ? 'Pro 3' :
    selectedModel === 'gpt-4.1-nano' ? 'GPT-4.1 Nano' :
    selectedModel === 'gpt-5-mini' ? 'GPT-5 Mini' :
    selectedModel === 'gpt-5.2' ? 'GPT-5.2' :
    selectedModel
  // Store scroll positions per chat ID
  const scrollPositionsRef = useRef<Map<string, number>>(new Map())
  const previousChatIdRef = useRef<string | null>(null)
  const previousDocumentIdRef = useRef<string | null>(null)
  
  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState('')
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [libraryDocuments, setLibraryDocuments] = useState<Document[]>([])
  const [allDocuments, setAllDocuments] = useState<Document[]>([])
  const [integrationSources, setIntegrationSources] = useState<IntegrationSource[]>([])
  const [isLibraryIndexed, setIsLibraryIndexed] = useState<boolean>(false)
  const [libraryFileIndexingStatuses, setLibraryFileIndexingStatuses] = useState<Map<string, IndexingStatus | null>>(new Map())
  const [documentTitleCache, setDocumentTitleCache] = useState<Map<string, string>>(new Map()) // Cache for document titles
  const mentionStartIndexRef = useRef<number>(-1)
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const mentionDropdownRef = useRef<HTMLDivElement>(null)
  const userMessageEditTextareaRef = useRef<HTMLTextAreaElement>(null)
  const userMessageEditContainerRef = useRef<HTMLDivElement>(null)
  const assistantMessageEditTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [isInMentionMode, setIsInMentionMode] = useState(false)
  const [agentProposals, setAgentProposals] = useState<AgentFileProposal[]>([])

  const logAgent = (stage: string, details: Record<string, any> = {}) => {
    console.info('[AgentFlow]', stage, {
      chatId,
      documentId: documentId || null,
      ...details,
    })
  }

  const generateMessageId = () => {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return `msg_${globalThis.crypto.randomUUID()}`
    }
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  const extractTextFromTipTap = (contentString?: string): string => {
    if (!contentString) return ''
    try {
      const parsed = JSON.parse(contentString)
      const chunks: string[] = []
      const walk = (node: any) => {
        if (!node) return
        if (node.type === 'text' && typeof node.text === 'string') {
          chunks.push(node.text)
        }
        if (Array.isArray(node.content)) {
          node.content.forEach(walk)
          if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'blockquote' || node.type === 'listItem') {
            chunks.push('\n')
          }
        }
      }
      walk(parsed)
      return chunks.join('').replace(/\n{3,}/g, '\n\n').trim()
    } catch {
      return ''
    }
  }

  const plainTextToTipTap = (text: string): string => {
    const lines = text.replace(/\r\n/g, '\n').split('\n')
    const content = lines.map(line => ({
      type: 'paragraph',
      content: line.length > 0 ? [{ type: 'text', text: line }] : [],
    }))
    return JSON.stringify({ type: 'doc', content })
  }

  const normalizeFileName = (value: string): { full: string; base: string } => {
    const cleaned = value
      .trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .split(/[\\/]/)
      .pop() || ''
    const lower = cleaned.toLowerCase()
    const base = lower.replace(/\.[^/.]+$/, '')
    return { full: lower, base }
  }

  const extractMentionFileNames = (text: string): string[] => {
    const names: string[] = []

    // Supports Add-to-Chat references like: @File Name.md (12-20)
    const rangedRegex = /@([^\n@]+?) \(\d+-\d+\)(?=\s|$)/g
    let rangedMatch
    while ((rangedMatch = rangedRegex.exec(text)) !== null) {
      const value = rangedMatch[1]?.trim()
      if (value) names.push(value)
    }

    // Supports quoted mentions like: @"File Name.md"
    const quotedRegex = /@["']([^"']+)["']/g
    let quotedMatch
    while ((quotedMatch = quotedRegex.exec(text)) !== null) {
      const value = quotedMatch[1]?.trim()
      if (value) names.push(value)
    }

    // Supports simple mentions like: @file.md
    const simpleMatches = text.match(/@([^\s,;:!?()[\]{}]+)/g) || []
    names.push(...simpleMatches.map(token => token.slice(1)))

    return Array.from(new Set(names))
  }

  const buildInlineRangeReferencesFromInput = (userInput: string): AddToChatReference[] => {
    if (!userInput || !documentContent) return []
    const currentTitle = (allDocuments.find(doc => doc.id === documentId)?.title || '').trim()
    if (!currentTitle) return []

    const plainText = extractTextFromTipTap(documentContent)
    if (!plainText) return []
    const lines = plainText.replace(/\r\n/g, '\n').split('\n')

    const references: AddToChatReference[] = []
    const inlineRangeRegex = /@([^\n@]+?) \((\d+)-(\d+)\)(?=\s|$)/g
    let match
    while ((match = inlineRangeRegex.exec(userInput)) !== null) {
      const fileName = String(match[1] || '').trim()
      const start = Number(match[2])
      const end = Number(match[3])
      if (!fileName || !Number.isFinite(start) || !Number.isFinite(end)) continue
      if (start <= 0 || end < start) continue

      const normalizedRef = normalizeFileName(fileName)
      const normalizedCurrent = normalizeFileName(currentTitle)
      if (normalizedRef.full !== normalizedCurrent.full && normalizedRef.base !== normalizedCurrent.base) continue

      const selectedText = lines.slice(start - 1, end).join('\n').trim()
      if (!selectedText) continue

      references.push({
        mentionToken: `@${fileName} (${start}-${end})`,
        fileName,
        lineRange: `${start}-${end}`,
        selectedText,
      })
    }
    return references
  }

  const resolveAgentFileTargets = (
    requestedFileName: string,
    docs: Document[],
    userText: string
  ): { targetDocumentId?: string; candidateTargets?: Array<{ documentId: string; title: string }> } => {
    const mentionSet = new Set(extractMentionFileNames(userText).map(m => normalizeFileName(m).full))
    const normalizedRequest = normalizeFileName(requestedFileName)
    const requestTokens = normalizedRequest.base.split(/[^a-z0-9]+/i).filter(Boolean)

    const scored = docs.map((doc) => {
      const normalizedDoc = normalizeFileName(doc.title || '')
      let score = 0

      if (normalizedRequest.full === normalizedDoc.full) score = 120
      else if (normalizedRequest.full === normalizedDoc.base) score = 112
      else if (normalizedRequest.base === normalizedDoc.base) score = 106
      else if (normalizedRequest.base === normalizedDoc.full) score = 100
      else if (
        normalizedDoc.full.includes(normalizedRequest.full) ||
        normalizedRequest.full.includes(normalizedDoc.full) ||
        normalizedDoc.base.includes(normalizedRequest.base) ||
        normalizedRequest.base.includes(normalizedDoc.base)
      ) {
        score = 74
      } else if (requestTokens.length > 0) {
        const docTokens = normalizedDoc.base.split(/[^a-z0-9]+/i).filter(Boolean)
        const overlap = requestTokens.filter(token => docTokens.includes(token)).length
        if (overlap > 0) {
          score = 52 + Math.floor((overlap / Math.max(requestTokens.length, 1)) * 18)
        }
      }

      if (mentionSet.has(normalizedDoc.full) || mentionSet.has(normalizedDoc.base)) {
        score += 12
      }

      return { doc, score }
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score)

    if (scored.length === 0) return {}

    const topScore = scored[0].score
    const topCandidates = scored.filter(item => item.score >= Math.max(topScore - 6, 90))
    if (topCandidates.length === 1) {
      return { targetDocumentId: topCandidates[0].doc.id }
    }
    if (topCandidates.length > 1) {
      return {
        candidateTargets: topCandidates.slice(0, 6).map(item => ({
          documentId: item.doc.id,
          title: item.doc.title,
        })),
      }
    }

    const mediumCandidates = scored.filter(item => item.score >= 65).slice(0, 6)
    if (mediumCandidates.length === 1) {
      return { targetDocumentId: mediumCandidates[0].doc.id }
    }
    if (mediumCandidates.length > 1) {
      return {
        candidateTargets: mediumCandidates.map(item => ({
          documentId: item.doc.id,
          title: item.doc.title,
        })),
      }
    }

    return {}
  }

  const buildAgentAvailableFilesContext = (docs: Document[]): string => {
    if (!docs || docs.length === 0) return 'AVAILABLE_FILES:\n- (none)'
    const lines = docs.slice(0, 300).map((doc) => `- ${doc.id}: ${doc.title}`)
    return `AVAILABLE_FILES:\n${lines.join('\n')}`
  }

  const extractTextBlocksFromTipTap = (contentString?: string): Array<{ id: string; type: string; text: string }> => {
    if (!contentString) return []
    try {
      const parsed = JSON.parse(contentString)
      const blocks: Array<{ id: string; type: string; text: string }> = []
      let blockIndex = 0
      const walk = (node: any) => {
        if (!node) return
        if (Array.isArray(node)) {
          node.forEach(walk)
          return
        }
        if (node.type && Array.isArray(node.content) && (node.type === 'paragraph' || node.type === 'heading' || node.type === 'blockquote' || node.type === 'listItem')) {
          const textChunks: string[] = []
          const collectText = (child: any) => {
            if (!child) return
            if (child.type === 'text' && typeof child.text === 'string') {
              textChunks.push(child.text)
            }
            if (Array.isArray(child.content)) {
              child.content.forEach(collectText)
            }
          }
          node.content.forEach(collectText)
          const text = textChunks.join('').trim()
          if (text.length > 0) {
            blocks.push({ id: `blk_${blockIndex}`, type: node.type, text })
            blockIndex += 1
          }
        }
        if (Array.isArray(node.content)) {
          node.content.forEach(walk)
        }
      }
      walk(parsed)
      return blocks
    } catch {
      const plain = String(contentString || '').replace(/\r\n/g, '\n').trim()
      if (!plain) return []
      return plain
        .split(/\n{2,}/)
        .map(part => part.trim())
        .filter(Boolean)
        .slice(0, 240)
        .map((text, index) => ({ id: `blk_${index}`, type: 'paragraph', text }))
    }
  }

  const readAssistantContentFromStream = async (response: Response): Promise<string> => {
    const reader = response.body?.getReader()
    if (!reader) return ''
    const decoder = new TextDecoder()
    let content = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data?.chunk && !String(data.chunk).includes('__METADATA__')) {
            content += data.chunk
          }
        } catch {
          // Ignore malformed stream lines
        }
      }
    }
    return content
  }

  const parseLocatedBlockIds = (messageContent: string, validIds: Set<string>): string[] => {
    const blockRegex = new RegExp(`\`\`\`${AGENT_LOCATE_BLOCK_NAME}\\s*([\\s\\S]*?)\`\`\``, 'i')
    const match = messageContent.match(blockRegex)

    const validateIds = (ids: string[]): string[] =>
      ids.map(id => id.trim()).filter(id => validIds.has(id))

    if (!match) {
      // Fallback: extract all blk_X from plain text
      const fallbackMatches = messageContent.match(/\bblk_\d+\b/gi)
      if (!fallbackMatches) return []
      return validateIds([...new Set(fallbackMatches)])
    }

    try {
      const parsed = JSON.parse(match[1].trim())
      // Support new array format: { "targetBlockIds": ["blk_3", "blk_7"] }
      if (Array.isArray(parsed.targetBlockIds)) {
        const ids = validateIds(parsed.targetBlockIds)
        if (ids.length > 0) return ids
      }
      // Support legacy single format: { "targetBlockId": "blk_3" }
      if (parsed.targetBlockId) {
        const ids = validateIds([parsed.targetBlockId])
        if (ids.length > 0) return ids
      }
      return []
    } catch {
      // JSON parse failed — extract all blk_X from the fenced block content
      const fallbackMatches = match[1].match(/\bblk_\d+\b/gi)
      if (!fallbackMatches) return []
      return validateIds([...new Set(fallbackMatches)])
    }
  }

  const chooseBlockByHeuristic = (
    blocks: Array<{ id: string; type: string; text: string }>,
    userText: string
  ): string | null => {
    if (!blocks.length) return null
    const tokens = (userText || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 2)
    if (!tokens.length) {
      return blocks[0].id
    }
    const scored = blocks.map(block => {
      const blockLower = block.text.toLowerCase()
      const overlap = tokens.filter(token => blockLower.includes(token)).length
      const typeBonus = block.type === 'heading' ? 0.5 : 0
      return { id: block.id, score: overlap + typeBonus }
    })
    scored.sort((a, b) => b.score - a.score)
    if (scored[0].score <= 0) {
      return blocks[0].id
    }
    return scored[0].id
  }

  const extractPatchSegment = (
    oldText: string,
    newText: string
  ): {
    oldSegment: string
    newSegment: string
    occurrenceIndex: number
    prefixAnchor: string
    suffixAnchor: string
  } => {
    const oldValue = (oldText || '').replace(/\r\n/g, '\n')
    const newValue = (newText || '').replace(/\r\n/g, '\n')
    if (oldValue === newValue) {
      return { oldSegment: '', newSegment: '', occurrenceIndex: 0, prefixAnchor: '', suffixAnchor: '' }
    }

    let prefix = 0
    const minLen = Math.min(oldValue.length, newValue.length)
    while (prefix < minLen && oldValue[prefix] === newValue[prefix]) {
      prefix += 1
    }

    let suffix = 0
    const oldRemain = oldValue.length - prefix
    const newRemain = newValue.length - prefix
    const maxSuffix = Math.min(oldRemain, newRemain)
    while (
      suffix < maxSuffix &&
      oldValue[oldValue.length - 1 - suffix] === newValue[newValue.length - 1 - suffix]
    ) {
      suffix += 1
    }

    const oldSegment = oldValue.slice(prefix, oldValue.length - suffix)
    const newSegment = newValue.slice(prefix, newValue.length - suffix)
    const anchorWindow = 80
    const prefixAnchor = oldValue.slice(Math.max(0, prefix - anchorWindow), prefix)
    const suffixAnchor = oldValue.slice(oldValue.length - suffix, Math.min(oldValue.length, oldValue.length - suffix + anchorWindow))

    let occurrenceIndex = 0
    if (oldSegment.length > 0) {
      let searchFrom = 0
      while (true) {
        const idx = oldValue.indexOf(oldSegment, searchFrom)
        if (idx < 0 || idx >= prefix) break
        occurrenceIndex += 1
        searchFrom = idx + Math.max(1, oldSegment.length)
      }
    }

    return { oldSegment, newSegment, occurrenceIndex, prefixAnchor, suffixAnchor }
  }

  const applyPatchToPlainText = (
    sourceText: string,
    oldSegment: string,
    newSegment: string,
    occurrenceIndex: number = 0,
    prefixAnchor: string = '',
    suffixAnchor: string = ''
  ): { applied: boolean; text: string } => {
    const haystack = (sourceText || '').replace(/\r\n/g, '\n')
    const needle = (oldSegment || '').replace(/\r\n/g, '\n')
    const replacement = (newSegment || '').replace(/\r\n/g, '\n')
    if (needle === replacement) {
      return { applied: true, text: haystack }
    }

    if (needle.length === 0) {
      const insertAt = haystack.length
      return { applied: true, text: `${haystack.slice(0, insertAt)}${replacement}${haystack.slice(insertAt)}` }
    }

    const candidates: Array<{ index: number; score: number }> = []
    let searchFrom = 0
    while (true) {
      const idx = haystack.indexOf(needle, searchFrom)
      if (idx < 0) break
      const leftContext = haystack.slice(Math.max(0, idx - 120), idx)
      const rightContext = haystack.slice(idx + needle.length, Math.min(haystack.length, idx + needle.length + 120))
      let score = 0
      if (prefixAnchor && leftContext.endsWith(prefixAnchor.slice(-Math.min(40, prefixAnchor.length)))) {
        score += 2
      }
      if (suffixAnchor && rightContext.startsWith(suffixAnchor.slice(0, Math.min(40, suffixAnchor.length)))) {
        score += 2
      }
      candidates.push({ index: idx, score })
      searchFrom = idx + Math.max(1, needle.length)
    }

    if (candidates.length === 0) {
      return { applied: false, text: haystack }
    }

    const bestScore = Math.max(...candidates.map(c => c.score))
    const pool = bestScore > 0 ? candidates.filter(c => c.score === bestScore) : candidates
    const pick = Math.max(0, Math.min(occurrenceIndex, pool.length - 1))
    const start = pool[pick].index
    const end = start + needle.length
    return {
      applied: true,
      text: `${haystack.slice(0, start)}${replacement}${haystack.slice(end)}`,
    }
  }

  const actionSignature = (action: AgentAction): string => {
    return JSON.stringify({
      type: action.type,
      fileName: action.fileName || '',
      targetDocumentId: action.targetDocumentId || '',
      targetBlockId: action.targetBlockId || '',
      oldContent: action.oldContent || '',
      newContent: action.newContent || '',
      content: action.content || '',
    })
  }

  const hashString = (value: string): string => {
    let hash = 0
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
    }
    return Math.abs(hash).toString(36)
  }

  const proposalSemanticStatusKeyFromProposal = (proposal: AgentFileProposal): string => {
    return JSON.stringify({
      type: proposal.type,
      fileName: proposal.fileName || '',
      targetDocumentId: proposal.targetDocumentId || '',
      content: proposal.content || '',
      oldContent: proposal.patchOldText || '',
      newContent: proposal.patchNewText || '',
    })
  }

  const proposalStatusKeysFromProposal = (proposal: AgentFileProposal): string[] => {
    const keys: string[] = []
    if (proposal.actionId) {
      keys.push(`actionId:${proposal.actionId}`)
    }
    keys.push(`semantic:${proposalSemanticStatusKeyFromProposal(proposal)}`)
    return keys
  }

  const withStableActionIds = (actions: AgentAction[]): AgentAction[] => {
    return actions.map((action) => {
      const incoming = (action.actionId || '').trim()
      if (incoming) return action
      return {
        ...action,
        actionId: `action_${hashString(actionSignature(action))}`,
      }
    })
  }

  const editBlockTargetKey = (action: AgentAction): string | null => {
    if (action.type !== 'edit_block') return null
    const docKey = (action.targetDocumentId || '').trim().toLowerCase()
    const blockKey = (action.targetBlockId || '').trim().toLowerCase()
    const oldKey = (action.oldContent || '').replace(/\r\n/g, '\n').trim()
    const fallbackFile = (action.fileName || '').trim().toLowerCase()
    return blockKey
      ? `${docKey}::${blockKey}`
      : `${docKey || fallbackFile}::${oldKey}`
  }

  const dedupeEditBlocksByTarget = (actions: AgentAction[]): AgentAction[] => {
    const deduped: AgentAction[] = []
    const seenByKey = new Map<string, number>()

    for (const action of actions) {
      if (action.type !== 'edit_block') {
        deduped.push(action)
        continue
      }

      const identity = editBlockTargetKey(action) || ''

      const existingIndex = seenByKey.get(identity)
      if (existingIndex !== undefined) {
        // Keep the last action for the same target in this round.
        deduped[existingIndex] = action
      } else {
        seenByKey.set(identity, deduped.length)
        deduped.push(action)
      }
    }

    return deduped
  }

  const parseAllAgentActionBlocks = (messageContent: string): AgentActionPayload['actions'] => {
    const blockRegex = new RegExp(`\`\`\`${AGENT_ACTION_BLOCK_NAME}\\s*([\\s\\S]*?)\`\`\``, 'gi')
    const allActions: AgentActionPayload['actions'] = []
    const isValidAction = (action: any): action is AgentAction => {
      if (!action || typeof action !== 'object') return false
      if (action.type === 'create_file') {
        return typeof action.content === 'string' && typeof action.fileName === 'string' && action.fileName.trim().length > 0
      }
      if (action.type === 'edit_block') {
        return typeof action.oldContent === 'string' && typeof action.newContent === 'string' &&
          ((typeof action.targetDocumentId === 'string' && action.targetDocumentId.trim().length > 0) ||
           (typeof action.fileName === 'string' && action.fileName.trim().length > 0) ||
           (typeof action.targetBlockId === 'string' && action.targetBlockId.trim().length > 0))
      }
      if (action.type === 'edit_file') {
        return typeof action.content === 'string' &&
          ((typeof action.targetDocumentId === 'string' && action.targetDocumentId.trim().length > 0) ||
           (typeof action.fileName === 'string' && action.fileName.trim().length > 0))
      }
      return false
    }
    let match: RegExpExecArray | null
    let blocksScanned = 0
    while ((match = blockRegex.exec(messageContent)) !== null) {
      blocksScanned += 1
      if (blocksScanned > 24) {
        break // Guardrail: avoid pathological huge responses.
      }
      try {
        const parsed: AgentActionPayload = JSON.parse(match[1].trim())
        if (Array.isArray(parsed.actions)) {
          allActions.push(...parsed.actions.filter(isValidAction))
        }
      } catch (parseError) {
        console.warn('[ChatInterface] Invalid action JSON block; skipping unsafe fallback parse.', parseError)
      }
    }
    return dedupeEditBlocksByTarget(allActions)
  }

  const createProposalsFromActions = (
    actions: AgentAction[],
    messageId: string,
    docs: Document[],
    userContent: string
  ): AgentFileProposal[] => {
    const normalizedActions = withStableActionIds(actions)
    return normalizedActions.map((action) => {
      const stableActionId = (action.actionId || '').trim() || `action_${hashString(actionSignature(action))}`
      const proposalId = `proposal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      if (action.type === 'create_file') {
        const createFileName = typeof action.fileName === 'string' && action.fileName.trim()
          ? action.fileName
          : 'Untitled'
        return {
          id: proposalId,
          actionId: stableActionId,
          messageId,
          type: action.type,
          fileName: createFileName,
          content: action.content || '',
          oldText: '',
          status: 'pending',
        } as AgentFileProposal
      }
      const requestedId = (action.targetDocumentId || '').trim()
      const requestedFileName = (action.fileName || '').trim()
      if (action.type === 'edit_block' && !requestedId) {
        const resolved = requestedFileName ? resolveAgentFileTargets(requestedFileName, docs, userContent) : {}
        const candidates = resolved.targetDocumentId
          ? (() => {
              const doc = docs.find((item: Document) => item.id === resolved.targetDocumentId)
              return doc ? [{ documentId: doc.id, title: doc.title }] : []
            })()
          : (resolved.candidateTargets || [])
        return {
          id: proposalId,
          actionId: stableActionId,
          messageId,
          type: action.type,
          fileName: requestedFileName || 'Unknown file',
          content: action.newContent || action.content || '',
          oldText: '',
          candidateTargets: candidates.length > 0 ? candidates : undefined,
          status: 'needs_target',
          error: 'Missing targetDocumentId for edit_block. Select the intended file before applying this diff.',
        } as AgentFileProposal
      }
      let targetDoc: Document | undefined
      if (requestedId) {
        targetDoc = docs.find((doc: Document) => doc.id === requestedId)
      }
      if (!targetDoc && requestedFileName) {
        const resolved = resolveAgentFileTargets(requestedFileName, docs, userContent)
        if (resolved.targetDocumentId) {
          targetDoc = docs.find((doc: Document) => doc.id === resolved.targetDocumentId)
        }
        if (!targetDoc && resolved.candidateTargets && resolved.candidateTargets.length > 0) {
          return {
            id: proposalId,
            actionId: stableActionId,
            messageId,
            type: action.type,
            fileName: requestedFileName || 'Ambiguous file',
            content: action.content || '',
            oldText: '',
            candidateTargets: resolved.candidateTargets,
            status: 'needs_target',
            error: `Multiple possible files matched "${requestedFileName}". Select one.`,
          } as AgentFileProposal
        }
      }
      if (!targetDoc) {
        if (action.type === 'edit_block') {
          return {
            id: proposalId,
            actionId: stableActionId,
            messageId,
            type: action.type,
            fileName: requestedFileName || requestedId || 'Unknown file',
            content: action.newContent || action.content || '',
            oldText: '',
            status: 'needs_target',
            error: 'Target file is ambiguous or missing. Please choose the correct file before applying this diff.',
          } as AgentFileProposal
        }
        return {
          id: proposalId,
          actionId: stableActionId,
          messageId,
          type: action.type,
          fileName: requestedFileName || requestedId || 'Unknown file',
          content: action.content || '',
          oldText: '',
          status: 'error',
          error: `File not found: ${requestedFileName || requestedId}`,
        } as AgentFileProposal
      }
      const targetOldText = extractTextFromTipTap(targetDoc.content)
      const displayName = requestedFileName || (action.fileName && action.fileName.trim()) || targetDoc.title
      if (action.type === 'edit_block' && action.oldContent && action.newContent) {
        return {
          id: proposalId,
          actionId: stableActionId,
          messageId,
          type: 'edit_block',
          fileName: displayName,
          content: action.newContent,
          patchOldText: action.oldContent,
          patchNewText: action.newContent,
          patchOccurrenceIndex: 0,
          patchPrefixAnchor: '',
          patchSuffixAnchor: '',
          targetDocumentId: targetDoc.id,
          oldText: targetOldText,
          status: 'pending',
        } as AgentFileProposal
      }
      const patch = extractPatchSegment(targetOldText, action.content || '')
      return {
        id: proposalId,
        actionId: stableActionId,
        messageId,
        type: action.type,
        fileName: displayName,
        content: action.content || '',
        patchOldText: patch.oldSegment,
        patchNewText: patch.newSegment,
        patchOccurrenceIndex: patch.occurrenceIndex,
        patchPrefixAnchor: patch.prefixAnchor,
        patchSuffixAnchor: patch.suffixAnchor,
        targetDocumentId: targetDoc.id,
        oldText: targetOldText,
        status: 'pending',
      } as AgentFileProposal
    })
  }

  const persistProposalStatusesForMessage = async (
    messageId: string,
    proposals: AgentFileProposal[]
  ) => {
    if (!documentId || !chatId) return
    const message = messages.find(msg => msg.id === messageId && msg.role === 'assistant')
    if (!message) return

    const relatedProposals = proposals.filter(proposal => proposal.messageId === messageId)
    const nextStatuses: Record<string, 'accepted' | 'rejected'> = {}
    for (const proposal of relatedProposals) {
      if (proposal.status === 'accepted' || proposal.status === 'rejected') {
        for (const statusKey of proposalStatusKeysFromProposal(proposal)) {
          nextStatuses[statusKey] = proposal.status
        }
      }
    }

    const previousStatuses = message.reasoningMetadata?.agentActionStatuses || {}
    if (JSON.stringify(previousStatuses) === JSON.stringify(nextStatuses)) {
      return
    }

    const nextReasoningMetadata: AIChatMessage['reasoningMetadata'] = {
      ...(message.reasoningMetadata || {}),
      agentActionStatuses: nextStatuses,
    }

    await chatApi.updateMessage(
      documentId,
      chatId,
      messageId,
      message.content,
      nextReasoningMetadata
    )

    setMessages(prev => prev.map(msg =>
      msg.id === messageId
        ? { ...msg, reasoningMetadata: nextReasoningMetadata }
        : msg
    ))
  }

  const rejectAgentProposal = (proposalId: string) => {
    const proposal = agentProposals.find(item => item.id === proposalId)
    if (!proposal) return
    let nextProposals: AgentFileProposal[] = []
    setAgentProposals(prev => {
      nextProposals = prev.map(item =>
        item.id === proposalId ? { ...item, status: 'rejected' } : item
      )
      return nextProposals
    })
    void persistProposalStatusesForMessage(proposal.messageId, nextProposals)
    window.dispatchEvent(new CustomEvent('lemona:agent-diff-clear', { detail: { proposalId } }))
  }

  const selectAgentProposalTarget = async (proposalId: string, targetDocumentId: string) => {
    try {
      const proposal = agentProposals.find(p => p.id === proposalId)
      if (!proposal) return
      const targetDoc = await documentApi.get(targetDocumentId)
      if (!targetDoc) return

      const oldText = extractTextFromTipTap(targetDoc.content)
      const patch = extractPatchSegment(oldText, proposal.content)
      setAgentProposals(prev => prev.map(item => {
        if (item.id !== proposalId) return item
        return {
          ...item,
          targetDocumentId,
          candidateTargets: undefined,
          oldText,
          patchOldText: patch.oldSegment,
          patchNewText: patch.newSegment,
          patchOccurrenceIndex: patch.occurrenceIndex,
          patchPrefixAnchor: patch.prefixAnchor,
          patchSuffixAnchor: patch.suffixAnchor,
          status: 'pending',
          error: undefined,
        }
      }))

      window.dispatchEvent(new CustomEvent('lemona:agent-diff-preview', {
        detail: {
          proposalId,
          documentId: targetDocumentId,
          fileName: targetDoc.title,
          oldText,
          newText: proposal.content,
        }
      }))
    } catch (error) {
      console.warn('[ChatInterface] Failed to select proposal target:', error)
    }
  }

  const applyAgentProposal = async (proposalId: string) => {
    const proposal = agentProposals.find(item => item.id === proposalId)
    if (!proposal) return

    try {
      let awaitingPatchAck = false
      if (proposal.type === 'edit_block' && proposal.targetDocumentId && proposal.patchOldText !== undefined && proposal.patchNewText !== undefined) {
        // edit_block always uses patch path
        if (proposal.targetDocumentId === documentId) {
          logAgent('apply_edit_block_patch', {
            proposalId,
            targetDocumentId: proposal.targetDocumentId,
            oldChars: proposal.patchOldText.length,
            newChars: proposal.patchNewText.length,
          })
          window.dispatchEvent(new CustomEvent('lemona:agent-apply-editor-patch', {
            detail: {
              proposalId: proposal.id,
              documentId: proposal.targetDocumentId,
              oldText: proposal.patchOldText,
              newText: proposal.patchNewText,
              occurrenceIndex: proposal.patchOccurrenceIndex ?? 0,
              prefixAnchor: proposal.patchPrefixAnchor || '',
              suffixAnchor: proposal.patchSuffixAnchor || '',
            }
          }))
          awaitingPatchAck = true
        } else {
          // For non-current document, apply text replacement via API
          logAgent('apply_edit_block_api', { proposalId, targetDocumentId: proposal.targetDocumentId })
          const targetDoc = await documentApi.get(proposal.targetDocumentId)
          if (targetDoc) {
            const fullText = extractTextFromTipTap(targetDoc.content)
            const patched = applyPatchToPlainText(
              fullText,
              proposal.patchOldText,
              proposal.patchNewText,
              proposal.patchOccurrenceIndex ?? 0,
              proposal.patchPrefixAnchor || '',
              proposal.patchSuffixAnchor || ''
            )
            if (!patched.applied) {
              throw new Error('Patch target not found in target document. Please refresh and re-run this diff.')
            }
            await documentApi.update(proposal.targetDocumentId, plainTextToTipTap(patched.text))
          }
          window.dispatchEvent(new CustomEvent('lemona:documents-refresh-request', { detail: { projectId } }))
        }
      } else if (proposal.type === 'create_file') {
        logAgent('apply_create_file', { proposalId, fileName: proposal.fileName })
        const created = await documentApi.create(proposal.fileName, 'project')
        await documentApi.update(created.id, plainTextToTipTap(proposal.content))
        if (projectId) {
          await projectApi.addDocument(projectId, created.id)
        }
        window.dispatchEvent(new CustomEvent('lemona:documents-refresh-request', { detail: { projectId } }))
      } else if (proposal.targetDocumentId) {
        if (proposal.patchOldText !== undefined && proposal.patchNewText !== undefined) {
          if (proposal.targetDocumentId === documentId) {
            logAgent('apply_patch_dispatch', {
              proposalId,
              targetDocumentId: proposal.targetDocumentId,
              oldChars: proposal.patchOldText.length,
              newChars: proposal.patchNewText.length,
            })
            window.dispatchEvent(new CustomEvent('lemona:agent-apply-editor-patch', {
              detail: {
                proposalId: proposal.id,
                documentId: proposal.targetDocumentId,
                oldText: proposal.patchOldText,
                newText: proposal.patchNewText,
                occurrenceIndex: proposal.patchOccurrenceIndex ?? 0,
                prefixAnchor: proposal.patchPrefixAnchor || '',
                suffixAnchor: proposal.patchSuffixAnchor || '',
              }
            }))
            awaitingPatchAck = true
          } else {
            const targetDoc = await documentApi.get(proposal.targetDocumentId)
            if (!targetDoc) {
              throw new Error('Target document not found')
            }
            const fullText = extractTextFromTipTap(targetDoc.content)
            const patched = applyPatchToPlainText(
              fullText,
              proposal.patchOldText,
              proposal.patchNewText,
              proposal.patchOccurrenceIndex ?? 0,
              proposal.patchPrefixAnchor || '',
              proposal.patchSuffixAnchor || ''
            )
            if (!patched.applied) {
              throw new Error('Patch target not found in target document. Please refresh and re-run this diff.')
            }
            await documentApi.update(proposal.targetDocumentId, plainTextToTipTap(patched.text))
            window.dispatchEvent(new CustomEvent('lemona:documents-refresh-request', { detail: { projectId } }))
          }
        } else {
          logAgent('apply_full_update', { proposalId, targetDocumentId: proposal.targetDocumentId })
          await documentApi.update(proposal.targetDocumentId, plainTextToTipTap(proposal.content))
          if (proposal.targetDocumentId === documentId) {
            window.dispatchEvent(new CustomEvent('lemona:agent-apply-editor-content', {
              detail: {
                documentId: proposal.targetDocumentId,
                content: plainTextToTipTap(proposal.content),
              }
            }))
          }
          window.dispatchEvent(new CustomEvent('lemona:documents-refresh-request', { detail: { projectId } }))
        }
      } else {
        setAgentProposals(prev => prev.map(item =>
          item.id === proposalId ? { ...item, status: 'needs_target', error: 'Select a target file first' } : item
        ))
        return
      }

      if (awaitingPatchAck) {
        return
      }

      let acceptedProposals: AgentFileProposal[] = []
      setAgentProposals(prev => {
        acceptedProposals = prev.map(item =>
          item.id === proposalId ? { ...item, status: 'accepted' } : item
        )
        return acceptedProposals
      })
      void persistProposalStatusesForMessage(proposal.messageId, acceptedProposals)
      window.dispatchEvent(new CustomEvent('lemona:agent-diff-clear', { detail: { proposalId } }))
    } catch (error: any) {
      setAgentProposals(prev => prev.map(item =>
        item.id === proposalId ? { ...item, status: 'error', error: error?.message || 'Failed to apply action' } : item
      ))
    }
  }

  const handleUndoAllProposals = () => {
    const pendingIds = agentProposals
      .filter(proposal => proposal.status === 'pending' || proposal.status === 'needs_target')
      .map(proposal => proposal.id)

    if (pendingIds.length === 0) return
    let nextProposals: AgentFileProposal[] = []
    setAgentProposals(prev => {
      nextProposals = prev.map(proposal =>
        pendingIds.includes(proposal.id) ? { ...proposal, status: 'rejected' } : proposal
      )
      return nextProposals
    })
    const affectedMessageIds = Array.from(new Set(
      nextProposals
        .filter(proposal => pendingIds.includes(proposal.id))
        .map(proposal => proposal.messageId)
    ))
    for (const messageId of affectedMessageIds) {
      void persistProposalStatusesForMessage(messageId, nextProposals)
    }
    window.dispatchEvent(new CustomEvent('lemona:agent-diff-clear', { detail: {} }))
  }

  const handleKeepAllProposals = async () => {
    const pending = agentProposals.filter(proposal => proposal.status === 'pending')
    for (const proposal of pending) {
      await applyAgentProposal(proposal.id)
    }
  }

  // Dispatch preview for a proposal, collecting ALL pending edit_block patches for the same document
  const dispatchPreviewForProposal = (proposal: AgentFileProposal) => {
    if (!proposal.targetDocumentId) return
    // Never re-preview a non-pending proposal — the document has already changed
    if (proposal.status !== 'pending') return

    // Collect all pending edit_block patches for the same document
    const allDocPatches = agentProposals.filter(
      p => p.status === 'pending' && p.targetDocumentId === proposal.targetDocumentId &&
           p.type === 'edit_block' && p.patchOldText && p.patchNewText
    )

    if (allDocPatches.length > 0) {
      window.dispatchEvent(new CustomEvent('lemona:agent-diff-preview', {
        detail: {
          proposalId: allDocPatches[0].id,
          documentId: proposal.targetDocumentId,
          fileName: allDocPatches[0].fileName,
          oldText: allDocPatches[0].patchOldText,
          newText: allDocPatches[0].patchNewText,
          isPatch: true,
          patches: allDocPatches.map(p => ({
            proposalId: p.id,
            oldText: p.patchOldText!,
            newText: p.patchNewText!,
          })),
        }
      }))
    } else if (proposal.type !== 'edit_block') {
      // Fallback: single non-edit_block proposal (only if still pending)
      window.dispatchEvent(new CustomEvent('lemona:agent-diff-preview', {
        detail: {
          proposalId: proposal.id,
          documentId: proposal.targetDocumentId,
          fileName: proposal.fileName,
          oldText: proposal.oldText,
          newText: proposal.content,
        }
      }))
    }
  }

  const openAndFocusProposalDiff = (proposal: AgentFileProposal) => {
    if (!proposal.targetDocumentId) return
    // Only allow preview for pending proposals — accepted/rejected diffs are stale
    if (proposal.status !== 'pending') return
    const isPatchPreview = proposal.type === 'edit_block' && proposal.patchOldText !== undefined && proposal.patchNewText !== undefined
    const oldText = isPatchPreview ? (proposal.patchOldText || '') : proposal.oldText
    const newText = isPatchPreview ? (proposal.patchNewText || '') : proposal.content
    window.dispatchEvent(new CustomEvent('lemona:open-document-from-ai-diff', {
      detail: {
        proposalId: proposal.id,
        documentId: proposal.targetDocumentId,
        fileName: proposal.fileName,
        oldText,
        newText,
      }
    }))

    const fireFocus = () => {
      dispatchPreviewForProposal(proposal)
      window.dispatchEvent(new CustomEvent('lemona:agent-focus-diff', {
        detail: {
          proposalId: proposal.id,
          documentId: proposal.targetDocumentId,
          oldText,
          newText,
        }
      }))
    }
    fireFocus()
    window.setTimeout(fireFocus, 120)
    window.setTimeout(fireFocus, 360)
  }

  const buildOnboardingMessages = async (): Promise<AIChatMessage[] | null> => {
    if (!documentId || !projectId || chatId !== 'chat_default') return null

    const projects = await projectApi.getAll()
    if (!Array.isArray(projects) || projects.length !== 1) return null
    if (projects[0]?.id !== projectId) return null

    const projectDocuments = await projectApi.getDocuments(projectId)
    if (!Array.isArray(projectDocuments) || projectDocuments.length === 0) return null
    const workspaceDocs = projectDocuments.filter(doc => !doc.folder || doc.folder === 'project')
    if (workspaceDocs.length !== 1) return null
    const onlyDoc = workspaceDocs[0]
    if (!onlyDoc || onlyDoc.id !== documentId || onlyDoc.title !== ONBOARDING_DOCUMENT_TITLE) return null
    const now = new Date().toISOString()
    const userMessage: AIChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: ONBOARDING_USER_MESSAGE,
      timestamp: now,
    }
    const assistantMessage: AIChatMessage = {
      id: generateMessageId(),
      role: 'assistant',
      content: ONBOARDING_ASSISTANT_MESSAGE,
      timestamp: now,
      reasoningMetadata: {
        actions: {
          searched: {
            fileCount: 1,
            fileIds: [documentId],
          },
        },
      },
    }

    return [userMessage, assistantMessage]
  }
  
  // Load API keys and Smart indexing setting from localStorage on mount and sync to main process
  useEffect(() => {
    try {
      const googleKey = localStorage.getItem('googleApiKey') || undefined
      const openaiKey = localStorage.getItem('openaiApiKey') || undefined
      
      if (googleKey) {
        setGoogleApiKey(googleKey)
      }
      if (openaiKey) {
        setOpenaiApiKey(openaiKey)
      }
      
      // Sync keys to main process for auto-indexing
      if (googleKey || openaiKey) {
        settingsApi.saveApiKeys(googleKey, openaiKey).catch((error) => {
          console.error('Failed to sync API keys to main process:', error)
        })
      }
    } catch (error) {
      console.error('Failed to load API keys:', error)
    }
  }, [])

  // Save selected model to localStorage whenever it changes (user explicitly selects a model)
  useEffect(() => {
    try {
      localStorage.setItem('aiChatSelectedModel', selectedModel)
    } catch (error) {
      console.error('Failed to save selected model:', error)
    }
  }, [selectedModel])

  useEffect(() => {
    try {
      localStorage.setItem('lemonaChatMode', chatMode)
    } catch (error) {
      console.error('Failed to save chat mode:', error)
    }
  }, [chatMode])

  // Sync selectedModel when active chat provider changes - only when current model is incompatible
  useEffect(() => {
    if (!activeChatProfile) return
    if (activeChatProfile.type === 'custom-openai') {
      setSelectedModel(activeChatProfile.chatModel || 'gpt-4.1-nano')
    } else if (activeChatProfile.type === 'builtin-gemini' && selectedModel.startsWith('gpt-')) {
      setSelectedModel('gemini-3-flash-preview')
    } else if (activeChatProfile.type === 'builtin-openai' && (selectedModel.startsWith('gemini-') || !BUILTIN_MODELS.includes(selectedModel as BuiltinModel))) {
      setSelectedModel('gpt-4.1-nano')
    }
  }, [activeChatProfile?.id, activeChatProfile?.type, activeChatProfile?.chatModel, selectedModel])

  // Check if library is indexed for the current project
  const checkLibraryIndexStatus = async () => {
    if (!projectId) {
      setIsLibraryIndexed(false)
      return
    }
    try {
      const isValid = await indexingApi.isLibraryIndexed(projectId)
      setIsLibraryIndexed(isValid)
    } catch (error) {
      console.error('Failed to check library index status:', error)
      setIsLibraryIndexed(false)
    }
  }

  // Helper: PDF files indexed on upload (library index). DOCX is editable, indexed on Ctrl+S.
  const isUploadedFile = (doc: Document) => {
    const ext = (doc.title || '').toLowerCase().split('.').pop() || ''
    return ext === 'pdf'
  }

  // Load documents for @mention autocomplete
  const loadMentionDocuments = async () => {
    try {
      const docs = await documentApi.list()
      setAllDocuments(docs)
      
      // Filter to written/created files (non-uploaded) for workspace mentions
      // Uploaded files (PDF/DOCX) are shown separately in getFilteredMentions if indexed
      const mentionableDocs = docs.filter((doc: Document) => {
        if (isUploadedFile(doc)) return false
        
        if (projectId && doc.projectId === projectId && doc.folder !== 'worldlab') {
          return true
        }
        
        return false
      })
      
      setLibraryDocuments(mentionableDocs)
    } catch (error) {
      console.error('Failed to load documents for mentions:', error)
      setLibraryDocuments([])
    }
  }

  const loadIntegrationMentionSources = async () => {
    if (!projectId) {
      setIntegrationSources([])
      return
    }
    try {
      const sources = await integrationApi.getSources(projectId)
      setIntegrationSources(Array.isArray(sources) ? sources : [])
    } catch (error) {
      console.error('Failed to load integration sources for mentions:', error)
      setIntegrationSources([])
    }
  }

  // Fetch indexing statuses for uploaded files (PDF, DOCX)
  useEffect(() => {
    const libraryDocs = allDocuments.filter(doc => {
      const ext = (doc.title || '').toLowerCase().split('.').pop() || ''
      return ext === 'pdf' && projectId && doc.projectId === projectId && doc.folder !== 'worldlab'
    })
    if (libraryDocs.length === 0) {
      setLibraryFileIndexingStatuses(new Map())
      return
    }

    let isMounted = true

    const fetchStatuses = async () => {
      const promises = libraryDocs.map(async (doc) => {
        try {
          const status = await indexingApi.getIndexingStatus(doc.id)
          return { docId: doc.id, status }
        } catch (error) {
          console.error(`Failed to get indexing status for ${doc.id}:`, error)
          return { docId: doc.id, status: null }
        }
      })

      const results = await Promise.all(promises)
      if (isMounted) {
        const newStatusMap = new Map<string, IndexingStatus | null>()
        results.forEach(({ docId, status }) => {
          newStatusMap.set(docId, status)
        })
        setLibraryFileIndexingStatuses(newStatusMap)
      }
    }

    fetchStatuses()

    return () => {
      isMounted = false
    }
  }, [allDocuments, projectId])

  // Load documents and check library index status when projectId changes
  useEffect(() => {
    if (projectId) {
      loadMentionDocuments()
      loadIntegrationMentionSources()
      checkLibraryIndexStatus()
    } else {
      setLibraryDocuments([])
      setIntegrationSources([])
      setIsLibraryIndexed(false)
    }
  }, [projectId])

  // Reload documents and check library index status when dropdown opens to ensure we have the latest files
  useEffect(() => {
    if (showMentionDropdown && projectId) {
      loadMentionDocuments()
      loadIntegrationMentionSources()
      checkLibraryIndexStatus()
    }
  }, [showMentionDropdown, projectId])

  // Auto-scroll selected mention item into view when selection changes
  useEffect(() => {
    if (!showMentionDropdown || !mentionDropdownRef.current) return

    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      if (!mentionDropdownRef.current) return
      
      const selectedElement = mentionDropdownRef.current.querySelector(`[data-mention-index="${selectedMentionIndex}"]`) as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    })
  }, [selectedMentionIndex, showMentionDropdown])

  // Auto-adjust textarea height when input changes (handles programmatic updates like mention insertion)
  useEffect(() => {
    if (!textareaRef.current) return

    // Use requestAnimationFrame to ensure DOM has updated with new input value
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      
      // Sync textarea value with React state (in case they're out of sync)
      if (textareaRef.current.value !== input) {
        textareaRef.current.value = input
      }
      
      // Auto-adjust height
      textareaRef.current.style.height = 'auto'
      const scrollHeight = textareaRef.current.scrollHeight
      const newHeight = Math.min(scrollHeight, 200)
      textareaRef.current.style.height = `${newHeight}px`
      // Only show scrollbar when content exceeds maxHeight
      if (scrollHeight > 200) {
        textareaRef.current.style.overflowY = 'auto'
      } else {
        textareaRef.current.style.overflowY = 'hidden'
      }
    })
  }, [input])


  // Save Google API key to localStorage and main process
  const handleApiKeyChange = async (value: string) => {
    // Check if API key is being added (was empty, now has value)
    const hadKeyBefore = (googleApiKey && googleApiKey.trim().length > 0) ||
                         (openaiApiKey && openaiApiKey.trim().length > 0)
    
    setGoogleApiKey(value)
    try {
      if (value) {
        localStorage.setItem('googleApiKey', value)
      } else {
        localStorage.removeItem('googleApiKey')
      }
      // Also save to main process for auto-indexing (save both keys together)
      try {
        const currentOpenaiKey = localStorage.getItem('openaiApiKey') || undefined
        await settingsApi.saveApiKeys(value || undefined, currentOpenaiKey)
        
        // If API key was just added (was empty, now has value) and we have a projectId,
        // trigger indexing for the current project (only if Smart indexing is enabled)
        const hasKeyNow = (value && value.trim().length > 0) ||
                         (currentOpenaiKey && currentOpenaiKey.trim().length > 0)
        
        if (!hadKeyBefore && hasKeyNow && projectId) {
          console.log(`[Auto-Indexing] API key was just added in project ${projectId}, starting PDF indexing...`)
          indexingApi.indexProjectLibraryFiles(
            projectId,
            value || undefined,
            currentOpenaiKey,
            true // onlyUnindexed = true
          ).then((results: Array<{ documentId: string; status: IndexingStatus }>) => {
            const successCount = results.filter((r: { documentId: string; status: IndexingStatus }) => r.status.status === 'completed').length
            const errorCount = results.filter((r: { documentId: string; status: IndexingStatus }) => r.status.status === 'error').length
            if (successCount > 0 || errorCount > 0) {
              console.log(`[Auto-Indexing] Completed indexing for project ${projectId}: ${successCount} succeeded, ${errorCount} errors`)
            }
          }).catch((error) => {
            console.warn(`[Auto-Indexing] Failed to index project ${projectId}:`, error)
          })
        }
      } catch (error) {
        console.error('Failed to save Google API key to main process:', error)
      }
    } catch (error) {
      console.error('Failed to save Google API key:', error)
    }
  }

  // Save OpenAI API key to localStorage and main process
  const handleOpenaiApiKeyChange = async (value: string) => {
    // Check if API key is being added (was empty, now has value)
    const hadKeyBefore = (googleApiKey && googleApiKey.trim().length > 0) ||
                         (openaiApiKey && openaiApiKey.trim().length > 0)
    
    setOpenaiApiKey(value)
    try {
      if (value) {
        localStorage.setItem('openaiApiKey', value)
      } else {
        localStorage.removeItem('openaiApiKey')
      }
      // Also save to main process for auto-indexing (save both keys together)
      try {
        const currentGoogleKey = localStorage.getItem('googleApiKey') || undefined
        await settingsApi.saveApiKeys(currentGoogleKey, value || undefined)
        
        // If API key was just added (was empty, now has value) and we have a projectId,
        // trigger indexing for the current project (only if Smart indexing is enabled)
        const hasKeyNow = (currentGoogleKey && currentGoogleKey.trim().length > 0) ||
                         (value && value.trim().length > 0)
        
        if (!hadKeyBefore && hasKeyNow && projectId) {
          console.log(`[Auto-Indexing] API key was just added in project ${projectId}, starting PDF indexing...`)
          indexingApi.indexProjectLibraryFiles(
            projectId,
            currentGoogleKey,
            value || undefined,
            true // onlyUnindexed = true
          ).then((results: Array<{ documentId: string; status: IndexingStatus }>) => {
            const successCount = results.filter((r: { documentId: string; status: IndexingStatus }) => r.status.status === 'completed').length
            const errorCount = results.filter((r: { documentId: string; status: IndexingStatus }) => r.status.status === 'error').length
            if (successCount > 0 || errorCount > 0) {
              console.log(`[Auto-Indexing] Completed indexing for project ${projectId}: ${successCount} succeeded, ${errorCount} errors`)
            }
          }).catch((error) => {
            console.warn(`[Auto-Indexing] Failed to index project ${projectId}:`, error)
          })
        }
      } catch (error) {
        console.error('Failed to save OpenAI API key to main process:', error)
      }
    } catch (error) {
      console.error('Failed to save OpenAI API key:', error)
    }
  }

  // Update modal position when opening
  useEffect(() => {
    if (showSettingsModal && modelNameRef.current) {
      const updatePosition = () => {
        if (modelNameRef.current) {
          const rect = modelNameRef.current.getBoundingClientRect()
          const viewportWidth = window.innerWidth
          
          // Align modal's right edge with the model button's right edge (same as model dropdown)
          // Model dropdown uses right: 0 (relative to its parent), which aligns with rect.right
          // For fixed positioning, calculate right offset from viewport right edge
          const rightOffset = viewportWidth - rect.right
          
          // Position modal above the model name
          setModalPosition({
            top: rect.top - 8, // 8px above the model name
            left: undefined, // Will use right instead
            right: rightOffset, // Align right edge with model button's right edge
          })
        }
      }
      updatePosition()
      window.addEventListener('resize', updatePosition)
      return () => window.removeEventListener('resize', updatePosition)
    }
  }, [showSettingsModal])

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      
      if (showSettingsModal) {
        // Close modal if clicking anywhere outside the modal itself
        if (modalRef.current && !modalRef.current.contains(target)) {
          setShowSettingsModal(false)
        }
      }
      
      if (showModelDropdown) {
        if (
          modelDropdownRef.current &&
          !modelDropdownRef.current.contains(target) &&
          modelNameRef.current &&
          !modelNameRef.current.contains(target)
        ) {
          setShowModelDropdown(false)
        }
      }
      
      if (showPlusMenu) {
        // Close plus menu if clicking anywhere outside the menu, button, and style submenu
        const isInPlusMenu = plusMenuRef.current?.contains(target)
        const isInPlusButton = plusButtonRef.current?.contains(target)
        const isInStyleMenu = styleMenuRef.current?.contains(target)
        const isInStyleButton = styleButtonRef.current?.contains(target)
        
        if (
          !isInPlusMenu &&
          !isInPlusButton &&
          !isInStyleMenu &&
          !isInStyleButton
        ) {
          setShowPlusMenu(false)
          setShowStyleMenu(false)
        }
      }
      
      if (showStyleMenu && showPlusMenu) {
        // Only handle style menu closing if plus menu is also open
        const isInStyleMenu = styleMenuRef.current?.contains(target)
        const isInStyleButton = styleButtonRef.current?.contains(target)
        
        if (!isInStyleMenu && !isInStyleButton) {
          setShowStyleMenu(false)
        }
      }
    }

    if (showSettingsModal || showModelDropdown || showPlusMenu || showStyleMenu) {
      // Use capture phase to catch clicks before they bubble
      document.addEventListener('mousedown', handleClickOutside, true)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true)
      }
    }
  }, [showSettingsModal, showModelDropdown, showPlusMenu, showStyleMenu])
  
  const bgColor = theme === 'dark' ? '#141414' : '#FBFBFB'
  const brighterBg = theme === 'dark' ? '#141414' : '#FAFAFA'

  // Removed scroll position saving/loading - AI panel should maintain consistent state across files
  const inputBg = theme === 'dark' ? '#1d1d1d' : '#FEFEFE'
  const borderColor = theme === 'dark' ? '#232323' : '#E8EAED'
  const textColor = theme === 'dark' ? '#D6D6DD' : '#202124'
  const secondaryTextColor = theme === 'dark' ? '#858585' : '#9aa0a6'
  const userMessageBg = theme === 'dark' ? '#1E1E1E' : '#f0f0ed'

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior })
  }

  // Save scroll position when leaving a chat
  useEffect(() => {
    if (!documentId || !chatId || !scrollContainerRef.current) return

    // Save scroll position of previous chat before switching
    if (previousChatIdRef.current && previousChatIdRef.current !== chatId && scrollContainerRef.current) {
      const scrollTop = scrollContainerRef.current.scrollTop
      scrollPositionsRef.current.set(previousChatIdRef.current, scrollTop)
    }

    // Reset state for new chat
    hasRestoredScrollRef.current = false
    previousMessageCountRef.current = 0

    // Update previous chat ID
    previousChatIdRef.current = chatId
    
    // Mark as restored after a delay (scroll will be restored after messages load)
    setTimeout(() => {
      hasRestoredScrollRef.current = true
    }, 150)
    
    // Cleanup: save scroll position when component unmounts or documentId changes
    return () => {
      if (previousChatIdRef.current && scrollContainerRef.current) {
        const scrollTop = scrollContainerRef.current.scrollTop
        scrollPositionsRef.current.set(previousChatIdRef.current, scrollTop)
      }
    }
  }, [documentId, chatId])

  // Auto-scroll to bottom only when new messages are added (not on initial load)
  useEffect(() => {
    if (!hasRestoredScrollRef.current || !scrollContainerRef.current) return

    const currentMessageCount = messages.length
    const previousMessageCount = previousMessageCountRef.current

    // Only auto-scroll if a new message was actually added
    if (currentMessageCount > previousMessageCount && currentMessageCount > 0) {
      // Only auto-scroll if we're near the bottom (within 100px)
      // This prevents auto-scrolling when user is reading older messages
      const container = scrollContainerRef.current
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
      if (isNearBottom) {
        scrollToBottom('smooth')
      }
    }

    previousMessageCountRef.current = currentMessageCount
  }, [messages])

  // Auto-scroll during streaming (ChatGPT-like experience)
  useEffect(() => {
    if (!hasRestoredScrollRef.current || !scrollContainerRef.current || !isStreaming) {
      // Reset tracking when not streaming
      if (!isStreaming) {
        lastStreamingContentLengthRef.current = 0
      }
      return
    }

    const container = scrollContainerRef.current
    const lastMessage = messages[messages.length - 1]
    
    // Only auto-scroll if the last message is from assistant and we're streaming
    if (lastMessage && lastMessage.role === 'assistant') {
      const currentContentLength = lastMessage.content.length
      
      // Only scroll if content actually changed
      if (currentContentLength !== lastStreamingContentLengthRef.current) {
        lastStreamingContentLengthRef.current = currentContentLength
        
        // Check if user is near the bottom (within 200px for streaming)
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200
        
        if (isNearBottom) {
          // Clear any pending scroll
          if (streamingScrollTimeoutRef.current) {
            clearTimeout(streamingScrollTimeoutRef.current)
          }
          
          // Debounce scroll slightly for smoother performance during rapid updates
          streamingScrollTimeoutRef.current = setTimeout(() => {
            scrollToBottom('auto')
          }, 50) // Small debounce for performance
        }
      }
    }
    
    return () => {
      if (streamingScrollTimeoutRef.current) {
        clearTimeout(streamingScrollTimeoutRef.current)
      }
    }
  }, [messages, isStreaming])

  useEffect(() => {
    const handleAccept = (event: Event) => {
      const customEvent = event as CustomEvent<{ proposalId?: string }>
      if (customEvent.detail?.proposalId) {
        void applyAgentProposal(customEvent.detail.proposalId)
      }
    }

    const handleReject = (event: Event) => {
      const customEvent = event as CustomEvent<{ proposalId?: string }>
      if (customEvent.detail?.proposalId) {
        rejectAgentProposal(customEvent.detail.proposalId)
      }
    }

    const handlePatchApplied = (event: Event) => {
      const customEvent = event as CustomEvent<{ proposalId?: string }>
      const proposalId = customEvent.detail?.proposalId
      if (!proposalId) return
      logAgent('patch_applied', { proposalId })
      const proposal = agentProposals.find(item => item.id === proposalId)
      let nextProposals: AgentFileProposal[] = []
      setAgentProposals(prev => {
        nextProposals = prev.map(item =>
          item.id === proposalId ? { ...item, status: 'accepted', error: undefined } : item
        )
        return nextProposals
      })
      if (proposal) {
        void persistProposalStatusesForMessage(proposal.messageId, nextProposals)
      }
      window.dispatchEvent(new CustomEvent('lemona:agent-diff-clear', { detail: { proposalId } }))
    }

    const handlePatchFailed = (event: Event) => {
      const customEvent = event as CustomEvent<{ proposalId?: string; message?: string }>
      const proposalId = customEvent.detail?.proposalId
      if (!proposalId) return
      console.warn('[AgentFlow] patch_failed', {
        chatId,
        documentId: documentId || null,
        proposalId,
        message: customEvent.detail?.message || 'Patch failed. Please refine the request.',
      })
      setAgentProposals(prev => prev.map(item =>
        item.id === proposalId
          ? { ...item, status: 'error', error: customEvent.detail?.message || 'Patch failed. Please refine the request.' }
          : item
      ))
      window.dispatchEvent(new CustomEvent('lemona:agent-diff-clear', { detail: { proposalId } }))
    }

    window.addEventListener('lemona:agent-diff-accept', handleAccept as EventListener)
    window.addEventListener('lemona:agent-diff-reject', handleReject as EventListener)
    window.addEventListener('lemona:agent-patch-applied', handlePatchApplied as EventListener)
    window.addEventListener('lemona:agent-patch-failed', handlePatchFailed as EventListener)
    return () => {
      window.removeEventListener('lemona:agent-diff-accept', handleAccept as EventListener)
      window.removeEventListener('lemona:agent-diff-reject', handleReject as EventListener)
      window.removeEventListener('lemona:agent-patch-applied', handlePatchApplied as EventListener)
      window.removeEventListener('lemona:agent-patch-failed', handlePatchFailed as EventListener)
    }
  }, [agentProposals, documentId, projectId])

  useEffect(() => {
    if (!documentId) return
    const currentDocProposal = agentProposals.find(proposal =>
      proposal.status === 'pending' &&
      proposal.targetDocumentId === documentId
    )
    if (currentDocProposal) {
      dispatchPreviewForProposal(currentDocProposal)
    } else {
      window.dispatchEvent(new CustomEvent('lemona:agent-diff-clear', { detail: {} }))
    }
  }, [documentId, agentProposals])

  // Measure input container width to match user message width
  useEffect(() => {
    const updateWidth = () => {
      // Use the unified container ref directly for accurate width measurement
      // This container represents the actual input box, not affected by attachments preview
      if (unifiedContainerRef.current) {
        const width = unifiedContainerRef.current.offsetWidth
        setInputContainerWidth(width)
      } else if (inputContainerRef.current) {
        // Fallback: use the input container width minus padding
        const containerWidth = inputContainerRef.current.offsetWidth
        const padding = 12 + 14 // left + right padding
        setInputContainerWidth(containerWidth - padding)
      }
    }
    
    // Use a small delay to ensure DOM is ready
    const timeoutId = setTimeout(updateWidth, 0)
    window.addEventListener('resize', updateWidth)
    
    // Use ResizeObserver to watch for panel width changes
    const resizeObserver = new ResizeObserver(() => {
      updateWidth()
    })
    
    if (unifiedContainerRef.current) {
      resizeObserver.observe(unifiedContainerRef.current)
    } else if (inputContainerRef.current) {
      resizeObserver.observe(inputContainerRef.current)
    }
    
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', updateWidth)
      resizeObserver.disconnect()
    }
  }, [attachments]) // Recalculate when attachments change

  // Show scrollbar when textarea content overflows
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const checkOverflow = () => {
      if (textarea.scrollHeight > textarea.clientHeight) {
        textarea.classList.add('show-scrollbar')
      } else {
        textarea.classList.remove('show-scrollbar')
      }
    }

    checkOverflow()
    const observer = new ResizeObserver(checkOverflow)
    observer.observe(textarea)
    
    return () => {
      observer.disconnect()
    }
  }, [input])

  // Sync overlay scroll position with textarea
  useEffect(() => {
    const textarea = textareaRef.current
    const overlay = mentionOverlayRef.current
    if (!textarea || !overlay) return

    const syncScroll = () => {
      overlay.style.transform = `translateY(-${textarea.scrollTop}px)`
    }

    textarea.addEventListener('scroll', syncScroll)
    syncScroll() // Initial sync
    
    return () => {
      textarea.removeEventListener('scroll', syncScroll)
    }
  }, [input])

  // Load messages when documentId or chatId changes
  useEffect(() => {
    if (!documentId || !chatId) {
      setMessages([])
      setAgentProposals([])
      setPendingAddToChatReferences([])
      hasNotifiedFirstMessage.current = false
      return
    }
    setPendingAddToChatReferences([])

    // Capture previous values at the start to avoid race conditions with other effects
    const prevChatId = previousChatIdRef.current
    const prevDocumentId = previousDocumentIdRef.current

    // Check if this is a new chat (chatId changed) or just document change (same chatId)
    const isNewChat = prevChatId !== chatId
    const isDocumentChangeOnly = !isNewChat && prevDocumentId !== documentId && prevDocumentId !== null
    
    // Save scroll position before switching if it's a document change only
    let savedScrollPosition: number | null = null
    if (isDocumentChangeOnly && scrollContainerRef.current) {
      savedScrollPosition = scrollContainerRef.current.scrollTop
      // Save scroll position for this chat
      scrollPositionsRef.current.set(chatId, savedScrollPosition)
    }

    const loadMessages = async () => {
      try {
        // IPC returns data directly, not wrapped in { data: ... }
        const loadedMessages = await chatApi.getChat(documentId, chatId)
        // Ensure messages is always an array
        const messages = Array.isArray(loadedMessages) ? loadedMessages : []

        if (messages.length === 0) {
          const onboardingMessages = await buildOnboardingMessages()
          if (onboardingMessages && onboardingMessages.length > 0) {
            setMessages(onboardingMessages)
            setAgentProposals([])
            for (const message of onboardingMessages) {
              await saveMessage(message, false)
            }
            addedMessageIdsRef.current = new Set(onboardingMessages.map(msg => msg.id))
            hasNotifiedFirstMessage.current = true
          } else {
            setMessages(messages)
            setAgentProposals([])
            addedMessageIdsRef.current = new Set()
            hasNotifiedFirstMessage.current = false
          }
        } else {
          setMessages(messages)
          addedMessageIdsRef.current = new Set(messages.map(msg => msg.id))
          hasNotifiedFirstMessage.current = true

          const actionsToRestore: Array<{ action: AgentAction; messageId: string; userContent: string }> = []
          const restoredStatusesByMessage = new Map<string, Record<string, 'accepted' | 'rejected'>>()
          for (const msg of messages) {
            if (msg.role !== 'assistant' || !Array.isArray(msg.reasoningMetadata?.agentActions) || msg.reasoningMetadata.agentActions.length === 0) continue
            const prevUser = messages[messages.indexOf(msg) - 1]
            const userContent = prevUser?.role === 'user' ? (prevUser.content || '') : ''
            restoredStatusesByMessage.set(msg.id, msg.reasoningMetadata?.agentActionStatuses || {})
            for (const a of msg.reasoningMetadata!.agentActions) {
              actionsToRestore.push({ action: a as AgentAction, messageId: msg.id, userContent })
            }
          }

          if (actionsToRestore.length > 0) {
            try {
              const docs = await documentApi.list()
              const projectScopedDocs = docs.filter((doc: Document) => {
                const sameProject = projectId ? doc.projectId === projectId : true
                return sameProject && doc.folder !== 'worldlab'
              })
              const byMessage = new Map<string, { actions: AgentAction[]; userContent: string }>()
              for (const { action, messageId, userContent } of actionsToRestore) {
                let existing = byMessage.get(messageId)
                if (!existing) {
                  existing = { actions: [] as AgentAction[], userContent }
                  byMessage.set(messageId, existing)
                }
                existing.actions.push(action)
                existing.userContent = userContent
              }
              const allProposals: AgentFileProposal[] = []
              for (const [messageId, { actions, userContent }] of byMessage) {
                const restoredStatuses = restoredStatusesByMessage.get(messageId) || {}
                const restored = createProposalsFromActions(actions, messageId, projectScopedDocs, userContent).map(proposal => {
                  const restoredStatus = proposalStatusKeysFromProposal(proposal)
                    .map(key => restoredStatuses[key])
                    .find(status => status === 'accepted' || status === 'rejected')
                  if (restoredStatus === 'accepted' || restoredStatus === 'rejected') {
                    return { ...proposal, status: restoredStatus } as AgentFileProposal
                  }
                  return proposal
                })
                allProposals.push(...restored)
              }
              setAgentProposals(allProposals)
            } catch (err) {
              console.warn('[ChatInterface] Failed to restore agent proposals:', err)
              setAgentProposals([])
            }
          } else {
            setAgentProposals([])
          }
        }

        // Only scroll to bottom when opening a NEW chat (chatId changed)
        // If only documentId changed, restore the previous scroll position
        if (isNewChat) {
          // Always scroll to bottom when opening a new chat
          // Use requestAnimationFrame to ensure DOM is fully updated before scrolling
          requestAnimationFrame(() => {
            scrollToBottom('auto')
          })
          // Double-check with another frame to ensure it sticks
          requestAnimationFrame(() => {
            scrollToBottom('auto')
          })
        } else if (isDocumentChangeOnly && savedScrollPosition !== null) {
          // Restore scroll position when only document changed (same chat)
          requestAnimationFrame(() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = savedScrollPosition!
            }
          })
          // Double-check with another frame to ensure it sticks
          requestAnimationFrame(() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = savedScrollPosition!
            }
          })
        }
      } catch (error) {
        console.error('Failed to load chat messages:', error)
        setMessages([])
        setAgentProposals([])
        addedMessageIdsRef.current = new Set()
        hasNotifiedFirstMessage.current = false
      }
    }

    loadMessages()
    
    // Update refs after determining the change type
    previousDocumentIdRef.current = documentId
    previousChatIdRef.current = chatId
  }, [documentId, chatId])

  // Add scroll detection and edge detection to show scrollbar
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !documentId || !chatId) return

    const EDGE_DISTANCE = 20 // pixels from edge to show scrollbar

    const handleScroll = () => {
      if (container) {
        container.classList.add('scrolling')
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }
        scrollTimeoutRef.current = setTimeout(() => {
          if (container) {
            container.classList.remove('scrolling')
          }
        }, 600) // Slightly longer than transition duration (400ms) to allow fade-out

        // Save scroll position for current chat
        if (chatId) {
          scrollPositionsRef.current.set(chatId, container.scrollTop)
        }
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!container) return
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const width = rect.width
      const height = rect.height
      
      // Check if mouse is near right edge (for vertical scrollbar) or bottom edge (for horizontal scrollbar)
      const nearRightEdge = mouseX > width - EDGE_DISTANCE
      const nearBottomEdge = mouseY > height - EDGE_DISTANCE
      
      if (nearRightEdge || nearBottomEdge) {
        container.classList.add('show-scrollbar')
      } else {
        container.classList.remove('show-scrollbar')
      }
    }

    const handleMouseLeave = () => {
      if (container) {
        container.classList.remove('show-scrollbar')
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    container.addEventListener('mousemove', handleMouseMove, { passive: true })
    container.addEventListener('mouseleave', handleMouseLeave)
    
    return () => {
      container.removeEventListener('scroll', handleScroll)
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [documentId, chatId])

  // Track which messages have been added to chat history
  const addedMessageIdsRef = useRef<Set<string>>(new Set())

  // Helper function to save/update message with debouncing for streaming
  const saveMessage = async (message: AIChatMessage, isStreaming: boolean = false) => {
    if (!documentId || !chatId) return

    try {
      const messageId = message.id
      const isFirstTime = !addedMessageIdsRef.current.has(messageId)

      if (isStreaming) {
        if (isFirstTime) {
          // First time: add the message
          await chatApi.addMessage(documentId, chatId, message)
          addedMessageIdsRef.current.add(messageId)
        } else {
          // Subsequent updates: debounce updates during streaming (save every 500ms)
        if (updateMessageTimeoutRef.current) {
          clearTimeout(updateMessageTimeoutRef.current)
        }
        updateMessageTimeoutRef.current = setTimeout(async () => {
            try {
              await chatApi.updateMessage(documentId, chatId, messageId, message.content, message.reasoningMetadata)
            } catch (error) {
              // If update fails (e.g., message not found), try adding it again
              console.warn('Update failed, trying to add message:', error)
              await chatApi.addMessage(documentId, chatId, message)
            }
        }, 500)
        }
      } else {
        // Save immediately if not streaming
        if (updateMessageTimeoutRef.current) {
          clearTimeout(updateMessageTimeoutRef.current)
          updateMessageTimeoutRef.current = null
        }
        
        if (isFirstTime) {
        await chatApi.addMessage(documentId, chatId, message)
          addedMessageIdsRef.current.add(messageId)
        } else {
          // Final save: update the message
          await chatApi.updateMessage(documentId, chatId, messageId, message.content, message.reasoningMetadata)
        }
      }
    } catch (error) {
      console.error('Failed to save message:', error)
    }
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateMessageTimeoutRef.current) {
        clearTimeout(updateMessageTimeoutRef.current)
      }
    }
  }, [])

  // Helper function to process files and add as attachments
  const processFiles = async (files: FileList | File[]): Promise<ChatAttachment[]> => {
    const newAttachments: ChatAttachment[] = []
    const fileArray = Array.from(files)

    for (const file of fileArray) {
      const fileType = file.type
      const isImage = fileType.startsWith('image/')
      const isPDF = fileType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

      if (!isImage && !isPDF) {
        console.warn(`Unsupported file type: ${fileType}`)
        continue
      }

      try {
        // Read file as base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            // Remove data URL prefix (e.g., "data:image/png;base64,")
            const base64Data = result.includes(',') ? result.split(',')[1] : result
            resolve(base64Data)
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })

        const attachment: ChatAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: isImage ? 'image' : 'pdf',
          name: file.name || (isImage ? 'pasted-image.png' : 'pasted-file.pdf'),
          data: base64,
          mimeType: fileType,
        }

        newAttachments.push(attachment)
      } catch (error) {
        console.error('Failed to read file:', error)
      }
    }

    return newAttachments
  }

  // Handle file selection
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const newAttachments = await processFiles(files)

    if (newAttachments.length > 0) {
      setAttachments(prev => [...prev, ...newAttachments])
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Handle paste event
  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = event.clipboardData
    if (!clipboardData) return

    const items = clipboardData.items
    const files: File[] = []

    // Check for files in clipboard
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          files.push(file)
        }
      }
    }

    // If files found, process them as attachments
    if (files.length > 0) {
      event.preventDefault() // Prevent default paste behavior
      const newAttachments = await processFiles(files)
      if (newAttachments.length > 0) {
        setAttachments(prev => [...prev, ...newAttachments])
      }
    }
  }

  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const files = event.dataTransfer?.files
    if (!files || files.length === 0) return
    const newAttachments = await processFiles(files)
    if (newAttachments.length > 0) {
      setAttachments(prev => [...prev, ...newAttachments])
    }
  }

  // Remove attachment
  const handleRemoveAttachment = (attachmentId: string) => {
    setAttachments(prev => prev.filter(att => att.id !== attachmentId))
  }

  // Copy code block to clipboard
  const handleCopyCode = async (code: string, blockId: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCodeBlocks(prev => new Set(prev).add(blockId))
      setTimeout(() => {
        setCopiedCodeBlocks(prev => {
          const newSet = new Set(prev)
          newSet.delete(blockId)
          return newSet
        })
      }, 2000)
    } catch (error) {
      console.error('Failed to copy code:', error)
    }
  }

  const getDisplayTitleForFile = (fileId: string): string => {
    const doc = allDocuments.find((d: Document) => d.id === fileId)
    return doc
      ? doc.title
      : (documentTitleCache.get(fileId) || formatIntegrationFileIdForDisplay(fileId) || fileId.substring(0, 30) + (fileId.length > 30 ? '…' : ''))
  }

  const ensureDocumentTitleLoaded = (fileId: string) => {
    const doc = allDocuments.find((d: Document) => d.id === fileId)
    const isIntegration = fileId.startsWith('integration:')
    if (doc || documentTitleCache.has(fileId) || isIntegration) return

    documentApi.get(fileId).then((loadedDoc: Document | null) => {
      if (loadedDoc) {
        setDocumentTitleCache(prev => new Map(prev).set(fileId, loadedDoc.title))
        setAllDocuments(prev => {
          if (!prev.find(d => d.id === fileId)) {
            return [...prev, loadedDoc]
          }
          return prev
        })
      }
    }).catch((error) => {
      console.warn(`[ChatInterface] Failed to load document ${fileId}:`, error)
    })
  }

  const startEditingMessage = (message: AIChatMessage) => {
    setEditingMessageId(message.id)
    setEditingMessageContent(message.content)
  }

  // Focus user message inline editor when it opens; cursor at end
  useEffect(() => {
    if (!editingMessageId) return
    const msg = messages.find(m => m.id === editingMessageId)
    if (msg?.role !== 'user') return
    const timer = requestAnimationFrame(() => {
      const el = userMessageEditTextareaRef.current
      if (el) {
        el.focus()
        const len = el.value?.length ?? 0
        el.setSelectionRange(len, len)
      }
    })
    return () => cancelAnimationFrame(timer)
  }, [editingMessageId, messages])

  // Focus AI reply inline editor when it opens; cursor at end
  useEffect(() => {
    if (!editingMessageId) return
    const msg = messages.find(m => m.id === editingMessageId)
    if (msg?.role !== 'assistant') return
    const timer = requestAnimationFrame(() => {
      const el = assistantMessageEditTextareaRef.current
      if (el) {
        el.focus()
        const len = el.value?.length ?? 0
        el.setSelectionRange(len, len)
      }
    })
    return () => cancelAnimationFrame(timer)
  }, [editingMessageId, messages])

  const cancelEditingMessage = () => {
    setEditingMessageId(null)
    setEditingMessageContent('')
  }

  const handleUserEditBlur = () => {
    setTimeout(() => {
      const el = userMessageEditContainerRef.current
      if (!el) return
      const active = document.activeElement
      if (!active || !el.contains(active)) {
        cancelEditingMessage()
      }
    }, 0)
  }

  const handleResendFromMessage = async (message: AIChatMessage, overrideContent?: string) => {
    if (!documentId || !chatId) return
    if (isLoading) {
      await handleStopGeneration()
    }

    const messageIndex = messages.findIndex(item => item.id === message.id)
    if (messageIndex === -1) return

    const truncatedHistory = messages.slice(0, messageIndex)
    const resendText = overrideContent ?? message.content
    const resendAttachments = message.attachments ? [...message.attachments] : []

    try {
      if (messageIndex === 0) {
        await chatApi.deleteChat(documentId, chatId)
      } else {
        await chatApi.truncateChatAfterIndex(documentId, chatId, messageIndex - 1)
      }
      setMessages(truncatedHistory)
      await handleSend({
        inputText: resendText,
        attachmentsOverride: resendAttachments,
        historyOverride: truncatedHistory,
      })
    } catch (error) {
      console.error('Failed to resend from selected message:', error)
    }
  }

  const saveEditedAssistantMessage = async (message: AIChatMessage) => {
    if (!documentId || !chatId) return

    const now = new Date().toISOString()
    const originalContent = message.editedByUser ? message.originalContent : message.content
    const updatedMessage: AIChatMessage = {
      ...message,
      content: editingMessageContent,
      editedByUser: true,
      originalContent,
      editedAt: now,
      timestamp: now,
    }

    setMessages(prev => prev.map(item => item.id === message.id ? updatedMessage : item))
    setEditingMessageId(null)
    setEditingMessageContent('')

    try {
      await chatApi.updateMessage(
        documentId,
        chatId,
        message.id,
        updatedMessage.content,
        updatedMessage.reasoningMetadata,
        {
          editedByUser: true,
          originalContent: updatedMessage.originalContent,
          editedAt: updatedMessage.editedAt,
        }
      )
    } catch (error) {
      console.error('Failed to save edited assistant message:', error)
    }
  }

  const saveEditedUserMessage = async (message: AIChatMessage, resendFromHere: boolean = false) => {
    if (!documentId || !chatId) return

    const now = new Date().toISOString()
    const updatedMessage: AIChatMessage = {
      ...message,
      content: editingMessageContent,
      timestamp: now,
    }

    setMessages(prev => prev.map(item => item.id === message.id ? updatedMessage : item))
    setEditingMessageId(null)
    setEditingMessageContent('')

    try {
      await chatApi.updateMessage(
        documentId,
        chatId,
        message.id,
        updatedMessage.content,
      )
      if (resendFromHere) {
        await handleResendFromMessage(updatedMessage, updatedMessage.content)
      }
    } catch (error) {
      console.error('Failed to save edited user message:', error)
    }
  }

  // Highlight @mentions in message content (including ranged refs like @file.md (3-5))
  const highlightMentions = (text: string): React.ReactNode => {
    // Match ranged format @filename (3-5) first, then simple @Library or @file
    const mentionRegex = /@([^\n@]+?) \((\d+-\d+)\)(?=\s|$)|@\s*(Library|[^\s@]+)(?!\s*\()/g
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match
    
    while ((match = mentionRegex.exec(text)) !== null) {
      // Add text before the mention
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index))
      }
      
      const mentionStart = match.index
      let mentionEnd = match.index + match[0].length
      let mentionText = match[0]
      const isRanged = !!match[1]
      const mentionName = isRanged ? match[1].trim() : (match[3] || '')
      const isLibrary = mentionName === 'Library'
      
      // Check if this is a prefix of a document title (like "file" -> "file (2).pdf")
      // Search in both workspace files and uploaded files (if indexed)
      const allMentionableDocs = isLibraryIndexed 
        ? [...libraryDocuments, ...allDocuments.filter(doc => isUploadedFile(doc) && doc.projectId === projectId)]
        : libraryDocuments
      let matchedDoc = allMentionableDocs.find(doc => doc.title === mentionName || doc.id === mentionName)
      
      if (!matchedDoc && !isLibrary && !isRanged) {
        const textAfterMention = text.slice(mentionEnd)
        
        // Find documents that start with the mention name (case-insensitive)
        const potentialDocs = allMentionableDocs.filter(doc => {
          const docTitle = doc.title
          return docTitle.toLowerCase().startsWith(mentionName.toLowerCase())
        })
        
        // Check if any of the following text completes a document title
        for (const doc of potentialDocs) {
          const remainingTitle = doc.title.slice(mentionName.length)
          
          // Check if the text after the mention starts with the remaining title
          if (remainingTitle && textAfterMention.startsWith(remainingTitle)) {
            matchedDoc = doc
            mentionEnd = mentionStart + 1 + doc.title.length // +1 for @
            mentionText = '@' + doc.title
            break
          }
        }
      }
      
      const isFile = !!matchedDoc || isRanged || (!isLibrary && allMentionableDocs.some(doc => doc.title === mentionName || doc.id === mentionName))
      
      // Add highlighted mention
      parts.push(
        <span
          key={`mention-${mentionStart}`}
          style={{
            backgroundColor: theme === 'dark' 
              ? (isLibrary ? '#2d4a5c' : isFile ? '#3d2d4a' : '#3d3d3d')
              : (isLibrary ? '#e8f0fe' : isFile ? '#e3f2fd' : '#f1f3f4'), // Pale blue for file mentions in light theme
            color: theme === 'dark' ? '#ffffff' : textColor, // Normal text color
            padding: '2px 6px',
            borderRadius: '3px', // Less rounded corners
            fontWeight: 'normal', // Same weight as regular text
            fontSize: '13px',
            maxWidth: '100%',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word'
          }}
        >
          {mentionText}
        </span>
      )
      
      lastIndex = mentionEnd
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }
    
    return parts.length > 0 ? <>{parts}</> : text
  }

  // Helper function to format error messages in a user-friendly way
  const formatErrorMessage = (error: any): string => {
    let errorMessage = error instanceof Error ? error.message : String(error)
    let errorDetails = ''
    
    // Try to parse JSON error responses
    try {
      // Check if error message contains JSON
      const jsonMatch = errorMessage.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const errorJson = JSON.parse(jsonMatch[0])
        if (errorJson.error) {
          errorMessage = errorJson.error.message || errorMessage
          if (errorJson.error.code) {
            errorDetails = `Error code: ${errorJson.error.code}`
          }
          if (errorJson.error.status) {
            errorDetails += errorDetails ? `, Status: ${errorJson.error.status}` : `Status: ${errorJson.error.status}`
          }
        }
      }
    } catch (e) {
      // If parsing fails, use original error message
    }
    
    // Check for error in error object itself
    if (error && typeof error === 'object' && error.error) {
      if (typeof error.error === 'string') {
        errorMessage = error.error
      } else if (error.error.message) {
        errorMessage = error.error.message
        if (error.error.code) {
          errorDetails = `Error code: ${error.error.code}`
        }
      }
    }
    
    const lowerMessage = errorMessage.toLowerCase()
    
    // API key errors
    if (lowerMessage.includes('api key') || lowerMessage.includes('not configured') || lowerMessage.includes('no embedding api key')) {
      if (lowerMessage.includes('openai')) {
        return 'OpenAI API key is required. Please add your OpenAI API key in Settings > API Keys.'
      }
      if (lowerMessage.includes('google') || lowerMessage.includes('gemini')) {
        return 'Google API key is required. Please add your Google API key in Settings > API Keys.'
      }
      return 'API key is required. Please add your API key in Settings > API Keys.'
    }
    
    // Quota/billing errors (check first before rate limit, as quota is more specific)
    if (lowerMessage.includes('quota') || lowerMessage.includes('billing') || lowerMessage.includes('insufficient') || 
        lowerMessage.includes('exceeded your current quota') || lowerMessage.includes('resource_exhausted') ||
        errorMessage.includes('429') && (lowerMessage.includes('quota') || lowerMessage.includes('exceeded'))) {
      return `API quota exceeded. Your API account has reached its usage limit.${errorDetails ? ` (${errorDetails})` : ''}\n\nPlease check your API account billing or usage limits:\n• Gemini: https://ai.dev/usage?tab=rate-limit\n• OpenAI: Check your usage dashboard\n\nYou may need to upgrade your plan or wait for quota reset.`
    }
    
    // Rate limit errors (429 without quota mention)
    if (lowerMessage.includes('rate limit') || (errorMessage.includes('429') && !lowerMessage.includes('quota'))) {
      return `Rate limit exceeded. Too many requests in a short time.${errorDetails ? ` (${errorDetails})` : ''}\n\nPlease wait a moment and try again.`
    }
    
    // Network/connection errors
    if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('econnrefused') || 
        lowerMessage.includes('failed to fetch') || lowerMessage.includes('networkerror')) {
      return 'Connection error. Please check your internet connection and try again.'
    }
    
    // Authentication errors
    if (lowerMessage.includes('401') || lowerMessage.includes('unauthorized') || lowerMessage.includes('invalid api key') ||
        lowerMessage.includes('authentication') || lowerMessage.includes('permission denied')) {
      return 'Invalid API key. Please check your API key in Settings > API Keys and ensure it\'s correct.'
    }
    
    // Model-specific errors
    if (lowerMessage.includes('model') && (lowerMessage.includes('not found') || lowerMessage.includes('unavailable') || 
        lowerMessage.includes('does not exist'))) {
      return 'Model unavailable. Please try selecting a different model from the dropdown.'
    }
    
    // Server errors (500, 503, etc.)
    if (errorMessage.includes('500') || lowerMessage.includes('internal server error') || 
        errorMessage.includes('503') || lowerMessage.includes('service unavailable')) {
      return `Server error. The AI service is temporarily unavailable.${errorDetails ? ` (${errorDetails})` : ''}\n\nPlease try again in a few moments.`
    }
    
    // Generic error - show a friendly message with original error if helpful
    const isDetailedError = errorMessage.length > 50 || errorMessage.includes('Error:') || errorMessage.includes('error:')
    if (isDetailedError && !lowerMessage.includes('unable to process')) {
      return `${errorMessage}${errorDetails ? `\n\n${errorDetails}` : ''}\n\nIf this persists, please check your API keys in Settings or try a different model.`
    }
    
    return `Unable to process your request.${errorDetails ? ` (${errorDetails})` : ''}\n\nPlease try again or check your API keys in Settings > API Keys.`
  }

  // Explicitly exit mention mode and clear all related state
  const exitMentionMode = () => {
    setIsInMentionMode(false)
    setShowMentionDropdown(false)
    setMentionQuery('')
    mentionStartIndexRef.current = -1
    setSelectedMentionIndex(0)
  }

  // Handle @mention detection and inline autocomplete
  const detectMention = (text: string, cursorPosition: number) => {
    // First check if there's any @ in the entire text - if not, exit mention mode
    if (text.indexOf('@') === -1) {
      if (isInMentionMode) {
        exitMentionMode()
      }
      return
    }
    
    const textBeforeCursor = text.slice(0, cursorPosition)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    
    // Check if @ exists before cursor - if not, exit mention mode explicitly
    if (lastAtIndex === -1) {
      if (isInMentionMode) {
        exitMentionMode()
      }
      return
    }
    
    const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1)
    
    // If there's whitespace or newline immediately after @, exit mention mode
    if (textAfterAt.match(/^\s/)) {
      if (isInMentionMode) {
        exitMentionMode()
      }
      return
    }
    
    // Check if mention is already complete (has space after it) - exit mention mode
    const mentionText = textBeforeCursor.slice(lastAtIndex + 1)
    if (mentionText.includes(' ')) {
      if (isInMentionMode) {
        exitMentionMode()
      }
      return
    }
    
    // Check if cursor is after a space that follows the mention - exit mention mode
    if (cursorPosition > 0) {
      const charBeforeCursor = text[cursorPosition - 1]
      if (charBeforeCursor === ' ') {
        const textBeforeSpace = text.slice(0, cursorPosition - 1)
        const lastAtBeforeSpace = textBeforeSpace.lastIndexOf('@')
        if (lastAtBeforeSpace !== -1 && lastAtBeforeSpace === lastAtIndex) {
          if (isInMentionMode) {
            exitMentionMode()
          }
          return
        }
      }
    }
    
    // Check if there's already a space or end of word before @ (valid mention context)
    const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' '
    if (charBeforeAt !== ' ' && charBeforeAt !== '\n' && lastAtIndex > 0) {
      if (isInMentionMode) {
        exitMentionMode()
      }
      return
    }
    
    // Enter mention mode explicitly
    if (!isInMentionMode) {
      setIsInMentionMode(true)
    }
    
    mentionStartIndexRef.current = lastAtIndex
    setMentionQuery(textAfterAt)
    
    // Get filtered mentions based on current query
    const mentions = getFilteredMentions()
    if (mentions.length > 0) {
      setShowMentionDropdown(true)
      
      // Determine the correct selected index
      // When user types, always select the first matching item to keep suggestion in sync
      let newSelectedIndex = 0
      
      // If there's no query (just @), keep current selection if valid
      if (textAfterAt.length === 0) {
        if (selectedMentionIndex < mentions.length) {
          newSelectedIndex = selectedMentionIndex
        } else {
          newSelectedIndex = 0
        }
      } else {
        // When user types, always select first match to ensure suggestion matches what they're typing
        newSelectedIndex = 0
      }
      
      // Update selected index if it changed
      if (newSelectedIndex !== selectedMentionIndex) {
        setSelectedMentionIndex(newSelectedIndex)
      }
    } else {
      setShowMentionDropdown(false)
    }
  }

  const getFilteredMentions = () => {
    const query = mentionQuery.toLowerCase().trim()
    const mentions: MentionOption[] = []

    const getProjectFolderMentions = (): ProjectFolderMention[] => {
      try {
        const defaultRootMeta = {
          worldlab: { id: 'worldlab', name: 'worldlab', hidden: true },
          library: { id: 'library', name: 'library', hidden: false },
          project: { id: 'project', name: 'workspace', hidden: false },
        }
        const storedRootMetaRaw = localStorage.getItem(PROJECT_ROOT_FOLDER_META_KEY)
        let rootMeta = defaultRootMeta
        if (storedRootMetaRaw) {
          const parsed = JSON.parse(storedRootMetaRaw)
          if (parsed && typeof parsed === 'object') {
            rootMeta = {
              worldlab: { ...defaultRootMeta.worldlab, ...(parsed.worldlab || {}) },
              library: { ...defaultRootMeta.library, ...(parsed.library || {}) },
              project: { ...defaultRootMeta.project, ...(parsed.project || {}) },
            }
          }
        }

        const rootFolders = [rootMeta.project, rootMeta.library, rootMeta.worldlab]
          .filter(root => !root.hidden)
          .map(root => ({ id: root.id, fullPath: root.name.trim() }))
          .filter(root => root.fullPath.length > 0)

        const rootIdToName = new Map(rootFolders.map(root => [root.id, root.fullPath]))

        const raw = localStorage.getItem(PROJECT_FOLDERS_STORAGE_KEY)
        if (!raw) return rootFolders
        const parsed = JSON.parse(raw) as Array<{ id?: string; name?: string; parentId?: string | null; order?: number }>
        if (!Array.isArray(parsed)) return rootFolders

        const folders = parsed
          .filter(item => item && typeof item.id === 'string' && typeof item.name === 'string')
          .map(item => ({
            id: item.id as string,
            name: (item.name as string).trim(),
            parentId: typeof item.parentId === 'string' ? item.parentId : null,
            order: typeof item.order === 'number' ? item.order : 0,
          }))
          .filter(item => item.name.length > 0 && !rootIdToName.has(item.id))

        if (folders.length === 0) return rootFolders

        const byId = new Map(folders.map(folder => [folder.id, folder]))

        const buildPath = (folderId: string): string => {
          const segments: string[] = []
          const visited = new Set<string>()
          let currentId: string | null = folderId
          while (currentId) {
            if (visited.has(currentId)) return ''
            visited.add(currentId)
            if (rootIdToName.has(currentId)) {
              segments.unshift(rootIdToName.get(currentId) || '')
              break
            }
            const current = byId.get(currentId)
            if (!current) return ''
            segments.unshift(current.name)
            currentId = current.parentId ?? 'project'
          }
          return segments.join('/')
        }

        const dedup = new Set<string>()
        const nestedFolders = folders
          .map(folder => ({ id: folder.id, fullPath: buildPath(folder.id) }))
          .filter(folder => folder.fullPath.length > 0)
        return [...rootFolders, ...nestedFolders]
          .filter(folder => {
            const key = folder.fullPath.toLowerCase()
            if (dedup.has(key)) return false
            dedup.add(key)
            return true
          })
          .sort((a, b) => a.fullPath.localeCompare(b.fullPath))
      } catch {
        return []
      }
    }

    const projectFolders = getProjectFolderMentions()
      .filter(folder => !query || folder.fullPath.toLowerCase().includes(query))
    projectFolders.forEach((folder) => {
      mentions.push({
        type: 'folder',
        id: folder.id,
        name: folder.fullPath,
        folder: 'project',
      })
    })

    const normalizedQuery = query.replace(/^@/, '')
    const includeIntegrationAll = !normalizedQuery || 'integration'.includes(normalizedQuery)
    if (includeIntegrationAll) {
      mentions.push({
        type: 'integration',
        id: 'integration-all',
        name: 'Integration (All Apps)',
        mentionToken: '@integration',
      })
    }

    const seenSourceTypes = new Set<IntegrationSource['sourceType']>()
    integrationSources.forEach((source) => {
      const sourceType = source.sourceType
      if (!SUPPORTED_INTEGRATION_SOURCE_TYPES.includes(sourceType)) return
      if (seenSourceTypes.has(sourceType)) return
      const label = INTEGRATION_SOURCE_LABELS[sourceType] || sourceType
      const matchesQuery = !normalizedQuery
        || label.toLowerCase().includes(normalizedQuery)
        || sourceType.toLowerCase().includes(normalizedQuery)
      if (!matchesQuery) return
      seenSourceTypes.add(sourceType)
      mentions.push({
        type: 'integration',
        id: source.id,
        name: label,
        mentionToken: `@${sourceType}`,
        sourceType,
      })
    })
    
    // Only show uploaded files (PDF/DOCX) if indexed
    if (isLibraryIndexed) {
      const libraryFiles = allDocuments.filter((doc: Document) => {
        if (!isUploadedFile(doc)) return false
        if (projectId && doc.projectId !== projectId) return false
        if (doc.folder === 'worldlab') return false
        
        // Only include files that are indexed (status === 'completed')
        const indexingStatus = libraryFileIndexingStatuses.get(doc.id)
        if (!indexingStatus || indexingStatus.status !== 'completed') {
          return false
        }
        
        // Filter by query if provided
        if (query) {
          const docName = doc.title.toLowerCase()
          return docName.includes(query) || doc.id.toLowerCase().includes(query)
        }
        
        return true
      })
      
      // Sort library files to match FileExplorer order
      // Sort by order if available, otherwise by creation time (ascending)
      const sortDocuments = (docs: Document[]) => {
        return [...docs].sort((a, b) => {
          if (a.order !== undefined && b.order !== undefined) {
            return a.order - b.order
          }
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        })
      }
      
      const sortedLibraryFiles = sortDocuments(libraryFiles)
      
      // Add library files to mentions
      sortedLibraryFiles.forEach((doc: Document) => {
        const fileName = doc.title.toLowerCase()
        const fileType = fileName.endsWith('.pdf') ? 'pdf' : 'docx'
        mentions.push({
          type: 'file',
          id: doc.id,
          name: doc.title,
          folder: 'library',
          fileType
        })
      })
    }
    
    // Add workspace files (folder === 'project' or undefined/null)
    // libraryDocuments now contains only workspace files
    const workspaceFiles = libraryDocuments.filter((doc: Document) => {
      // Filter by query if provided
      if (query) {
        const docName = doc.title.toLowerCase()
        return docName.includes(query) || doc.id.toLowerCase().includes(query)
      }
      return true
    })
    
    // Sort workspace files
    const sortDocuments = (docs: Document[]) => {
      return [...docs].sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })
    }
    
    const sortedWorkspaceFiles = sortDocuments(workspaceFiles)
    
    // Add workspace files to mentions
    sortedWorkspaceFiles.forEach((doc: Document) => {
      mentions.push({
        type: 'file',
        id: doc.id,
        name: doc.title,
        folder: doc.folder || 'project',
      })
    })
    
    return mentions
  }

  const insertMention = (mention: MentionOption) => {
    if (!textareaRef.current || mentionStartIndexRef.current === -1) return
    
    const textarea = textareaRef.current
    const currentValue = textarea.value
    const cursorPosition = textarea.selectionStart
    
    // Store the mention start position before it gets reset
    const mentionStartPos = mentionStartIndexRef.current
    
    // Find the end of the mention query (cursor position or next space)
    let mentionEnd = cursorPosition
    const textAfterAt = currentValue.slice(mentionStartPos + 1, cursorPosition)
    const spaceIndex = textAfterAt.indexOf(' ')
    if (spaceIndex !== -1) {
      mentionEnd = mentionStartPos + 1 + spaceIndex
    }
    
    // Build the mention text (ensure space after)
    const mentionText = mention.type === 'library'
      ? '@Library'
      : (mention.type === 'integration'
        ? (mention.mentionToken || `@${mention.name.toLowerCase()}`)
        : `@${mention.name}`)
    
    // Replace the @query with the mention (always add space after)
    const newValue = 
      currentValue.slice(0, mentionStartPos) +
      mentionText + ' ' +
      currentValue.slice(mentionEnd)
    
    setInput(newValue)
    
    // Exit mention mode explicitly after inserting mention
    exitMentionMode()
    
    // Set cursor position after the mention and space (highlighting is now persistent via overlay)
    // Use requestAnimationFrame to ensure the DOM has updated
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (textareaRef.current) {
          // Calculate cursor position: start of mention + mention text length + space (1 char)
          // This places the cursor AFTER the space
          const newCursorPos = mentionStartPos + mentionText.length + 1
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
          
          // Auto-adjust textarea height after inserting mention (especially for long filenames)
          textareaRef.current.style.height = 'auto'
          const scrollHeight = textareaRef.current.scrollHeight
          const newHeight = Math.min(scrollHeight, 200)
          textareaRef.current.style.height = `${newHeight}px`
          // Only show scrollbar when content exceeds maxHeight
          if (scrollHeight > 200) {
            textareaRef.current.style.overflowY = 'auto'
          } else {
            textareaRef.current.style.overflowY = 'hidden'
          }
          
          textareaRef.current.focus()
        }
      }, 0)
    })
  }

  const handleStopGeneration = async () => {
    isStreamCancelledRef.current = true
    
    if (streamReaderRef.current) {
      try {
        await streamReaderRef.current.cancel()
      } catch (error) {
        console.error('Error canceling stream:', error)
      }
      streamReaderRef.current = null
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    // Remove the incomplete assistant message if it exists
    if (currentAssistantMessageIdRef.current) {
      setMessages(prev => {
        const filtered = prev.filter(msg => msg.id !== currentAssistantMessageIdRef.current)
        return filtered
      })
      currentAssistantMessageIdRef.current = null
    }
    
    setIsLoading(false)
    setIsStreaming(false)
  }

  const handleSend = async (sendOverrides?: {
    inputText?: string
    attachmentsOverride?: ChatAttachment[]
    historyOverride?: AIChatMessage[]
  }) => {
    // If already generating, stop the current generation
    if (isLoading) {
      await handleStopGeneration()
      return
    }

    const effectiveInput = sendOverrides?.inputText ?? input
    const effectiveAttachments = sendOverrides?.attachmentsOverride ?? attachments

    if ((!effectiveInput.trim() && effectiveAttachments.length === 0) || !documentId || !chatId) return
    const effectiveDocumentContent = getRealtimeDocumentContent?.() || documentContent

    // Check for required API keys before sending
    const hasGoogleKey = !!googleApiKey
    const hasOpenaiKey = !!openaiApiKey
    const hasCustomKey = effectiveProviderType === 'custom-openai' && (!!(activeChatProfile as { apiKey?: string })?.apiKey || hasOpenaiKey)
    const isOpenaiModel = selectedModel.startsWith('gpt-')
    
    if (effectiveProviderType === 'custom-openai' && !hasCustomKey) {
      const errorMessage: AIChatMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: 'Custom AI requires an API key. Add one in Custom AI Endpoint settings or use your OpenAI key in the chat panel.',
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMessage])
      await saveMessage(errorMessage, false)
      setShowSettingsModal(true)
      return
    }
    
    if (isOpenaiModel && !hasOpenaiKey && effectiveProviderType === 'builtin-openai') {
      const errorMessage: AIChatMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: 'OpenAI API key is required for GPT models. Please add your OpenAI API key in the chat panel.',
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMessage])
      await saveMessage(errorMessage, false)
      setShowSettingsModal(true)
      return
    }
    
    if (effectiveProviderType === 'builtin-gemini' && !hasGoogleKey) {
      const errorMessage: AIChatMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: 'An API key is required. Please add your Google API key in the chat panel.',
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMessage])
      await saveMessage(errorMessage, false)
      setShowSettingsModal(true)
      return
    }

    // Store the input value before clearing it (for onFirstMessage callback)
    const messageContent = effectiveInput.trim()
    const inlineRangeReferences = buildInlineRangeReferencesFromInput(effectiveInput)
    const referencedSnippetsForSend = [...pendingAddToChatReferences, ...inlineRangeReferences]
      .filter(ref => ref.mentionToken && ref.selectedText)
      .filter((ref, index, arr) =>
        arr.findIndex(candidate =>
          candidate.mentionToken === ref.mentionToken &&
          candidate.selectedText === ref.selectedText
        ) === index
      )
    const referencedSnippetsInstruction = referencedSnippetsForSend.length > 0
      ? `\n\nREFERENCED_SNIPPETS (hidden context from Add to Chat):\n${referencedSnippetsForSend.map((ref, index) => {
          const rangePart = ref.lineRange ? ` (${ref.lineRange})` : ''
          return `Snippet ${index + 1}:\n- mentionToken: ${ref.mentionToken}\n- fileName: ${ref.fileName}${rangePart}\n- selectedText:\n${ref.selectedText}`
        }).join('\n\n')}\n\nWhen the user references these mentionToken values, use the matching selectedText as authoritative context.`
      : ''

    const userMessage: AIChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: effectiveInput,
      timestamp: new Date().toISOString(),
      attachments: effectiveAttachments.length > 0 ? [...effectiveAttachments] : undefined,
    }

    const assistantMessage: AIChatMessage = {
      id: generateMessageId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    }
    upsertProgressEvent(assistantMessage.id, {
      type: 'agent_note',
      stepId: `note_${Date.now()}`,
      action: 'orchestrate',
      status: 'note',
      label: 'Starting retrieval...',
      timestamp: new Date().toISOString(),
    })
    currentAssistantMessageIdRef.current = assistantMessage.id
    setMessages(prev => [...prev, userMessage, assistantMessage])
    setInput('')
    setPendingAddToChatReferences([])
    setAttachments([]) // Clear attachments after sending
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setIsLoading(true)
    setIsStreaming(true)
    const requestStartedAt = Date.now()
    let hasRecordedFirstFeedback = false
    let hasRecordedFirstToken = false
    let hasRecordedFirstPatch = false
    let patchesEmittedBeforeStreamEnd = 0
    let totalPatchSizeChars = 0
    let patchParseErrorCount = 0
    let patchEventsSeen = 0
    const streamedActionSignatures = new Set<string>()
    const streamedEditBlockTargets = new Set<string>()

    // Notify parent about first message for chat naming (only when message is actually being sent)
    if (!hasNotifiedFirstMessage.current && onFirstMessage && messageContent) {
      onFirstMessage(messageContent)
      hasNotifiedFirstMessage.current = true
    }

    // Save user message immediately
    await saveMessage(userMessage, false)

    try {
      // Reset cancellation flag
      isStreamCancelledRef.current = false
      if (chatMode === 'agent') {
        logAgent('request_started', { userChars: userMessage.content?.length || 0 })
      }
      
      // Create abort controller for this request
      abortControllerRef.current = new AbortController()
      
      // Pass chat history (excluding the just-added user message) for conversation continuity
      const chatHistoryForAPI = sendOverrides?.historyOverride ?? messages.filter(msg => msg.id !== userMessage.id)
      let projectScopedDocs: Document[] = []
      const appendAgentActionsAsProposals = async (actions: AgentActionPayload['actions']) => {
        if (!actions || actions.length === 0) return
        if (projectScopedDocs.length === 0) {
          const docs = await documentApi.list()
          projectScopedDocs = docs.filter((doc: Document) => {
            const sameProject = projectId ? doc.projectId === projectId : true
            return sameProject && doc.folder !== 'worldlab'
          })
        }
        const uniqueActions = actions.filter(action => {
          const signature = actionSignature(action)
          if (streamedActionSignatures.has(signature)) return false
          const targetKey = editBlockTargetKey(action)
          if (targetKey && streamedEditBlockTargets.has(targetKey)) {
            streamedActionSignatures.add(signature)
            return false
          }
          if (targetKey) {
            streamedEditBlockTargets.add(targetKey)
          }
          streamedActionSignatures.add(signature)
          return true
        })
        if (uniqueActions.length === 0) return
        const proposals = createProposalsFromActions(
          uniqueActions,
          assistantMessage.id,
          projectScopedDocs,
          userMessage.content || ''
        )
        setAgentProposals(prev => [...prev, ...proposals])
        patchesEmittedBeforeStreamEnd += proposals.length
        totalPatchSizeChars += proposals.reduce((sum, proposal) => sum + (proposal.patchNewText || proposal.content || '').length, 0)
        if (!hasRecordedFirstPatch && proposals.length > 0) {
          hasRecordedFirstPatch = true
          console.info('[AgentUX] time_to_first_patch_ms', Date.now() - requestStartedAt)
        }

        const currentDocPatches = proposals.filter(
          p => p.status === 'pending' && p.targetDocumentId === documentId &&
               p.type === 'edit_block' && p.patchOldText && p.patchNewText
        )
        if (currentDocPatches.length > 0) {
          window.dispatchEvent(new CustomEvent('lemona:agent-diff-preview', {
            detail: {
              proposalId: currentDocPatches[0].id,
              documentId: documentId,
              fileName: currentDocPatches[0].fileName,
              oldText: currentDocPatches[0].patchOldText,
              newText: currentDocPatches[0].patchNewText,
              isPatch: true,
              patches: currentDocPatches.map(p => ({
                proposalId: p.id,
                oldText: p.patchOldText!,
                newText: p.patchNewText!,
              })),
            }
          }))
        }
      }
      let targetBlockInstruction = ''
      if (chatMode === 'agent') {
        const docs = await documentApi.list()
        projectScopedDocs = docs.filter((doc: Document) => {
          const sameProject = projectId ? doc.projectId === projectId : true
          return sameProject && doc.folder !== 'worldlab'
        })

        const currentDocBlocks = extractTextBlocksFromTipTap(effectiveDocumentContent)
        if (currentDocBlocks.length > 0) {
          const validIds = new Set(currentDocBlocks.map(block => block.id))
          let resolvedBlockIds: string[] = []
          let locateSource: 'llm' | 'heuristic' | 'none' = 'none'
          try {
            const listedBlocks = currentDocBlocks
              .slice(0, 220)
              .map(block => `- ${block.id} [${block.type}] ${block.text.slice(0, 180).replace(/\n/g, ' ')}`)
              .join('\n')

            const locatePrompt = `You are Step 1 (Locate target blocks) in a two-step editing agent.
From the BLOCKS list below, choose ALL block IDs that need to be modified to fulfill the user's request.
- Select only blocks whose content directly needs changing.
- If only one block needs editing, return an array with one element.
- If multiple blocks need editing, return all of them.
Return exactly one JSON block:
\`\`\`${AGENT_LOCATE_BLOCK_NAME}
{ "targetBlockIds": ["blk_x", "blk_y"], "reason": "short reason" }
\`\`\`

User request:
${userMessage.content}

BLOCKS:
${listedBlocks}`

            const locateResponse = await aiApi.streamChat(
              locatePrompt,
              effectiveDocumentContent,
              documentId,
              [],
              false,
              selectedModel,
              undefined,
              'Concise',
              projectId,
              undefined,
              googleApiKey,
              openaiApiKey
            )
            const locateContent = await readAssistantContentFromStream(locateResponse)
            resolvedBlockIds = parseLocatedBlockIds(locateContent, validIds)
            if (resolvedBlockIds.length > 0) {
              locateSource = 'llm'
            }
          } catch (locateError) {
            console.warn('[ChatInterface] Block locate step failed, falling back to heuristic:', locateError)
          }

          if (resolvedBlockIds.length === 0) {
            const heuristicId = chooseBlockByHeuristic(currentDocBlocks, userMessage.content)
            if (heuristicId) {
              resolvedBlockIds = [heuristicId]
              locateSource = 'heuristic'
            }
          }

          if (resolvedBlockIds.length > 0) {
            const blockSections: string[] = []
            for (let i = 0; i < resolvedBlockIds.length; i++) {
              const blockId = resolvedBlockIds[i]
              const blockIndex = currentDocBlocks.findIndex(b => b.id === blockId)
              const block = blockIndex >= 0 ? currentDocBlocks[blockIndex] : null
              if (!block) continue
              const headContext = currentDocBlocks[Math.max(0, blockIndex - 1)]?.text || ''
              const tailContext = currentDocBlocks[Math.min(currentDocBlocks.length - 1, blockIndex + 1)]?.text || ''
              blockSections.push(`Block ${i + 1}:
- targetBlockId: ${block.id}
- targetBlockType: ${block.type}
- targetBlockText:
${block.text}
- previousBlockText:
${headContext}
- nextBlockText:
${tailContext}`)
            }

            targetBlockInstruction = `\n\nTARGET_BLOCKS (Step 1 result — ${resolvedBlockIds.length} block${resolvedBlockIds.length > 1 ? 's' : ''}):

${blockSections.join('\n\n')}

Step 2 requirement:
- For EACH target block above, output one "edit_block" action with "targetBlockId", "oldContent" copied verbatim from that block's targetBlockText, and "newContent" as the replacement.
- If ${resolvedBlockIds.length} blocks are listed, output ${resolvedBlockIds.length} edit_block actions in the actions array.
- Include "targetBlockId" exactly matching the listed targetBlockId.
- Do NOT output multiple edit_block actions for the same targetBlockId.
- Do NOT use "edit_file" or rewrite the full document.
- Do NOT merge multiple blocks into one action.
- If the entire block needs replacing, oldContent = the full targetBlockText.
- "newContent" MUST preserve the same writing style and format as the original targetBlockText. If the original is prose paragraphs, write prose. Do NOT introduce markdown (bullets, headings, bold) unless the original already uses it. Write as a document author, not a chatbot.`
            logAgent('locate_resolved', {
              source: locateSource,
              blockIds: resolvedBlockIds,
              blockCount: resolvedBlockIds.length,
            })
          } else {
            logAgent('locate_unresolved', { blockCount: currentDocBlocks.length })
          }
        }
      }
      const contentForModel = chatMode === 'agent'
        ? `${AGENT_PROMPT_PREFIX}\n\n${buildAgentAvailableFilesContext(projectScopedDocs)}${targetBlockInstruction}${referencedSnippetsInstruction}\n\nUser request:\n${userMessage.content}`
        : `${userMessage.content}${referencedSnippetsInstruction}`
      const sourceTypes = parseIntegrationSourceMentions(userMessage.content || '')
      const response = await aiApi.streamChat(
        contentForModel,
        effectiveDocumentContent,
        documentId,
        chatHistoryForAPI,
        useWebSearch,
        selectedModel,
        effectiveAttachments.length > 0 ? effectiveAttachments : undefined,
        selectedStyle,
        projectId,
        sourceTypes,
        googleApiKey,
        openaiApiKey
      )
      const reader = response.body?.getReader()
      
      // Store reader reference for cancellation
      streamReaderRef.current = reader || null
      
      const decoder = new TextDecoder()
      const STREAM_UI_UPDATE_INTERVAL_MS = 80
      let lastAssistantUiUpdateAt = 0
      const flushAssistantMessageToUI = () => {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { ...assistantMessage }
          return updated
        })
        lastAssistantUiUpdateAt = Date.now()
      }

      // Scroll to bottom when stream starts
      setTimeout(() => {
        scrollToBottom()
      }, 100)

      // Save assistant message immediately (empty content, will be updated during streaming)
      await saveMessage(assistantMessage, true)

      if (reader) {
        try {
          while (true) {
            // Check if stream was cancelled
            if (isStreamCancelledRef.current || !streamReaderRef.current) {
              break
            }
            
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  // Check for error in stream data
                  if (data.error) {
                    throw new Error(data.error)
                  }
                  if (data.event && typeof data.event === 'object') {
                    const progressEvent = data.event as AgentProgressEvent
                    if (progressEvent.stepId && progressEvent.action && progressEvent.type) {
                      const isPatchProgressEvent = progressEvent.type.startsWith('agent_patch_')
                      if (!isPatchProgressEvent) {
                        upsertProgressEvent(assistantMessage.id, progressEvent)
                      }
                      if (!hasRecordedFirstFeedback && progressEvent.type !== 'agent_metrics') {
                        hasRecordedFirstFeedback = true
                        const firstFeedbackMs = Date.now() - requestStartedAt
                        console.info('[AgentUX] time_to_first_feedback_ms', firstFeedbackMs)
                      }
                      if (chatMode === 'agent' && progressEvent.type === 'agent_patch_finished') {
                        patchEventsSeen += 1
                        const maybeAction = progressEvent.meta?.action
                        if (maybeAction && typeof maybeAction === 'object') {
                          const streamedAction = maybeAction as AgentAction
                          if (streamedAction?.type) {
                            await appendAgentActionsAsProposals([streamedAction])
                          }
                        }
                      }
                      if (progressEvent.type === 'agent_patch_error') {
                        patchEventsSeen += 1
                        patchParseErrorCount += 1
                      }
                    }
                  }
                  if (data.chunk) {
                    // Check if this is a metadata chunk
                    if (data.chunk.includes('__METADATA__')) {
                      const metadataMatch = data.chunk.match(/__METADATA__(.*?)__METADATA__/)
                      if (metadataMatch) {
                        try {
                          const metadata = JSON.parse(metadataMatch[1])
                          assistantMessage.reasoningMetadata = metadata
                          setMessages(prev => {
                            const updated = [...prev]
                            updated[updated.length - 1] = { ...assistantMessage }
                            return updated
                          })
                        } catch (parseError) {
                          console.warn('Failed to parse metadata:', parseError)
                        }
                      }
                    } else {
                      assistantMessage.content += data.chunk
                      if (!hasRecordedFirstToken) {
                        hasRecordedFirstToken = true
                        const firstTokenMs = Date.now() - requestStartedAt
                        console.info('[AgentUX] time_to_first_token_ms', firstTokenMs)
                      }
                      const now = Date.now()
                      if (now - lastAssistantUiUpdateAt >= STREAM_UI_UPDATE_INTERVAL_MS) {
                        flushAssistantMessageToUI()
                      }
                      // Update message during streaming (debounced)
                      await saveMessage(assistantMessage, true)
                    }
                  }
                } catch (e) {
                  // If it's an error object, throw it to be caught by outer catch
                  if (e instanceof Error && e.message) {
                    throw e
                  }
                  // Otherwise ignore parse errors
                }
              }
            }
          }
        } catch (readError) {
          // Stream was cancelled or error occurred
          if (streamReaderRef.current && !isStreamCancelledRef.current) {
            // Only handle error if it wasn't a cancellation
            console.error('Error reading stream:', readError)
            // Re-throw to be caught by outer catch block for proper error display
            throw readError
          }
        }
        // Ensure the final streamed content is rendered immediately.
        if (!isStreamCancelledRef.current) {
          flushAssistantMessageToUI()
        }
      }

      // Parse and prepare agent-mode file actions before final save
      if (!isStreamCancelledRef.current && chatMode === 'agent' && assistantMessage.content.trim()) {
        try {
          const cleanedContent = assistantMessage.content
            .replace(new RegExp(`\`\`\`${AGENT_ACTION_BLOCK_NAME}\\s*[\\s\\S]*?\`\`\``, 'gi'), '')
            .trim()
          const actions = parseAllAgentActionBlocks(assistantMessage.content)
          if (actions && actions.length > 0) {
            const actionsWithIds = withStableActionIds(actions)
            assistantMessage.content = cleanedContent || 'Prepared file update proposal.'
            assistantMessage.reasoningMetadata = {
              ...assistantMessage.reasoningMetadata,
              agentActions: actionsWithIds,
            }
            logAgent('actions_parsed', {
              actionCount: actionsWithIds.length,
              actionTypes: actionsWithIds.slice(0, 6).map(action => action.type),
            })
            const fallbackActions = actionsWithIds.filter(action => !streamedActionSignatures.has(actionSignature(action)))
            await appendAgentActionsAsProposals(fallbackActions)
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = { ...assistantMessage }
              return updated
            })
          }
        } catch (proposalError) {
          console.warn('[ChatInterface] Failed to parse agent actions:', proposalError)
        }
      }

      if (!isStreamCancelledRef.current && chatMode === 'agent') {
        const avgPatchSizeChars = patchesEmittedBeforeStreamEnd > 0
          ? Math.round(totalPatchSizeChars / patchesEmittedBeforeStreamEnd)
          : 0
        console.info('[AgentUX] patches_emitted_before_stream_end', patchesEmittedBeforeStreamEnd)
        console.info('[AgentUX] patch_parse_error_rate', patchEventsSeen > 0 ? patchParseErrorCount / patchEventsSeen : 0)
        console.info('[AgentUX] avg_patch_size_chars', avgPatchSizeChars)
      }

      // Save final message when streaming completes (only if not cancelled)
      if (currentAssistantMessageIdRef.current && !isStreamCancelledRef.current) {
        await saveMessage(assistantMessage, false)
        currentAssistantMessageIdRef.current = null
      }
    } catch (error) {
      console.error('Chat error:', error)
      
      // Remove the empty assistant message if it exists
      setMessages(prev => {
        if (currentAssistantMessageIdRef.current) {
          return prev.filter(msg => msg.id !== currentAssistantMessageIdRef.current)
        }
        return prev
      })
      
      const friendlyError = formatErrorMessage(error)
      const errorMessage: AIChatMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: friendlyError, // formatErrorMessage already includes appropriate emoji
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && !last.content?.trim()) {
          return [...prev.slice(0, -1), { ...errorMessage, id: last.id }]
        }
        return [...prev, errorMessage]
      })
      
      // Save error message
      if (documentId && chatId) {
        await saveMessage(errorMessage, false)
      }
      
      // If it's an API key error or quota error, open settings modal
      const errorMsg = error instanceof Error ? error.message : String(error)
      const lowerErrorMsg = errorMsg.toLowerCase()
      if (lowerErrorMsg.includes('api key') || lowerErrorMsg.includes('not configured') || 
          lowerErrorMsg.includes('quota') || lowerErrorMsg.includes('429') || 
          lowerErrorMsg.includes('billing') || lowerErrorMsg.includes('no embedding api key')) {
        setTimeout(() => setShowSettingsModal(true), 500)
      }
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
      currentAssistantMessageIdRef.current = null
      streamReaderRef.current = null
      abortControllerRef.current = null
      isStreamCancelledRef.current = false
    }
  }

  return (
    <>
      <style>{`
        .ai-chat-ordered-list {
          list-style: none;
          counter-reset: list-counter;
          margin-bottom: 18px;
          padding-left: 20px;
          margin-top: 12px;
          color: ${textColor};
          line-height: 1.8;
          font-size: 14px;
        }
        .ai-chat-unordered-list ul,
        .ai-chat-ordered-list ol,
        .ai-chat-unordered-list ol,
        .ai-chat-ordered-list ul {
          padding-left: 16px;
          margin-top: 2px;
          margin-bottom: 4px;
        }
        .ai-chat-ordered-list > li {
          counter-increment: list-counter;
          position: relative;
          margin-bottom: 2px;
          line-height: 1.6;
          color: ${textColor};
          padding-left: 24px;
        }
        .ai-chat-ordered-list > li::before {
          content: counter(list-counter) '）';
          position: absolute;
          left: 0;
          font-weight: 500;
        }
        @keyframes thinkingPulse {
          0%, 60%, 100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          30% {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        textarea::placeholder {
          color: ${theme === 'dark' ? '#666666' : '#B8B8B8'};
          opacity: 1;
        }
        textarea::-webkit-input-placeholder {
          color: ${theme === 'dark' ? '#666666' : '#B8B8B8'};
          opacity: 1;
        }
        textarea::-moz-placeholder {
          color: ${theme === 'dark' ? '#666666' : '#B8B8B8'};
          opacity: 1;
        }
        textarea:-ms-input-placeholder {
          color: ${theme === 'dark' ? '#666666' : '#B8B8B8'};
          opacity: 1;
        }
      `}</style>
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: bgColor
      }}>
        <div 
          ref={scrollContainerRef}
          className={`scrollable-container ${theme === 'dark' ? 'dark-theme' : ''}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 0 14px 0',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: brighterBg,
            userSelect: 'text',
            WebkitUserSelect: 'text',
            MozUserSelect: 'text',
            msUserSelect: 'text'
          }}>
        {messages.map((message, index) => {
          const hasReasoningActions = Boolean(
            message.reasoningMetadata?.actions &&
            Object.keys(message.reasoningMetadata.actions).length > 0
          )
          const hasReasoningChain = Boolean(
            message.reasoningMetadata?.reasoningChain &&
            message.reasoningMetadata.reasoningChain.steps.length > 0
          )
          const hasReasoningSources = Boolean(
            message.reasoningMetadata?.dataSources &&
            message.reasoningMetadata.dataSources.length > 0
          )
          const hasReasoningMetadata = hasReasoningActions || hasReasoningChain || hasReasoningSources
          const progressEvents = (progressEventsByMessageId[message.id] || []).filter(event =>
            event.type !== 'agent_metrics' && !event.type.startsWith('agent_patch_')
          )
          const messageProposals = agentProposals.filter(proposal => proposal.messageId === message.id)
          const previousMessage = index > 0 ? messages[index - 1] : null
          const prevIsAssistant = previousMessage?.role === 'assistant'
          const isStreamingCurrentAssistantMessage =
            message.role === 'assistant' &&
            isStreaming &&
            currentAssistantMessageIdRef.current === message.id
          const prevAssistantHasDiffCard = Boolean(
            previousMessage &&
            previousMessage.role === 'assistant' &&
            agentProposals.some(proposal => proposal.messageId === previousMessage.id)
          )
          return (
          <div
            key={`${message.id}-${index}`}
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: message.role === 'assistant' ? '8px 16px' : '6px 16px',
              backgroundColor: brighterBg,
              marginTop: prevIsAssistant && message.role === 'user'
                ? (prevAssistantHasDiffCard ? '8px' : '0px')
                : undefined,
            }}
          >
            {message.role === 'user' && (
              <>
                {editingMessageId === message.id ? (
                  <div
                    ref={userMessageEditContainerRef}
                    style={{
                      marginLeft: 'auto',
                      width: inputContainerWidth ? `${inputContainerWidth}px` : '92%',
                      maxWidth: inputContainerWidth ? `${inputContainerWidth}px` : '92%',
                      marginTop: '8px',
                      position: 'relative',
                      borderRadius: '6px',
                      border: `1px solid ${theme === 'dark' ? '#4a4a4a' : '#d0d5dd'}`,
                      backgroundColor: brighterBg,
                    }}
                  >
                    <textarea
                      ref={userMessageEditTextareaRef}
                      value={editingMessageContent}
                      onChange={(event) => setEditingMessageContent(event.target.value)}
                      onBlur={handleUserEditBlur}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          if (editingMessageContent.trim()) {
                            void saveEditedUserMessage(message, true)
                          }
                        }
                      }}
                      rows={2}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: textColor,
                        padding: '8px 12px 40px 12px',
                        lineHeight: 1.7,
                        fontSize: '13px',
                        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
                        resize: 'vertical',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => void saveEditedUserMessage(message, true)}
                      disabled={!editingMessageContent.trim()}
                      style={{
                        position: 'absolute',
                        bottom: '8px',
                        right: '8px',
                        padding: '4px',
                        backgroundColor: !editingMessageContent.trim()
                          ? (theme === 'dark' ? '#282828' : '#e0e0e0')
                          : (theme === 'dark' ? '#3d3d3d' : '#e8e8e8'),
                        color: !editingMessageContent.trim()
                          ? secondaryTextColor
                          : (theme === 'dark' ? '#b0b0b0' : '#202124'),
                        border: 'none',
                        borderRadius: '6px',
                        cursor: !editingMessageContent.trim() ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: !editingMessageContent.trim() ? 0.5 : 1,
                        width: '24px',
                        height: '24px',
                      }}
                      title="Send"
                    >
                      <ArrowUpwardIcon style={{
                        fontSize: '19px',
                        transform: 'translateY(0px)',
                        color: !editingMessageContent.trim()
                          ? secondaryTextColor
                          : (theme === 'dark' ? '#b0b0b0' : '#5a5a5a')
                      }} />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      if (!isStreaming) {
                        startEditingMessage(message)
                      }
                    }}
                    style={{
                      marginLeft: 'auto',
                      width: inputContainerWidth ? `${inputContainerWidth}px` : '92%',
                      maxWidth: inputContainerWidth ? `${inputContainerWidth}px` : '92%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: userMessageBg,
                      color: textColor,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: '13px',
                      lineHeight: '1.7',
                      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
                      userSelect: 'text',
                      WebkitUserSelect: 'text',
                      MozUserSelect: 'text',
                      msUserSelect: 'text',
                      cursor: isStreaming ? 'text' : 'pointer',
                      WebkitFontSmoothing: 'antialiased',
                      MozOsxFontSmoothing: 'grayscale',
                      textRendering: 'optimizeLegibility'
                    }}
                    title={isStreaming ? undefined : 'Click to edit and resend'}
                  >
                    {highlightMentions(message.content)}
                    {message.attachments && message.attachments.length > 0 && (
                      <div style={{
                        marginTop: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}>
                        {message.attachments.map((att) => (
                          <div key={att.id} style={{
                            borderRadius: '6px',
                            overflow: 'hidden',
                            border: `1px solid ${theme === 'dark' ? '#313131' : '#DADCE0'}`,
                            width: '60px',
                            height: '60px',
                            flexShrink: 0
                          }}>
                            {att.type === 'image' ? (
                              <img
                                src={`data:${att.mimeType || 'image/png'};base64,${att.data}`}
                                alt={att.name}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  display: 'block',
                                  objectFit: 'cover'
                                }}
                              />
                            ) : (
                              <div style={{
                                padding: '4px',
                                backgroundColor: theme === 'dark' ? '#2d2d2d' : '#f5f5f5',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%',
                                width: '100%'
                              }}>
                                <PictureAsPdfIcon style={{ fontSize: '20px', color: theme === 'dark' ? '#d6d6d6' : '#202124', marginBottom: '2px' }} />
                                <span style={{
                                  fontSize: '8px',
                                  color: textColor,
                                  textAlign: 'center',
                                  wordBreak: 'break-word',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical'
                                }}>{att.name}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {message.role === 'assistant' && (
              <div
                style={{
                  width: '100%',
                  color: textColor,
                  fontSize: '13px',
                  lineHeight: '1.7',
                  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  MozUserSelect: 'text',
                  msUserSelect: 'text',
                  cursor: 'text',
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                  textRendering: 'optimizeLegibility'
                }}
              >
                {/* Agent progress: show only while waiting. Hide once content starts streaming. */}
                {!message.content.trim() && progressEvents.length > 0 && (
                  <div style={{ marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {progressEvents.map((event) => (
                      <div
                        key={`${message.id}-evt-${event.stepId}`}
                        style={{
                          fontSize: '11px',
                          lineHeight: 1.4,
                          padding: '0',
                          color: theme === 'dark' ? '#8a8a8a' : '#777b84',
                          opacity: 0.78,
                        }}
                      >
                        <span style={{ marginRight: '6px' }}>·</span>
                        <span style={{ fontWeight: 500 }}>
                          {stripTimingText(event.label) || `${event.action} ${event.status || ''}`.trim()}
                        </span>
                        {event.summary && <span style={{ marginLeft: '6px', opacity: 0.85 }}>{stripTimingText(event.summary)}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {chatMode === 'agent' &&
                  index === messages.length - 1 &&
                  message.role === 'assistant' &&
                  isStreaming &&
                  !message.content.trim() &&
                  !hasReasoningMetadata &&
                  progressEvents.length === 0 && (
                    <div style={{ fontSize: '12px', color: theme === 'dark' ? '#888888' : '#999999', marginBottom: '6px', opacity: 0.8 }}>
                      Thinking…
                    </div>
                )}
                {/* Show reasoning metadata if available */}
                {hasReasoningMetadata && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: theme === 'dark' ? '#888888' : '#999999',
                      marginBottom: '8px',
                      opacity: 0.7,
                      lineHeight: '1.4'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                    {hasReasoningActions && message.reasoningMetadata?.actions && Object.entries(message.reasoningMetadata.actions).map(([action, data], index, arr) => {
                      const actionKey = `${message.id}:${action}`
                      const isExpanded = expandedActions.has(actionKey)
                      const hasFiles = data.fileIds && data.fileIds.length > 0
                      
                      return (
                        <span key={action} style={{ marginRight: index < arr.length - 1 ? '12px' : '0' }}>
                          {hasFiles ? (
                            <>
                              <span
                                onClick={() => {
                                  setExpandedActions(prev => {
                                    const next = new Set(prev)
                                    if (next.has(actionKey)) {
                                      next.delete(actionKey)
                                    } else {
                                      next.add(actionKey)
                                    }
                                    return next
                                  })
                                }}
                                style={{
                                  cursor: 'pointer',
                                  userSelect: 'none',
                                  transition: 'color 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = theme === 'dark' ? '#aaaaaa' : '#666666'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = theme === 'dark' ? '#888888' : '#999999'
                                }}
                              >
                                {action} {data.fileCount > 0 ? `${data.fileCount} ${data.fileCount === 1 ? 'file' : 'files'}` : ''}
                              </span>
                              {isExpanded && data.fileIds && (
                                <div
                                  style={{
                                    marginTop: '4px',
                                    marginLeft: '8px',
                                    paddingLeft: '8px',
                                    borderLeft: `2px solid ${theme === 'dark' ? '#444444' : '#cccccc'}`,
                                    fontSize: '11px',
                                    opacity: 0.8
                                  }}
                                >
                                  {Array.from(new Set(data.fileIds)).map((fileId: string) => {
                                    ensureDocumentTitleLoaded(fileId)
                                    const displayTitle = getDisplayTitleForFile(fileId)
                                    return (
                                      <div key={fileId} style={{ marginTop: '2px' }}>
                                        {displayTitle}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </>
                          ) : (
                            <span>
                              {action} {data.fileCount > 0 ? `${data.fileCount} ${data.fileCount === 1 ? 'file' : 'files'}` : ''}
                            </span>
                          )}
                        </span>
                      )
                    })}
                    {hasReasoningChain && (
                      <span style={{ marginLeft: hasReasoningActions ? '10px' : '0' }}>
                        <span
                          onClick={() => {
                            setExpandedReasoningChains(prev => {
                              const next = new Set(prev)
                              if (next.has(message.id)) {
                                next.delete(message.id)
                              } else {
                                next.add(message.id)
                              }
                              return next
                            })
                          }}
                          style={{
                            cursor: 'pointer',
                            userSelect: 'none',
                            textDecoration: 'underline',
                          }}
                        >
                          {expandedReasoningChains.has(message.id) ? 'Hide trace' : 'View trace'}
                        </span>
                      </span>
                    )}
                      </div>
                      {editingMessageId !== message.id && !isStreaming && (
                        <button
                          onClick={() => startEditingMessage(message)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: theme === 'dark' ? '#bdbdbd' : '#5f6368',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            padding: 0,
                            flexShrink: 0,
                          }}
                          title="Edit conclusion"
                        >
                          <EditIcon style={{ fontSize: '13px' }} />
                          Edit
                        </button>
                      )}
                    </div>
                    {hasReasoningChain && expandedReasoningChains.has(message.id) && message.reasoningMetadata?.reasoningChain && (
                      <div
                        style={{
                          marginTop: '8px',
                          padding: '8px',
                          borderRadius: '6px',
                          border: `1px solid ${theme === 'dark' ? '#3a3a3a' : '#d9d9d9'}`,
                          backgroundColor: theme === 'dark' ? '#1f1f1f' : '#f8f9fb',
                        }}
                      >
                        {message.reasoningMetadata?.complexityLevel && (
                          <div style={{ marginBottom: '6px', opacity: 0.85 }}>
                            Complexity: {message.reasoningMetadata.complexityLevel}
                          </div>
                        )}
                        {message.reasoningMetadata?.complexityLevel === 'complex' && message.reasoningMetadata?.plan && message.reasoningMetadata.plan.length > 0 && (
                          <div style={{ marginBottom: '8px' }}>
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Plan</div>
                            {message.reasoningMetadata.plan.map((planStep, planIdx) => (
                              <div key={`${message.id}-plan-${planIdx}`} style={{ marginLeft: '8px', opacity: 0.85 }}>
                                Step {planIdx + 1}: {planStep.action}
                                {formatTraceQuery(planStep.query, planStep.action) ? ` - ${formatTraceQuery(planStep.query, planStep.action)}` : ''}
                              </div>
                            ))}
                          </div>
                        )}
                        {message.reasoningMetadata.reasoningChain.steps.map((step) => {
                          const steps = message.reasoningMetadata!.reasoningChain!.steps
                          const showStepNumber = steps.length > 1
                          return (
                          <div key={`${message.id}-step-${step.step}`} style={{ marginBottom: '8px' }}>
                            <div style={{ fontWeight: 600, color: theme === 'dark' ? '#b5c9ff' : '#3559b5' }}>
                              {showStepNumber ? `Step ${step.step}: ` : ''}{step.action.charAt(0).toUpperCase() + step.action.slice(1)}
                            </div>
                            {formatTraceQuery(step.query, step.action) && <div>Query: {formatTraceQuery(step.query, step.action)}</div>}
                            {typeof step.relevanceScore === 'number' && <div>Relevance: {step.relevanceScore.toFixed(3)}</div>}
                            {step.informationGap && <div>Gap: {step.informationGap}</div>}
                            {step.chunkRefs.length > 0 && (
                              <div style={{ marginTop: '4px', marginLeft: '8px' }}>
                                {Array.from(new Set(step.chunkRefs.map(ref => ref.fileId))).map((fileId) => {
                                  ensureDocumentTitleLoaded(fileId)
                                  return (
                                    <div key={`${message.id}-step-${step.step}-${fileId}`}>
                                      {getDisplayTitleForFile(fileId)}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                          )
                        })}
                        {message.reasoningMetadata.dataSources && message.reasoningMetadata.dataSources.length > 0 && (
                          <div style={{ marginTop: '8px' }}>
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Sources</div>
                            {message.reasoningMetadata.dataSources.slice(0, 6).map((source) => {
                              ensureDocumentTitleLoaded(source.fileId)
                              const sourceLabel = source.sourceName || source.sourceType
                              return (
                                <div key={`${message.id}-source-${source.chunkId}`} style={{ marginBottom: '6px' }}>
                                  <div>{getDisplayTitleForFile(source.fileId)}</div>
                                  {sourceLabel && (
                                    <div style={{ opacity: 0.65, fontSize: '11px' }}>
                                      {sourceLabel}
                                    </div>
                                  )}
                                  <div style={{ opacity: 0.8 }}>{source.excerpt}</div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  {message.editedByUser && (
                    <span
                      onClick={() => {
                        if (message.originalContent) {
                          setShowOriginalMessages(prev => {
                            const next = new Set(prev)
                            if (next.has(message.id)) {
                              next.delete(message.id)
                            } else {
                              next.add(message.id)
                            }
                            return next
                          })
                        }
                      }}
                      style={{
                        fontSize: '11px',
                        color: theme === 'dark' ? '#9bb0ff' : '#3559b5',
                        border: `1px solid ${theme === 'dark' ? '#3f4b73' : '#c3cef6'}`,
                        borderRadius: '10px',
                        padding: '1px 8px',
                        cursor: message.originalContent ? 'pointer' : 'default',
                      }}
                      title={message.originalContent ? (showOriginalMessages.has(message.id) ? 'Hide original' : 'View original') : undefined}
                    >
                      Edited
                    </span>
                  )}
                  {!hasReasoningMetadata && editingMessageId !== message.id && !isStreaming && (
                    <button
                      onClick={() => startEditingMessage(message)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: theme === 'dark' ? '#bdbdbd' : '#5f6368',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        padding: 0,
                        marginLeft: 'auto',
                      }}
                      title="Edit conclusion"
                    >
                      <EditIcon style={{ fontSize: '13px' }} />
                      Edit
                    </button>
                  )}
                </div>
                {showOriginalMessages.has(message.id) && message.originalContent && (
                  <div style={{
                    marginBottom: '8px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: `1px solid ${theme === 'dark' ? '#474747' : '#d5d5d5'}`,
                    backgroundColor: theme === 'dark' ? '#222222' : '#f3f4f6',
                    fontSize: '12px',
                    opacity: 0.9,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {message.originalContent}
                  </div>
                )}
                {editingMessageId === message.id ? (
                  <div
                    style={{
                      marginBottom: '8px',
                      position: 'relative',
                      borderRadius: '6px',
                      border: `1px solid ${theme === 'dark' ? '#4a4a4a' : '#d0d5dd'}`,
                      backgroundColor: brighterBg,
                    }}
                  >
                    <textarea
                      ref={assistantMessageEditTextareaRef}
                      value={editingMessageContent}
                      onChange={(event) => setEditingMessageContent(event.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          void saveEditedAssistantMessage(message)
                        }
                      }}
                      rows={10}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: textColor,
                        padding: '8px 60px 40px 12px',
                        lineHeight: 1.7,
                        fontSize: '13px',
                        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
                        resize: 'vertical',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => void saveEditedAssistantMessage(message)}
                      style={{
                        position: 'absolute',
                        bottom: '8px',
                        right: '36px',
                        padding: '4px',
                        backgroundColor: theme === 'dark' ? '#1f3b23' : '#e8f5e9',
                        color: theme === 'dark' ? '#a4dba8' : '#2e7d32',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                      }}
                      title="Save"
                    >
                      <CheckIcon style={{ fontSize: '18px' }} />
                    </button>
                    <button
                      onClick={cancelEditingMessage}
                      style={{
                        position: 'absolute',
                        bottom: '8px',
                        right: '8px',
                        padding: '4px',
                        backgroundColor: theme === 'dark' ? '#3a2323' : '#ffebee',
                        color: theme === 'dark' ? '#ef9a9a' : '#c62828',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                      }}
                      title="Cancel"
                    >
                      <CloseIcon style={{ fontSize: '18px' }} />
                    </button>
                  </div>
                ) : (() => {
                  const contentLower = message.content.toLowerCase()
                  const isError = contentLower.includes('api quota exceeded') ||
                    contentLower.includes('rate limit exceeded') ||
                    contentLower.includes('connection error') ||
                    contentLower.includes('invalid api key') ||
                    contentLower.includes('api key is required') ||
                    contentLower.includes('model unavailable') ||
                    contentLower.includes('server error') ||
                    contentLower.includes('unable to process') ||
                    contentLower.includes('error code:') ||
                    contentLower.includes('status:')
                  return isError
                })() ? (
                  <div
                    style={{
                      padding: '14px 18px',
                      backgroundColor: theme === 'dark' ? '#3a1f1f' : '#fce8e6',
                      borderRadius: '6px',
                      border: `1px solid ${theme === 'dark' ? '#5a2f2f' : '#f28b82'}`,
                      color: theme === 'dark' ? '#ff6b6b' : '#c5221f',
                      fontSize: '13px',
                      lineHeight: '1.7',
                      fontWeight: 400,
                      boxShadow: theme === 'dark' 
                        ? '0 2px 8px rgba(255, 107, 107, 0.15)' 
                        : '0 2px 8px rgba(197, 34, 31, 0.1)',
                    }}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({node, ...props}) => <p style={{ 
                          marginBottom: '10px', 
                          marginTop: 0, 
                          lineHeight: '1.7', 
                          color: 'inherit',
                          fontSize: '13px'
                        }} {...props} />,
                        a: ({node, ...props}: any) => <a 
                          style={{ 
                            color: theme === 'dark' ? '#4a9eff' : '#1a73e8',
                            textDecoration: 'underline',
                            fontWeight: 500
                          }} 
                          {...props} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        />,
                        ul: ({node, ...props}) => <ul style={{ 
                          marginTop: '8px', 
                          marginBottom: '8px', 
                          paddingLeft: '10px' 
                        }} {...props} />,
                        li: ({node, ...props}) => <li style={{ 
                          marginBottom: '6px',
                          lineHeight: '1.6',
                          paddingLeft: '4px'
                        }} {...props} />,
                        strong: ({node, ...props}) => <strong style={{ 
                          fontWeight: 600,
                          color: 'inherit'
                        }} {...props} />,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    // Headers - professional, subtle hierarchy
                    h1: ({node, ...props}) => <h1 style={{ 
                      fontSize: '20px', 
                      fontWeight: 600, 
                      marginTop: hasReasoningMetadata ? '16px' : '28px', 
                      marginBottom: '14px', 
                      color: textColor, 
                      lineHeight: '1.4',
                      letterSpacing: '-0.01em'
                    }} {...props} />,
                    h2: ({node, ...props}) => <h2 style={{ 
                      fontSize: '17px', 
                      fontWeight: 600, 
                      marginTop: hasReasoningMetadata ? '14px' : '24px', 
                      marginBottom: '12px', 
                      color: textColor, 
                      lineHeight: '1.4',
                      letterSpacing: '-0.005em'
                    }} {...props} />,
                    h3: ({node, ...props}) => <h3 style={{ 
                      fontSize: '15px', 
                      fontWeight: 600, 
                      marginTop: hasReasoningMetadata ? '12px' : '20px', 
                      marginBottom: '10px', 
                      color: textColor, 
                      lineHeight: '1.4'
                    }} {...props} />,
                    h4: ({node, ...props}) => <h4 style={{ 
                      fontSize: '14px', 
                      fontWeight: 600, 
                      marginTop: hasReasoningMetadata ? '10px' : '18px', 
                      marginBottom: '8px', 
                      color: textColor, 
                      lineHeight: '1.4'
                    }} {...props} />,
                    h5: ({node, ...props}) => <h5 style={{ 
                      fontSize: '14px', 
                      fontWeight: 600, 
                      marginTop: hasReasoningMetadata ? '8px' : '16px', 
                      marginBottom: '8px', 
                      color: textColor, 
                      lineHeight: '1.4'
                    }} {...props} />,
                    h6: ({node, ...props}) => <h6 style={{ 
                      fontSize: '13px', 
                      fontWeight: 600, 
                      marginTop: hasReasoningMetadata ? '8px' : '14px', 
                      marginBottom: '6px', 
                      color: textColor, 
                      lineHeight: '1.4'
                    }} {...props} />,
                    // Paragraphs - professional spacing
                    p: ({node, ...props}) => <p style={{ 
                      marginBottom: '14px', 
                      marginTop: 0, 
                      lineHeight: '1.7', 
                      color: textColor,
                      fontSize: '13px'
                    }} {...props} />,
                    // Code blocks - handle inline code with subtle styling
                    code: ({node, inline, className, children, ...props}: any) => {
                      if (inline) {
                        return <code style={{ 
                          backgroundColor: theme === 'dark' ? '#2a2a2a' : '#f5f5f5', 
                          padding: '2px 5px', 
                          borderRadius: '3px', 
                          fontSize: '13px',
                          fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
                          color: theme === 'dark' ? '#d4a574' : '#8b4513',
                          fontWeight: 400
                        }} {...props}>{children}</code>
                      }
                      // For code blocks, return the code element as-is (will be wrapped in pre)
                      return <code className={className}>{children}</code>
                    },
                    // Pre component handles code blocks
                    pre: ({children}: any) => {
                      // Extract code from children (which is a code element)
                      const codeProps = (children as any)?.props || {}
                      const codeElement = codeProps.children
                      const className = codeProps.className || ''
                      const match = /language-(\w+)/.exec(className || '')
                      const language = match ? match[1] : ''
                      const codeString = String(codeElement || '').replace(/\n$/, '')
                      // Create a stable ID based on message ID and code content hash
                      const codeHash = codeString.split('').reduce((acc, char) => {
                        const hash = ((acc << 5) - acc) + char.charCodeAt(0)
                        return hash & hash
                      }, 0)
                      const blockId = `${message.id}-${codeHash}-${codeString.length}`
                      const isCopied = copiedCodeBlocks.has(blockId)
                      
                      if (['latex', 'tex', 'katex', 'math'].includes(language.toLowerCase())) {
                        return (
                          <div style={{
                            position: 'relative',
                            marginTop: '18px',
                            marginBottom: '18px',
                            padding: '14px',
                            backgroundColor: theme === 'dark' ? '#1a1a1a' : '#fafafa',
                            borderRadius: '4px',
                            border: `1px solid ${theme === 'dark' ? '#2a2a2a' : '#e5e5e5'}`,
                            overflowX: 'auto',
                            maxWidth: '100%',
                          }}
                          >
                            <button
                              onClick={() => handleCopyCode(codeString, blockId)}
                              style={{
                                position: 'absolute',
                                top: '6px',
                                right: '10px',
                                zIndex: 2,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 6px',
                                backgroundColor: 'transparent',
                                border: 'none',
                                color: theme === 'dark' ? '#999999' : '#666666',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontFamily: 'inherit',
                                transition: 'all 0.2s ease',
                                borderRadius: '3px',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'
                                e.currentTarget.style.color = theme === 'dark' ? '#cccccc' : '#333333'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent'
                                e.currentTarget.style.color = theme === 'dark' ? '#999999' : '#666666'
                              }}
                            >
                              {isCopied ? (
                                <>
                                  <CheckIcon style={{ fontSize: '14px' }} />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <ContentCopyIcon style={{ fontSize: '14px' }} />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                            <div
                              dangerouslySetInnerHTML={{
                                __html: katex.renderToString(codeString.trim(), {
                                  displayMode: true,
                                  throwOnError: false,
                                }),
                              }}
                            />
                          </div>
                        )
                      }

                      return (
                        <div style={{
                          position: 'relative',
                          marginTop: '18px',
                          marginBottom: '18px',
                          width: '100%',
                          maxWidth: '100%',
                          boxSizing: 'border-box'
                        }}>
                          <div style={{
                            position: 'relative',
                            backgroundColor: theme === 'dark' ? '#1a1a1a' : '#fafafa',
                            borderRadius: '4px',
                            border: `1px solid ${theme === 'dark' ? '#2a2a2a' : '#e5e5e5'}`,
                            overflowX: 'hidden',
                            overflowY: 'visible',
                            width: '100%',
                            maxWidth: '100%',
                            boxSizing: 'border-box'
                          }}>
                            {/* Language name overlay - top left */}
                            <div style={{
                              position: 'absolute',
                              top: '6px',
                              left: '10px',
                              zIndex: 2,
                              fontSize: '10px',
                              color: theme === 'dark' ? '#666666' : '#999999',
                              fontWeight: 500,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              pointerEvents: 'none',
                              opacity: 0.7
                            }}>
                              {language || 'text'}
                            </div>
                            {/* Copy button overlay - top right */}
                            <button
                              onClick={() => handleCopyCode(codeString, blockId)}
                              style={{
                                position: 'absolute',
                                top: '6px',
                                right: '10px',
                                zIndex: 2,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 6px',
                                backgroundColor: 'transparent',
                                border: 'none',
                                color: theme === 'dark' ? '#999999' : '#666666',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontFamily: 'inherit',
                                transition: 'all 0.2s ease',
                                borderRadius: '3px'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'
                                e.currentTarget.style.color = theme === 'dark' ? '#cccccc' : '#333333'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent'
                                e.currentTarget.style.color = theme === 'dark' ? '#999999' : '#666666'
                              }}
                            >
                              {isCopied ? (
                                <>
                                  <CheckIcon style={{ fontSize: '14px' }} />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <ContentCopyIcon style={{ fontSize: '14px' }} />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                            {/* Code content */}
                            <div style={{
                              width: '100%',
                              maxWidth: '100%',
                              maxHeight: '200px',
                              overflow: 'auto',
                              overflowX: 'hidden',
                              scrollBehavior: isStreamingCurrentAssistantMessage ? 'auto' : 'smooth'
                            }}
                            ref={(el) => {
                              if (!el || !isStreamingCurrentAssistantMessage) return
                              requestAnimationFrame(() => {
                                if (!isStreamingCurrentAssistantMessage) return
                                el.scrollTop = el.scrollHeight
                              })
                            }}>
                              <SyntaxHighlighter
                                language={language || 'text'}
                                style={theme === 'dark' ? vscDarkPlus : vs}
                                customStyle={{
                                  margin: 0,
                                  padding: '14px',
                                  paddingTop: '36px',
                                  fontSize: '13px',
                                  lineHeight: '1.6',
                                  fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
                                  backgroundColor: 'transparent',
                                  borderRadius: '4px',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  overflow: 'visible',
                                  overflowX: 'hidden',
                                  overflowY: 'visible',
                                  width: '100%',
                                  maxWidth: '100%',
                                  boxSizing: 'border-box',
                                  display: 'block',
                                  color: theme === 'dark' ? '#e0e0e0' : '#1a1a1a'
                                }}
                                PreTag="div"
                                codeTagProps={{
                                  style: {
                                    display: 'block',
                                    width: '100%',
                                    maxWidth: '100%',
                                    overflow: 'visible',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    boxSizing: 'border-box',
                                    color: theme === 'dark' ? '#e0e0e0' : '#1a1a1a'
                                  }
                                }}
                              >
                                {codeString}
                              </SyntaxHighlighter>
                            </div>
                          </div>
                        </div>
                      )
                    },
                    // Lists - professional, subtle styling
                    ul: ({node, ...props}: any) => <ul className="ai-chat-unordered-list" style={{ 
                      marginBottom: '14px', 
                      paddingLeft: '20px', 
                      marginTop: '8px', 
                      listStyleType: 'disc',
                      color: textColor,
                      lineHeight: '1.7',
                      fontSize: '13px'
                    }} {...props} />,
                    ol: ({node, ...props}: any) => {
                      // Use custom counter style for Chinese parentheses format (1) 2) 3)...)
                      return <ol className="ai-chat-ordered-list" style={{
                        marginBottom: '14px',
                        paddingLeft: '20px',
                        marginTop: '8px',
                        color: textColor,
                        lineHeight: '1.7',
                        fontSize: '13px'
                      }} {...props} />
                    },
                    li: ({node, ...props}: any) => <li style={{ 
                      marginBottom: '4px', 
                      lineHeight: '1.7', 
                      color: textColor,
                      paddingLeft: '4px'
                    }} {...props} />,
                    // Links - subtle, professional styling
                    a: ({node, ...props}: any) => <a 
                      style={{ 
                        color: theme === 'dark' ? '#5ba3ff' : '#1967d2', 
                        textDecoration: 'underline',
                        textDecorationColor: theme === 'dark' ? 'rgba(91, 163, 255, 0.4)' : 'rgba(25, 103, 210, 0.4)',
                        textUnderlineOffset: '2px',
                        transition: 'color 0.2s ease'
                      }} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = theme === 'dark' ? '#6eb3ff' : '#1557b8'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = theme === 'dark' ? '#5ba3ff' : '#1967d2'
                      }}
                      {...props} 
                    />,
                    // Blockquotes - subtle, professional styling
                    blockquote: ({node, ...props}) => <blockquote style={{
                      borderLeft: `3px solid ${theme === 'dark' ? '#4a4a4a' : '#d0d0d0'}`,
                      paddingLeft: '18px',
                      paddingRight: '16px',
                      paddingTop: '6px',
                      paddingBottom: '6px',
                      marginLeft: 0,
                      marginRight: 0,
                      marginTop: '14px',
                      marginBottom: '14px',
                      backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                      color: textColor,
                      fontStyle: 'normal',
                      borderRadius: '0 3px 3px 0',
                      fontSize: '13px'
                    }} {...props} />,
                    // Horizontal rule - subtle divider
                    hr: ({node, ...props}) => <hr style={{ 
                      border: 'none', 
                      borderTop: `1px solid ${theme === 'dark' ? '#3a3a3a' : '#e5e5e5'}`, 
                      margin: '20px 0',
                      opacity: 0.5
                    }} {...props} />,
                    // Tables - professional, subtle styling
                    table: ({node, ...props}) => <div style={{ 
                      overflowX: 'auto', 
                      marginBottom: '16px', 
                      marginTop: '12px',
                      borderRadius: '4px',
                      border: `1px solid ${theme === 'dark' ? '#2a2a2a' : '#e0e0e0'}`,
                      backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff',
                      overflow: 'hidden'
                    }}>
                      <table style={{ 
                        borderCollapse: 'collapse', 
                        width: '100%',
                        fontSize: '14px'
                      }} {...props} />
                    </div>,
                    thead: ({node, ...props}) => <thead style={{ 
                      backgroundColor: theme === 'dark' ? '#222222' : '#f8f8f8',
                      borderBottom: `1px solid ${theme === 'dark' ? '#2a2a2a' : '#e0e0e0'}`
                    }} {...props} />,
                    tbody: ({node, ...props}) => <tbody {...props} />,
                    th: ({node, ...props}) => <th style={{ 
                      border: `1px solid ${theme === 'dark' ? '#2a2a2a' : '#e0e0e0'}`, 
                      padding: '10px 14px', 
                      textAlign: 'left',
                      fontWeight: 600,
                      fontSize: '13px',
                      color: theme === 'dark' ? '#d0d0d0' : '#333333',
                      backgroundColor: theme === 'dark' ? '#222222' : '#f8f8f8',
                      letterSpacing: '0.005em'
                    }} {...props} />,
                    td: ({node, ...props}) => <td style={{ 
                      border: `1px solid ${theme === 'dark' ? '#2a2a2a' : '#e0e0e0'}`, 
                      padding: '10px 14px',
                      fontSize: '14px',
                      color: textColor,
                      lineHeight: '1.6',
                      backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff'
                    }} {...props} />,
                    // Strong and emphasis - professional, subtle emphasis
                    strong: ({node, ...props}) => <strong style={{ 
                      fontWeight: 600,
                      color: textColor,
                      fontSize: '14px'
                    }} {...props} />,
                    em: ({node, ...props}) => <em style={{ 
                      fontStyle: 'italic',
                      color: textColor,
                      fontWeight: 400
                    }} {...props} />,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
                )}
                {messageProposals.length > 0 && (
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {messageProposals.map((proposal) => {
                      const isClickable = proposal.status === 'pending' && !!proposal.targetDocumentId
                      return (
                      <div
                        key={proposal.id}
                        onClick={() => isClickable && openAndFocusProposalDiff(proposal)}
                        style={{
                          border: `1px solid ${theme === 'dark' ? '#2d2d2d' : '#dadce0'}`,
                          borderRadius: '6px',
                          overflow: 'hidden',
                          backgroundColor: theme === 'dark' ? '#171717' : '#fff',
                          cursor: isClickable ? 'pointer' : 'default',
                          opacity: proposal.status === 'pending' ? 1 : 0.65,
                        }}
                      >
                        <div style={{
                          padding: '6px 8px',
                          fontSize: '11px',
                          color: secondaryTextColor,
                          borderBottom: `1px solid ${theme === 'dark' ? '#2a2a2a' : '#eceff1'}`,
                          position: 'relative',
                          paddingRight: '70px'
                        }}>
                          {proposal.type === 'create_file' ? `Create ${proposal.fileName}` : `Edit ${proposal.fileName}`}
                          {proposal.status === 'pending' ? (
                            <div style={{
                              position: 'absolute',
                              top: '6px',
                              right: '10px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation()
                                  rejectAgentProposal(proposal.id)
                                }}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: theme === 'dark' ? '#fca5a5' : '#b91c1c',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  padding: 0
                                }}
                                title="Refuse"
                              >
                                <CloseIcon style={{ fontSize: '12px' }} />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void applyAgentProposal(proposal.id)
                                }}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: theme === 'dark' ? '#86efac' : '#166534',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  padding: 0
                                }}
                                title="Accept"
                              >
                                <CheckIcon style={{ fontSize: '12px' }} />
                              </button>
                            </div>
                          ) : (
                            <span style={{
                              position: 'absolute',
                              top: '6px',
                              right: '8px',
                              fontSize: '10px',
                              lineHeight: 1.2,
                              color: proposal.status === 'error'
                                ? (theme === 'dark' ? '#fca5a5' : '#b91c1c')
                                : secondaryTextColor,
                              textTransform: 'capitalize'
                            }}>
                              {proposal.status === 'error' ? (proposal.error || 'error') : proposal.status}
                            </span>
                          )}
                        </div>
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{ maxHeight: '80px', overflowY: 'auto', overflowX: 'hidden', fontSize: '11px', lineHeight: 1.4 }}
                        >
                          {(() => {
                            const showOld = proposal.patchOldText || proposal.oldText
                            const showNew = proposal.patchNewText || proposal.content
                            return (
                              <>
                                {showOld && (
                                  <pre style={{
                                    margin: 0,
                                    padding: '6px 8px',
                                    backgroundColor: theme === 'dark' ? 'rgba(239,68,68,0.14)' : 'rgba(254,226,226,0.9)',
                                    color: theme === 'dark' ? '#fca5a5' : '#991b1b',
                                    whiteSpace: 'pre-wrap',
                                    borderBottom: `1px solid ${theme === 'dark' ? '#3a1f1f' : '#fecaca'}`
                                  }}>
                                    {showOld}
                                  </pre>
                                )}
                                <pre style={{
                                  margin: 0,
                                  padding: '6px 8px',
                                  backgroundColor: theme === 'dark' ? 'rgba(34,197,94,0.14)' : 'rgba(220,252,231,0.9)',
                                  color: theme === 'dark' ? '#86efac' : '#166534',
                                  whiteSpace: 'pre-wrap'
                                }}>
                                  {showNew}
                                </pre>
                              </>
                            )
                          })()}
                        </div>
                        {proposal.status === 'needs_target' && proposal.candidateTargets && proposal.candidateTargets.length > 0 && (
                          <div style={{
                            padding: '6px 8px',
                            borderTop: `1px solid ${theme === 'dark' ? '#2a2a2a' : '#eceff1'}`,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}>
                            <span style={{ fontSize: '11px', color: secondaryTextColor }}>Select target file:</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {proposal.candidateTargets.map((candidate) => (
                                <button
                                  key={candidate.documentId}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void selectAgentProposalTarget(proposal.id, candidate.documentId)
                                  }}
                                  style={{
                                    border: `1px solid ${borderColor}`,
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    background: 'transparent',
                                    color: textColor,
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {candidate.title}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )})}
                  </div>
                )}
              </div>
            )}
          </div>
          )
        })}
        <div
          ref={messagesEndRef}
          style={{
            marginBottom: (() => {
              const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
              const lastAssistantHasDiffCard = Boolean(
                lastMessage &&
                lastMessage.role === 'assistant' &&
                agentProposals.some(proposal => proposal.messageId === lastMessage.id)
              )
              return lastAssistantHasDiffCard ? '6px' : '0'
            })()
          }}
        />
      </div>
      
      {/* Input Container - Unified Container */}
      <div 
        ref={inputContainerRef}
        style={{
          padding: '6px 14px 12px 14px',
          backgroundColor: brighterBg
        }}>
        {agentProposals.some(p => p.status === 'pending' || p.status === 'needs_target') && (
          <div style={{
            marginBottom: '8px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '6px',
            marginRight: '16px'
          }}>
            <button
              onClick={handleUndoAllProposals}
              style={{
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                color: secondaryTextColor,
                padding: '2px 6px',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Undo All
            </button>
            <button
              onClick={() => void handleKeepAllProposals()}
              disabled={!agentProposals.some(p => p.status === 'pending')}
              style={{
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                color: secondaryTextColor,
                padding: '2px 6px',
                fontSize: '11px',
                fontWeight: 500,
                cursor: agentProposals.some(p => p.status === 'pending') ? 'pointer' : 'not-allowed',
                opacity: agentProposals.some(p => p.status === 'pending') ? 1 : 0.55
              }}
            >
              Keep All
            </button>
          </div>
        )}
        {/* Attachments Preview */}
        {attachments.length > 0 && (
          <div style={{
            marginBottom: '8px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            {attachments.map((att) => (
              <div
                key={att.id}
                style={{
                  position: 'relative',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: `1px solid ${borderColor}`,
                  backgroundColor: theme === 'dark' ? '#1d1d1d' : '#f8f8f8',
                  width: '60px',
                  height: '60px',
                  flexShrink: 0
                }}
              >
                {att.type === 'image' ? (
                  <img
                    src={`data:${att.mimeType || 'image/png'};base64,${att.data}`}
                    alt={att.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block'
                    }}
                  />
                ) : (
                  <div style={{
                    padding: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    width: '100%'
                  }}>
                    <PictureAsPdfIcon style={{ fontSize: '20px', color: theme === 'dark' ? '#d6d6d6' : '#202124', marginBottom: '2px' }} />
                    <span style={{
                      fontSize: '8px',
                      color: textColor,
                      textAlign: 'center',
                      wordBreak: 'break-word',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}>
                      {att.name}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => handleRemoveAttachment(att.id)}
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    padding: '2px',
                    border: 'none',
                    borderRadius: '50%',
                    backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.9)',
                    color: textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '20px',
                    height: '20px',
                    transition: 'background-color 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.9)'
                  }}
                >
                  <CloseIcon style={{ fontSize: '14px' }} />
                </button>
              </div>
            ))}
          </div>
        )}
        
        {/* Unified Container - Text input and buttons together */}
        <div 
          ref={unifiedContainerRef}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{
            padding: '4px 6px',
            backgroundColor: inputBg,
            borderRadius: '6px',
            border: `1px solid ${isInputFocused ? (theme === 'dark' ? '#3a3a3a' : '#DADCE0') : borderColor}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            transition: 'border-color 0.2s',
            position: 'relative'
          }}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          

              {/* Text Input Section - On Top */}
              <div style={{ position: 'relative', width: '100%' }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  const cursorPosition = e.target.selectionStart
                  detectMention(e.target.value, cursorPosition)
                }}
                onFocus={() => {
                  setIsInputFocused(true)
                  if (textareaRef.current) {
                    const cursorPosition = textareaRef.current.selectionStart
                    detectMention(textareaRef.current.value, cursorPosition)
                  }
                }}
                onBlur={(e) => {
                  // Don't hide dropdown if clicking on it
                  if (mentionDropdownRef.current?.contains(e.relatedTarget as Node)) {
                    return
                  }
                  setIsInputFocused(false)
                  // Exit mention mode explicitly on blur
                  if (isInMentionMode) {
                    exitMentionMode()
                  }
                }}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  // Handle mention autocomplete navigation
                  if (showMentionDropdown) {
                    const mentions = getFilteredMentions()
                    
                    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && showMentionDropdown)) {
                      e.preventDefault()
                      const selectedMention = mentions[selectedMentionIndex] || mentions[0]
                      if (selectedMention) {
                        insertMention(selectedMention)
                      }
                      return
                    }
                    
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      const newIndex = selectedMentionIndex < mentions.length - 1 ? selectedMentionIndex + 1 : 0
                      setSelectedMentionIndex(newIndex)
                      return
                    }
                    
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      const newIndex = selectedMentionIndex > 0 ? selectedMentionIndex - 1 : mentions.length - 1
                      setSelectedMentionIndex(newIndex)
                      return
                    }
                    
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      exitMentionMode()
                      return
                    }
                  }
                  
                  // Handle Backspace to delete entire mention at once
                  if (e.key === 'Backspace' && textareaRef.current) {
                    // If user selected a range, let native deletion remove the whole selection.
                    if (textareaRef.current.selectionStart !== textareaRef.current.selectionEnd) {
                      return
                    }
                    const cursorPosition = textareaRef.current.selectionStart
                    const text = textareaRef.current.value
                    
                    // Find if cursor is within a mention
                    const mentionRegex = /@\s*(Library|[^\s@]+)/g
                    let match
                    mentionRegex.lastIndex = 0
                    const projectFolderMentions = getFilteredMentions()
                      .filter(item => item.type === 'folder')
                      .map(item => item.name)
                    
                    while ((match = mentionRegex.exec(text)) !== null) {
                      const mentionName = match[1]
                      const mentionNameNormalized = mentionName.toLowerCase()
                      const isLibrary = mentionName === 'Library'
                      const isIntegration = mentionNameNormalized === 'integration'
                        || SUPPORTED_INTEGRATION_SOURCE_TYPES.includes(mentionNameNormalized as IntegrationSource['sourceType'])
                      const mentionStart = match.index
                      let mentionEnd = match.index + match[0].length
                      
                      // Check if this is a prefix of a document title (like "file" -> "file (2).pdf")
                      if (!isLibrary && !isIntegration) {
                        const textAfterMention = text.slice(mentionEnd)
                        
                        // Find documents that start with the mention name (case-insensitive)
                        // Search in both workspace files and library files (if indexed)
                        const allMentionableDocs = isLibraryIndexed 
                          ? [...libraryDocuments, ...allDocuments.filter(doc => isUploadedFile(doc) && doc.projectId === projectId)]
                          : libraryDocuments
                        const potentialDocs = allMentionableDocs.filter(doc => {
                          const docTitle = doc.title
                          return docTitle.toLowerCase().startsWith(mentionName.toLowerCase())
                        })
                        
                        // Check if any of the following text completes a document title
                        for (const doc of potentialDocs) {
                          const remainingTitle = doc.title.slice(mentionName.length)
                          
                          // Check if the text after the mention starts with the remaining title
                          if (remainingTitle && textAfterMention.startsWith(remainingTitle)) {
                            mentionEnd = mentionStart + 1 + doc.title.length // +1 for @
                            break
                          }
                        }

                        if (mentionEnd === match.index + match[0].length) {
                          for (const folderName of projectFolderMentions) {
                            if (!folderName.toLowerCase().startsWith(mentionName.toLowerCase())) continue
                            const remainingFolder = folderName.slice(mentionName.length)
                            if (remainingFolder && textAfterMention.startsWith(remainingFolder)) {
                              mentionEnd = mentionStart + 1 + folderName.length
                              break
                            }
                          }
                        }
                      }
                      
                      // Include trailing line range like " (12-24)" in mention boundaries.
                      const trailingLineRange = text.slice(mentionEnd).match(/^ \(\d+-\d+\)/)
                      if (trailingLineRange) {
                        mentionEnd += trailingLineRange[0].length
                      }

                      const textAfterHighlight = text.slice(mentionEnd)
                      const isFollowedBySpaceOrEnd = textAfterHighlight.length === 0 || /^\s/.test(textAfterHighlight)
                      const allMentionableDocs = isLibraryIndexed
                        ? [...libraryDocuments, ...allDocuments.filter(doc => isUploadedFile(doc) && doc.projectId === projectId)]
                        : libraryDocuments
                      const exactDocMatch = allMentionableDocs.some(doc => doc.title === mentionName || doc.id === mentionName)
                      const exactFolderMatch = projectFolderMentions.some(folderName => folderName === mentionName)
                      const isConfirmedMention = isFollowedBySpaceOrEnd && (isLibrary || isIntegration || exactFolderMatch || exactDocMatch)
                      if (!isConfirmedMention) {
                        continue
                      }

                      // Check if cursor is at the start, end, or within the mention
                      // Also check if cursor is right after the mention (to delete it)
                      if (cursorPosition >= mentionStart && cursorPosition <= mentionEnd + 1) {
                        e.preventDefault()
                        
                        // Check if there's a space after the mention and include it in deletion
                        let deleteEnd = mentionEnd
                        if (text[mentionEnd] === ' ') {
                          deleteEnd = mentionEnd + 1
                        }
                        
                        // Delete the entire mention (including @ symbol, full name, and trailing space if present)
                        const newValue = text.slice(0, mentionStart) + text.slice(deleteEnd)
                        setInput(newValue)
                        
                        // Set cursor position where the mention was and check if we should exit mention mode
                        setTimeout(() => {
                          if (textareaRef.current) {
                            textareaRef.current.setSelectionRange(mentionStart, mentionStart)
                            textareaRef.current.focus()
                            // Check if we should exit mention mode after deletion
                            detectMention(newValue, mentionStart)
                          }
                        }, 0)
                        return
                      }
                    }
                  }
                  
                  if (e.key === 'Enter' && !e.shiftKey && !showMentionDropdown) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Type your message"
                disabled={isLoading}
                rows={1}
                className={`scrollable-container ${theme === 'dark' ? 'dark-theme' : ''}`}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  fontSize: '13px',
                  outline: 'none',
                  color: textColor, // Keep text visible for proper cursor alignment
                  resize: 'none',
                  overflowY: 'hidden',
                  overflowX: 'hidden',
                  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
                  lineHeight: '1.6',
                  minHeight: '24px',
                  maxHeight: '200px',
                  caretColor: textColor, // Keep caret visible
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word'
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  const scrollHeight = target.scrollHeight
                  const newHeight = Math.min(scrollHeight, 200)
                  target.style.height = `${newHeight}px`
                  // Only show scrollbar when content exceeds maxHeight
                  if (scrollHeight > 200) {
                    target.style.overflowY = 'auto'
                  } else {
                    target.style.overflowY = 'hidden'
                  }
                }}
              />
          
          {/* Persistent Mention Highlighting Overlay - Backgrounds only */}
          {input && (() => {
            const mentionRegex = /@\s*(Library|[^\s@]+)/g
            const highlights: Array<{ start: number, end: number, text: string, isLibrary: boolean, isFile: boolean, isFolder: boolean, isIntegration: boolean }> = []
            let match
            const projectFolderMentions = getFilteredMentions()
              .filter(item => item.type === 'folder')
              .map(item => item.name)
            
            mentionRegex.lastIndex = 0
            while ((match = mentionRegex.exec(input)) !== null) {
              const mentionName = match[1]
              const isLibrary = mentionName === 'Library'
              const mentionNameNormalized = mentionName.toLowerCase()
              const isIntegration = mentionNameNormalized === 'integration'
                || SUPPORTED_INTEGRATION_SOURCE_TYPES.includes(mentionNameNormalized as IntegrationSource['sourceType'])
              
              // Check for exact match first in both workspace files and library files (if indexed)
              const allMentionableDocs = isLibraryIndexed 
                ? [...libraryDocuments, ...allDocuments.filter(doc => doc.folder === 'library' && doc.projectId === projectId)]
                : libraryDocuments
              let matchedDoc = allMentionableDocs.find(doc => doc.title === mentionName || doc.id === mentionName)
              let matchedFolder = projectFolderMentions.find(folder => folder === mentionName)
              let highlightEnd = match.index + match[0].length
              let highlightText = match[0]
              
              // If no exact match, check if this is a prefix of any document title
              // and if the following text matches the rest of the document name
              if (!matchedDoc && !isLibrary) {
                const mentionStart = match.index
                const textAfterMention = input.slice(highlightEnd)
                
                // Find documents that start with the mention name (case-insensitive)
                const potentialDocs = allMentionableDocs.filter(doc => {
                  const docTitle = doc.title
                  return docTitle.toLowerCase().startsWith(mentionName.toLowerCase())
                })
                
                // Check if any of the following text completes a document title
                for (const doc of potentialDocs) {
                  const remainingTitle = doc.title.slice(mentionName.length)
                  
                  // Check if the text after the mention starts with the remaining title
                  if (remainingTitle && textAfterMention.startsWith(remainingTitle)) {
                    matchedDoc = doc
                    highlightEnd = mentionStart + 1 + doc.title.length // +1 for @
                    highlightText = '@' + doc.title
                    break
                  }
                }

                if (!matchedDoc && !matchedFolder) {
                  for (const folderName of projectFolderMentions) {
                    if (!folderName.toLowerCase().startsWith(mentionName.toLowerCase())) continue
                    const remainingFolder = folderName.slice(mentionName.length)
                    if (remainingFolder && textAfterMention.startsWith(remainingFolder)) {
                      matchedFolder = folderName
                      highlightEnd = mentionStart + 1 + folderName.length
                      highlightText = '@' + folderName
                      break
                    }
                  }
                }
              }
              
              const isFile = !!matchedDoc || (!isLibrary && !isIntegration && allMentionableDocs.some(doc => doc.title === mentionName || doc.id === mentionName))
              const isFolder = !!matchedFolder
              
              // Include trailing line range like " (12-24)" in highlighted mention.
              const trailingLineRange = input.slice(highlightEnd).match(/^ \(\d+-\d+\)/)
              if (trailingLineRange) {
                highlightEnd += trailingLineRange[0].length
                highlightText += trailingLineRange[0]
              }

              // Only highlight if the mention is complete (followed by whitespace or at end) AND matches a valid document
              // A mention is complete/confirmed when:
              // 1. It's followed by whitespace (space/newline/tab) or is at the end of the input
              // 2. AND it matches a valid document (Library or a matched file)
              const textAfterHighlight = input.slice(highlightEnd)
              const isFollowedBySpaceOrEnd = textAfterHighlight.length === 0 || /^\s/.test(textAfterHighlight)
              const matchesValidDocument = isLibrary || isIntegration || !!matchedDoc || !!matchedFolder
              const isComplete = isFollowedBySpaceOrEnd && matchesValidDocument
              
              // Only add highlight if mention is complete/confirmed
              if (isComplete) {
                highlights.push({
                  start: match.index,
                  end: highlightEnd,
                  text: highlightText,
                  isLibrary,
                  isFile,
                  isFolder,
                  isIntegration,
                })
              }
            }
            
            if (highlights.length === 0) return null
            
            return (
              <div
                ref={mentionOverlayRef}
                style={{
                  position: 'absolute',
                  pointerEvents: 'none',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  padding: '4px 6px',
                  fontSize: '13px',
                  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                  wordWrap: 'break-word',
                  overflowY: 'hidden',
                  overflowX: 'hidden',
                  zIndex: 1,
                  color: 'transparent' // Make all text transparent
                }}
              >
                {/* Render text with highlights matching textarea layout */}
                {(() => {
                  const parts: React.ReactNode[] = []
                  let lastIndex = 0
                  
                  highlights.forEach((highlight) => {
                    // Add text before highlight
                    if (highlight.start > lastIndex) {
                      parts.push(input.slice(lastIndex, highlight.start))
                    }
                    
                    // Add highlighted mention (no horizontal padding to avoid covering next character)
                    parts.push(
                      <span
                        key={`hl-${highlight.start}`}
                        style={{
                          backgroundColor: theme === 'dark' 
                            ? (highlight.isLibrary ? '#2d4a5c' : highlight.isFolder ? '#2f3f2f' : highlight.isFile ? '#3d2d4a' : '#3d3d3d')
                            : (highlight.isLibrary ? '#e8f0fe' : highlight.isIntegration ? '#fff1d6' : highlight.isFolder ? '#e8f5e9' : highlight.isFile ? '#e3f2fd' : '#f1f3f4'),
                          color: theme === 'dark' ? '#ffffff' : textColor, // Normal text color
                          borderRadius: '3px',
                          fontWeight: 'normal', // Same weight as regular text
                          padding: '2px 0', // Only vertical padding to avoid covering adjacent characters
                          display: 'inline',
                          maxWidth: '100%',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                          boxDecorationBreak: 'clone' as any
                        }}
                      >
                        {highlight.text}
                      </span>
                    )
                    
                    lastIndex = highlight.end
                  })
                  
                  // Add remaining text
                  if (lastIndex < input.length) {
                    parts.push(input.slice(lastIndex))
                  }
                  
                  return parts.length > 0 ? <>{parts}</> : input
                })()}
              </div>
            )
          })()}
          
          {/* Mention Autocomplete Dropdown */}
          {showMentionDropdown && textareaRef.current && (() => {
            const mentions = getFilteredMentions()
            if (mentions.length === 0) return null
            
            // Calculate dropdown position - show ABOVE the @ symbol using fixed positioning
            const textarea = textareaRef.current
            const textareaRect = textarea.getBoundingClientRect()
            
            // Find the @ symbol position
            const textBeforeCursor = textarea.value.slice(0, textarea.selectionStart)
            const lastAtIndex = textBeforeCursor.lastIndexOf('@')
            
            if (lastAtIndex === -1) return null
            
            // Get text before @ on the current line
            const textBeforeAt = textBeforeCursor.slice(0, lastAtIndex)
            const lines = textBeforeAt.split('\n')
            const currentLine = lines.length - 1
            const lineStart = textBeforeAt.lastIndexOf('\n') + 1
            const textOnCurrentLineBeforeAt = textBeforeAt.slice(lineStart)
            
            // Create a temporary span to measure text width up to @ symbol
            const tempSpan = document.createElement('span')
            tempSpan.style.visibility = 'hidden'
            tempSpan.style.position = 'absolute'
            tempSpan.style.fontSize = '12px'
            tempSpan.style.fontFamily = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", "Helvetica Neue", Arial, sans-serif'
            tempSpan.style.whiteSpace = 'pre'
            tempSpan.style.lineHeight = '1.6'
            tempSpan.textContent = textOnCurrentLineBeforeAt
            document.body.appendChild(tempSpan)
            const textWidthToAt = tempSpan.offsetWidth
            document.body.removeChild(tempSpan)
            
            // Calculate line height (approximate, matching textarea line-height: 1.6)
            const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20.8
            
            // Calculate the @ symbol position relative to viewport
            // Top of the line containing @ (accounting for textarea padding-top: 4px)
            const lineTop = textareaRect.top + 4 + (currentLine * lineHeight)
            // Left position of @ symbol (accounting for textarea padding-left: 6px)
            const atLeft = textareaRect.left + 6 + textWidthToAt
            
            // Position dropdown right above the @ symbol
            let dropdownTop = lineTop - 4 // 4px gap above
            let dropdownLeft = atLeft
            let positionAbove = true // Track if we're positioning above or below
            
            // Ensure dropdown doesn't go off-screen (basic bounds checking)
            const dropdownHeight = 180 // maxHeight
            if (dropdownTop - dropdownHeight < 0) {
              // If dropdown would go above viewport, position it below instead
              dropdownTop = lineTop + lineHeight + 4
              positionAbove = false
            }
            
            // Ensure dropdown doesn't go off right edge
            const dropdownWidth = 220 // maxWidth
            if (dropdownLeft + dropdownWidth > window.innerWidth) {
              dropdownLeft = window.innerWidth - dropdownWidth - 10 // 10px margin from edge
            }
            
            // Ensure dropdown doesn't go off left edge
            if (dropdownLeft < 10) {
              dropdownLeft = 10
            }
            
            // Match model dropdown design
            const dropdownBg = theme === 'dark' ? '#1e1e1e' : '#ffffff'
            const dropdownBorder = theme === 'dark' ? '#333' : '#e0e0e0'
            const dropdownShadow = theme === 'dark'
              ? '0 -4px 16px rgba(0, 0, 0, 0.5), 0 -2px 4px rgba(0, 0, 0, 0.3)'
              : '0 -4px 16px rgba(0, 0, 0, 0.2), 0 -2px 4px rgba(0, 0, 0, 0.1)'
            const itemHoverBg = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
            const itemSelectedBg = theme === 'dark' ? '#2d2d2d' : '#e8e8e8'
            const textColor = theme === 'dark' ? '#d6d6d6' : '#202124'
            const textColorSelected = theme === 'dark' ? '#ffffff' : '#202124'
            
            return (
              <div
                ref={mentionDropdownRef}
                style={{
                  position: 'fixed',
                  top: `${dropdownTop}px`,
                  left: `${dropdownLeft}px`,
                  backgroundColor: dropdownBg,
                  border: `1px solid ${dropdownBorder}`,
                  borderRadius: '8px',
                  boxShadow: dropdownShadow,
                  minWidth: '160px',
                  maxWidth: '220px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  zIndex: 10000,
                  padding: '4px',
                  marginBottom: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1px',
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  transform: positionAbove ? 'translateY(-100%)' : 'none' // Position above or below based on available space
                }}
                onMouseDown={(e) => e.preventDefault()} // Prevent textarea blur
              >
                {mentions.map((mention, index) => {
                  const isSelected = index === selectedMentionIndex
                  // Display text without @ symbol in the menu
                  const displayText = mention.type === 'library' ? 'Library'
                    : mention.name
                  
                  return (
                    <div
                      key={`${mention.type}:${mention.id || mention.name}`}
                      data-mention-index={index}
                      onClick={() => {
                        insertMention(mention)
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? itemSelectedBg : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'background-color 0.1s ease',
                        border: 'none',
                        width: '100%',
                        textAlign: 'left'
                      }}
                      onMouseEnter={(e) => {
                        setSelectedMentionIndex(index)
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = itemHoverBg
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      {/* Icon */}
                      <div style={{
                        width: '14px',
                        height: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {mention.type === 'library' || mention.type === 'folder' ? (
                          <FolderIcon style={{ fontSize: '14px', color: theme === 'dark' ? '#9aa0a6' : '#5f6368' }} />
                        ) : mention.type === 'integration' ? (
                          <AlternateEmailIcon style={{ fontSize: '14px', color: theme === 'dark' ? '#9aa0a6' : '#5f6368' }} />
                        ) : mention.fileType === 'pdf' ? (
                          <PictureAsPdfIcon style={{ fontSize: '14px', color: theme === 'dark' ? '#9aa0a6' : '#5f6368' }} />
                        ) : (
                          <InsertDriveFileOutlinedIcon style={{ fontSize: '14px', color: theme === 'dark' ? '#9aa0a6' : '#5f6368' }} />
                        )}
                      </div>
                      
                      {/* Text - Single line, no description */}
                      <div style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                        <div style={{
                          fontSize: '12px',
                          fontWeight: '400',
                          color: isSelected ? textColorSelected : textColor,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          lineHeight: '1.4'
                        }}>
                          {displayText}
                        </div>
                      </div>
                      
                    </div>
                  )
                })}
              </div>
            )
          })()}
              </div>
          
          {/* Bottom Controls Section */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '6px'
          }}>
            {/* Left side - Plus button and Web search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '1px' }}>
              {/* Plus Button */}
              <div style={{ position: 'relative' }}>
                <button
                  ref={plusButtonRef}
                  onClick={() => {
                    setShowPlusMenu(!showPlusMenu)
                    setShowModelDropdown(false)
                  }}
                  disabled={isLoading}
                  style={{
                    padding: '2px',
                    backgroundColor: 'transparent',
                    color: secondaryTextColor,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                    opacity: isLoading ? 0.5 : 1,
                    width: '24px',
                    height: '24px'
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.color = theme === 'dark' ? '#d6d6d6' : '#5a5a5a'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.color = secondaryTextColor
                    }
                  }}
                  title="More options"
                >
                  <AddIcon style={{ fontSize: '21px', transform: 'translateY(-1px)' }} />
                </button>
                
                {/* Plus Menu Dropup */}
                {showPlusMenu && (
                  <div
                    ref={plusMenuRef}
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: 0,
                      marginBottom: '4px',
                      backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
                      borderRadius: '6px',
                      padding: '6px',
                      minWidth: '180px',
                      boxShadow: theme === 'dark'
                        ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)'
                        : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
                      zIndex: 10001,
                      border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Upload files */}
                    <button
                      onClick={() => {
                        fileInputRef.current?.click()
                        setShowPlusMenu(false)
                      }}
                      disabled={isLoading}
                      style={{
                        padding: '10px 14px',
                        backgroundColor: 'transparent',
                        color: textColor,
                        border: 'none',
                        borderRadius: '6px',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        fontWeight: '400',
                        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        opacity: isLoading ? 0.5 : 1,
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                      onMouseEnter={(e) => {
                        if (!isLoading) {
                          e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isLoading) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      <AttachFileIcon style={{ fontSize: '16px', color: textColor }} />
                      <span>Upload files</span>
                    </button>
                    
                    {/* Web search */}
                    <button
                      onClick={() => {
                        setUseWebSearch(!useWebSearch)
                        setShowPlusMenu(false)
                      }}
                      disabled={isLoading}
                      style={{
                        padding: '10px 14px',
                        backgroundColor: useWebSearch 
                          ? (theme === 'dark' ? '#2d2d2d' : '#F0F0ED') 
                          : 'transparent',
                        color: textColor,
                        border: 'none',
                        borderRadius: '6px',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        fontWeight: '400',
                        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        opacity: isLoading ? 0.5 : 1,
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}
                      onMouseEnter={(e) => {
                        if (!isLoading) {
                          e.currentTarget.style.backgroundColor = useWebSearch
                            ? (theme === 'dark' ? '#2d2d2d' : '#F0F0ED')
                            : (theme === 'dark' ? '#2a2a2a' : '#f5f5f5')
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isLoading) {
                          e.currentTarget.style.backgroundColor = useWebSearch 
                            ? (theme === 'dark' ? '#2d2d2d' : '#F0F0ED') 
                            : 'transparent'
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span 
                          className="material-symbols-outlined"
                          style={{
                            fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24",
                            fontSize: '16px',
                            color: textColor
                          }}
                        >
                          language
                        </span>
                        <span>Web search</span>
                      </div>
                    </button>
                    
                    {/* Use style */}
                    <div style={{ position: 'relative' }}>
                      <button
                        ref={styleButtonRef}
                        disabled={isLoading}
                        onMouseEnter={() => {
                          if (!isLoading) {
                            setShowStyleMenu(true)
                          }
                        }}
                        onMouseLeave={(e) => {
                          // Don't close if mouse is moving to style menu
                          const relatedTarget = e.relatedTarget as Node
                          if (
                            styleMenuRef.current &&
                            !styleMenuRef.current.contains(relatedTarget) &&
                            relatedTarget !== styleMenuRef.current
                          ) {
                            setShowStyleMenu(false)
                          }
                        }}
                        style={{
                          padding: '10px 14px',
                          backgroundColor: showStyleMenu ? (theme === 'dark' ? '#2a2a2a' : '#f5f5f5') : 'transparent',
                          color: textColor,
                          border: 'none',
                          borderRadius: '6px',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          fontWeight: '400',
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          textAlign: 'left',
                          transition: 'all 0.15s',
                          opacity: isLoading ? 0.5 : 1,
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <FormatQuoteIcon style={{ fontSize: '16px', color: textColor }} />
                          <span>Use style</span>
                        </div>
                        <KeyboardArrowDownIcon style={{ fontSize: '16px', transform: 'rotate(-90deg)', color: textColor }} />
                      </button>
                      
                      {/* Style Submenu */}
                      {showStyleMenu && (
                        <>
                          {/* Invisible bridge to prevent gap */}
                          <div
                            onMouseEnter={() => setShowStyleMenu(true)}
                            style={{
                              position: 'absolute',
                              left: '100%',
                              bottom: 0,
                              width: '4px',
                              height: '100%',
                              zIndex: 10001,
                              backgroundColor: 'transparent'
                            }}
                          />
                          <div
                            ref={styleMenuRef}
                            onMouseEnter={() => setShowStyleMenu(true)}
                            onMouseLeave={() => setShowStyleMenu(false)}
                            style={{
                              position: 'absolute',
                              left: '100%',
                              bottom: 0,
                              marginLeft: '4px',
                              backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
                              borderRadius: '6px',
                              padding: '6px',
                              minWidth: '160px',
                              boxShadow: theme === 'dark'
                                ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)'
                                : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
                              zIndex: 10002,
                              border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(['Normal', 'Learning', 'Concise', 'Explanatory', 'Formal'] as const).map((style) => (
                              <button
                                key={style}
                                onClick={() => {
                                  setSelectedStyle(style)
                                  setShowStyleMenu(false)
                                  setShowPlusMenu(false)
                                }}
                                disabled={isLoading}
                                style={{
                                  padding: '10px 14px',
                                  backgroundColor: selectedStyle === style 
                                    ? (theme === 'dark' ? '#2a2a2a' : '#f5f5f5') 
                                    : 'transparent',
                                  color: textColor,
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: isLoading ? 'not-allowed' : 'pointer',
                                  fontSize: '12px',
                                  fontWeight: '400',
                                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                  textAlign: 'left',
                                  transition: 'all 0.15s',
                                  opacity: isLoading ? 0.5 : 1,
                                  width: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '12px'
                                }}
                                onMouseEnter={(e) => {
                                  if (!isLoading && selectedStyle !== style) {
                                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#f5f5f5'
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isLoading) {
                                    e.currentTarget.style.backgroundColor = selectedStyle === style
                                      ? (theme === 'dark' ? '#2a2a2a' : '#f5f5f5')
                                      : 'transparent'
                                  }
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <FormatQuoteIcon style={{ fontSize: '16px', color: textColor }} />
                                  <span>{style}</span>
                                </div>
                                {selectedStyle === style && (
                                  <CheckIcon style={{ fontSize: '18px', color: textColor }} />
                                )}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Web Search Button */}
              <button
                onClick={() => setUseWebSearch(!useWebSearch)}
                disabled={isLoading}
                style={{
                  padding: '2px',
                  backgroundColor: useWebSearch ? (theme === 'dark' ? '#2d2d2d' : '#f0f0f0') : 'transparent',
                  color: useWebSearch ? (theme === 'dark' ? '#d6d6d6' : '#5a5a5a') : secondaryTextColor,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s',
                  opacity: isLoading ? 0.5 : 1,
                  width: '24px',
                  height: '24px'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2d2d2d' : '#e8e8e8'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = useWebSearch 
                        ? (theme === 'dark' ? '#2d2d2d' : '#f0f0f0')
                        : 'transparent'
                  }
                }}
                title={useWebSearch ? "Web search enabled - AI can search the internet" : "Enable web search"}
              >
                <span 
                  className="material-symbols-outlined"
                  style={{
                    fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24",
                    fontSize: '17px'
                  }}
                >
                  language
                </span>
              </button>

              {/* Ask/Agent mode button */}
              <button
                onClick={() => setChatMode(chatMode === 'ask' ? 'agent' : 'ask')}
                disabled={isLoading}
                style={{
                  padding: '0px 11px',
                  backgroundColor: theme === 'dark' ? '#282828' : '#f1f3f5',
                  color: theme === 'dark' ? '#aaaaaf' : '#4b5057',
                  border: 'none',
                  borderRadius: '999px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  fontWeight: '400',
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s',
                  opacity: isLoading ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2d2d2d' : '#eaedf1'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#282828' : '#f1f3f5'
                  }
                }}
                title={chatMode === 'ask' ? 'Ask mode: no file actions (click for Agent)' : 'Agent mode: propose file edits (click for Ask)'}
              >
                <span style={{paddingRight: '1px'}}>
                  {chatMode === 'ask' ? 'Ask' : 'Agent'}
                </span>
              </button>
            </div>
            
            {/* Right side - Model name and Send button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Model name container */}
              <div style={{ position: 'relative' }}>
                <button
                  ref={modelNameRef}
                  onClick={() => {
                    setShowModelDropdown(!showModelDropdown)
                    setShowSettingsModal(false)
                    setShowPlusMenu(false)
                  }}
                  disabled={isLoading}
                  style={{
                    padding: '2px',
                    backgroundColor: 'transparent',
                    color: secondaryTextColor,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                    opacity: isLoading ? 0.5 : 1,
                    fontSize: '11px',
                    fontWeight: '400',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    gap: '4px'
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.color = theme === 'dark' ? '#d6d6d6' : '#5a5a5a'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.color = secondaryTextColor
                    }
                  }}
                  title={shortModelLabel}
                >
                  <span>{shortModelLabel}</span>
                  <KeyboardArrowDownIcon style={{ fontSize: '14px' }} />
                </button>
                
                {/* Model Dropdown Menu */}
                {showModelDropdown && (
                  <div
                    ref={modelDropdownRef}
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      right: 0,
                      marginBottom: '4px',
                      backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
                      borderRadius: '6px',
                      padding: '6px',
                      minWidth: '240px',
                      boxShadow: theme === 'dark'
                        ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)'
                        : '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
                      zIndex: 10001,
                      border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {hasGoogleKeyConfigured && (
                      <>
                        <div style={{ padding: '6px 10px', fontSize: '11px', color: secondaryTextColor }}>Gemini</div>
                        {[
                          { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
                          { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
                        ].map(option => {
                          const active = effectiveProviderType === 'builtin-gemini' && selectedModel === option.id
                          return (
                            <button
                              key={option.id}
                              onClick={() => {
                                if (isLoading) return
                                void (async () => {
                                  await setActiveProviders({ chatProviderId: 'builtin-gemini' })
                                  setSelectedModel(option.id)
                                  setShowModelDropdown(false)
                                })()
                              }}
                              disabled={isLoading}
                              style={{
                                padding: '10px 14px',
                                backgroundColor: active ? (theme === 'dark' ? '#232323' : '#F0F0ED') : 'transparent',
                                color: textColor,
                                border: 'none',
                                borderRadius: '6px',
                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                textAlign: 'left',
                                width: '100%',
                                opacity: isLoading ? 0.6 : 1,
                              }}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </>
                    )}

                    {hasOpenaiKeyConfigured && (
                      <>
                        <div style={{ padding: '6px 10px', fontSize: '11px', color: secondaryTextColor, marginTop: 4 }}>OpenAI</div>
                        {[
                          { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
                          { id: 'gpt-5-mini', label: 'GPT-5 Mini' },
                          { id: 'gpt-5.2', label: 'GPT-5.2' },
                        ].map(option => {
                          const active = effectiveProviderType === 'builtin-openai' && selectedModel === option.id
                          return (
                            <button
                              key={option.id}
                              onClick={() => {
                                if (isLoading) return
                                void (async () => {
                                  await setActiveProviders({ chatProviderId: 'builtin-openai' })
                                  setSelectedModel(option.id)
                                  setShowModelDropdown(false)
                                })()
                              }}
                              disabled={isLoading}
                              style={{
                                padding: '10px 14px',
                                backgroundColor: active ? (theme === 'dark' ? '#232323' : '#F0F0ED') : 'transparent',
                                color: textColor,
                                border: 'none',
                                borderRadius: '6px',
                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                textAlign: 'left',
                                width: '100%',
                                opacity: isLoading ? 0.6 : 1,
                              }}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </>
                    )}

                    {customChatProfiles.length > 0 && (
                      <>
                        <div style={{ padding: '6px 10px', fontSize: '11px', color: secondaryTextColor, marginTop: 4 }}>Custom Endpoints</div>
                        {customChatProfiles.map(profile => {
                          const model = profile.chatModel || 'model'
                          const active = aiProviderState?.activeChatProviderId === profile.id
                          return (
                            <button
                              key={profile.id}
                              onClick={() => {
                                if (isLoading) return
                                void (async () => {
                                  await setActiveProviders({ chatProviderId: profile.id })
                                  setSelectedModel(model)
                                  setShowModelDropdown(false)
                                })()
                              }}
                              disabled={isLoading}
                              style={{
                                padding: '10px 14px',
                                backgroundColor: active ? (theme === 'dark' ? '#232323' : '#F0F0ED') : 'transparent',
                                color: textColor,
                                border: 'none',
                                borderRadius: '6px',
                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                fontSize: '12px',
                                textAlign: 'left',
                                width: '100%',
                                opacity: isLoading ? 0.6 : 1,
                              }}
                            >
                              {profile.name} · {model}
                            </button>
                          )
                        })}
                      </>
                    )}

                    <div style={{
                      height: '1px',
                      backgroundColor: theme === 'dark' ? '#333' : '#e0e0e0',
                      margin: '6px 0'
                    }} />
                    <button
                      onClick={() => {
                        setShowModelDropdown(false)
                        setShowSettingsModal(true)
                      }}
                      disabled={isLoading}
                      style={{
                        padding: '10px 14px',
                        backgroundColor: 'transparent',
                        color: textColor,
                        border: 'none',
                        borderRadius: '6px',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        textAlign: 'left',
                        width: '100%',
                        opacity: isLoading ? 0.5 : 1,
                      }}
                    >
                      API Keys
                    </button>
                  </div>
                )}
              </div>
              
              {/* Send/Stop button with grey container */}
              <button
                onClick={() => { void handleSend() }}
                disabled={!isLoading && (!input.trim() && attachments.length === 0)}
                style={{
                  padding: '4px 8px',
                  backgroundColor: isLoading 
                    ? (theme === 'dark' ? '#3d3d3d' : '#e8e8e8')
                    : ((!input.trim() && attachments.length === 0) 
                      ? (theme === 'dark' ? '#282828' : '#e0e0e0')
                      : (theme === 'dark' ? '#3d3d3d' : '#e8e8e8')),
                  color: isLoading 
                    ? (theme === 'dark' ? '#b0b0b0' : '#202124')
                    : ((!input.trim() && attachments.length === 0) 
                      ? secondaryTextColor 
                      : (theme === 'dark' ? '#b0b0b0' : '#202124')),
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (!isLoading && (!input.trim() && attachments.length === 0)) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: (!isLoading && (!input.trim() && attachments.length === 0)) ? 0.5 : 1,
                  width: '24px',
                  height: '24px'
                }}
                onMouseEnter={(e) => {
                  if (isLoading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#484848' : '#f0f0f0'
                  } else if (!isLoading && (input.trim() || attachments.length > 0)) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#484848' : '#f0f0f0'
                  } else if (!isLoading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#282828' : '#e0e0e0'
                  }
                }}
                onMouseLeave={(e) => {
                  if (isLoading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#3d3d3d' : '#e8e8e8'
                  } else if (!isLoading && (input.trim() || attachments.length > 0)) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#3d3d3d' : '#e8e8e8'
                  } else if (!isLoading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#282828' : '#e0e0e0'
                  }
                }}
                title={isLoading ? "Stop generation" : "Send"}
              >
                {isLoading ? (
                  <StopIcon style={{ 
                    fontSize: '19px', 
                    transform: 'translateY(0px)', 
                    color: theme === 'dark' ? '#b0b0b0' : '#202124'
                  }} />
                ) : (
                  <ArrowUpwardIcon style={{ 
                    fontSize: '19px', 
                    transform: 'translateY(0px)', 
                    color: (!input.trim() && attachments.length === 0) 
                      ? secondaryTextColor 
                      : (theme === 'dark' ? '#b0b0b0' : '#5a5a5a')
                  }} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div
          ref={modalRef}
          style={{
            position: 'fixed',
            top: `${modalPosition.top}px`,
            ...(modalPosition.right !== undefined 
              ? { right: `${modalPosition.right}px`, left: undefined }
              : { left: `${modalPosition.left || 0}px` }
            ),
            backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff',
            borderRadius: '6px',
            padding: '20px',
            minWidth: '390px',
            maxWidth: '490px',
            boxShadow: theme === 'dark'
              ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)'
              : '0 8px 32px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1)',
            zIndex: 10000,
            border: `1px solid ${theme === 'dark' ? '#333' : '#e0e0e0'}`,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            transform: 'translateY(-100%)',
            marginTop: '-8px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={() => setShowSettingsModal(false)}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              padding: '4px',
              backgroundColor: 'transparent',
              border: 'none',
              color: theme === 'dark' ? '#999' : '#666',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              width: '24px',
              height: '24px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2a2a2a' : '#f1f3f4'
              e.currentTarget.style.color = theme === 'dark' ? '#fff' : '#202124'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = theme === 'dark' ? '#999' : '#666'
            }}
            title="Close"
          >
            ✕
          </button>

          {/* API Keys heading */}
          <h2
            style={{
              fontSize: '14px',
              fontWeight: '500',
              color: theme === 'dark' ? '#e0e0e0' : '#202124',
              margin: '0 0 20px 0',
            }}
          >
            API Keys
          </h2>

          {/* OpenAI API Key section */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: '400',
                color: theme === 'dark' ? '#b0b0b0' : '#777',
                marginBottom: '8px',
              }}
            >
              OpenAI API Key
            </label>
            <p
              style={{
                fontSize: '12px',
                color: theme === 'dark' ? '#999' : '#666',
                margin: '0 0 12px 0',
                lineHeight: '1.5',
              }}
            >
              Put your{' '}
              <a
                href="https://platform.openai.com/api-keys"
                onClick={(e) => {
                  e.preventDefault()
                  const url = 'https://platform.openai.com/api-keys'
                  // Check if running in Electron
                  const isElectron = typeof window !== 'undefined' && window.electron !== undefined
                  if (isElectron && window.electron) {
                    // Open in external browser via IPC
                    window.electron.invoke('openExternal', url).catch((error) => {
                      console.error('Failed to open external URL:', error)
                      // Fallback to window.open if IPC fails
                      window.open(url, '_blank')
                    })
                  } else {
                    // Fallback for web
                    window.open(url, '_blank')
                  }
                }}
                style={{
                  color: theme === 'dark' ? '#4a9eff' : '#1a73e8',
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.textDecoration = 'underline'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.textDecoration = 'none'
                }}
              >
                your OpenAI key
              </a>
              {' '}here.
            </p>
            <input
              type="password"
              value={openaiApiKey}
              onChange={(e) => handleOpenaiApiKeyChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  // Save the API key (already handled by handleOpenaiApiKeyChange, but ensure it's saved)
                  handleOpenaiApiKeyChange(openaiApiKey)
                  // Defocus the input
                  e.currentTarget.blur()
                }
              }}
              placeholder="Enter your OpenAI API key"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${theme === 'dark' ? '#333' : '#dadce0'}`,
                borderRadius: '6px',
                backgroundColor: theme === 'dark' ? '#252525' : '#ffffff',
                color: theme === 'dark' ? '#e0e0e0' : '#202124',
                fontSize: '13px',
                outline: 'none',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = theme === 'dark' ? '#555' : '#1a73e8'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = theme === 'dark' ? '#333' : '#dadce0'
              }}
            />
          </div>

          {/* Google API Key section */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: '400',
                color: theme === 'dark' ? '#b0b0b0' : '#777',
                marginBottom: '8px',
              }}
            >
              Google API Key
            </label>
            <p
              style={{
                fontSize: '12px',
                color: theme === 'dark' ? '#999' : '#666',
                margin: '0 0 12px 0',
                lineHeight: '1.5',
              }}
            >
              Put your{' '}
              <a
                href="https://aistudio.google.com/app/api-keys"
                onClick={(e) => {
                  e.preventDefault()
                  const url = 'https://aistudio.google.com/app/api-keys'
                  // Check if running in Electron
                  const isElectron = typeof window !== 'undefined' && window.electron !== undefined
                  if (isElectron && window.electron) {
                    // Open in external browser via IPC
                    window.electron.invoke('openExternal', url).catch((error) => {
                      console.error('Failed to open external URL:', error)
                      // Fallback to window.open if IPC fails
                      window.open(url, '_blank')
                    })
                  } else {
                    // Fallback for web
                    window.open(url, '_blank')
                  }
                }}
                style={{
                  color: theme === 'dark' ? '#4a9eff' : '#1a73e8',
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.textDecoration = 'underline'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.textDecoration = 'none'
                }}
              >
                Google AI Studio
              </a>
              {' '}key here.
            </p>
            <input
              ref={apiKeyInputRef}
              type="password"
              value={googleApiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  // Save the API key (already handled by handleApiKeyChange, but ensure it's saved)
                  handleApiKeyChange(googleApiKey)
                  // Defocus the input
                  apiKeyInputRef.current?.blur()
                }
              }}
              placeholder="Enter your Google API key"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${theme === 'dark' ? '#333' : '#dadce0'}`,
                borderRadius: '6px',
                backgroundColor: theme === 'dark' ? '#252525' : '#ffffff',
                color: theme === 'dark' ? '#e0e0e0' : '#202124',
                fontSize: '13px',
                outline: 'none',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = theme === 'dark' ? '#555' : '#1a73e8'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = theme === 'dark' ? '#333' : '#dadce0'
              }}
            />
          </div>

          {/* Tip: Use single API key */}
          <div style={{ 
            marginTop: '12px',
            padding: '8px 10px',
            borderRadius: '6px',
            backgroundColor: theme === 'dark' ? '#1e1e1e' : '#fafafa',
            border: `1px solid ${theme === 'dark' ? '#2a2a2a' : '#e8e8e8'}`,
          }}>
            <p
              style={{
                fontSize: '11px',
                color: theme === 'dark' ? '#999' : '#666',
                margin: 0,
                lineHeight: '1.4',
              }}
            >
              Use a single API key to ensure stable AI semantic search.
            </p>
          </div>
        </div>
      )}
      </div>
    </>
  )
}
