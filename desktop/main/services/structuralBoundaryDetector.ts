// Generic Structural Boundary Detector
// Detects potential structural boundaries (chapters, sections, subsections) in documents

export interface Paragraph {
  text: string
  style: string // Heading1, Heading2, Normal, etc.
  bold: boolean
  italic: boolean
  centered: boolean
  fontSize: number
  spacingBefore: number
  spacingAfter: number
  index: number // Paragraph index in document
}

export interface StructuralBoundary {
  index: number // Paragraph index in document
  text: string // Paragraph text
  signals: string[] // Matched signals: ["short-line","bold","numbering"]
  confidence: number // 0~1
}

/**
 * Generic Structural Boundary Detector
 * Detects structural boundaries using multiple signals and confidence scoring
 */
export class GenericStructuralBoundaryDetector {
  private paragraphs: Paragraph[]
  private avgFontSize: number = 0
  private avgSpacingBefore: number = 0
  private avgSpacingAfter: number = 0

  constructor(paragraphs: Paragraph[]) {
    this.paragraphs = paragraphs
    this.calculateAverages()
  }

  /**
   * Calculate average values for normalization
   */
  private calculateAverages(): void {
    if (this.paragraphs.length === 0) return

    let totalFontSize = 0
    let totalSpacingBefore = 0
    let totalSpacingAfter = 0
    let count = 0

    for (const para of this.paragraphs) {
      if (para.fontSize > 0) {
        totalFontSize += para.fontSize
        count++
      }
      totalSpacingBefore += para.spacingBefore
      totalSpacingAfter += para.spacingAfter
    }

    this.avgFontSize = count > 0 ? totalFontSize / count : 12
    this.avgSpacingBefore = this.paragraphs.length > 0 ? totalSpacingBefore / this.paragraphs.length : 0
    this.avgSpacingAfter = this.paragraphs.length > 0 ? totalSpacingAfter / this.paragraphs.length : 0
  }

  /**
   * Detect structural boundaries
   */
  detect(): StructuralBoundary[] {
    const boundaries: StructuralBoundary[] = []

    for (const para of this.paragraphs) {
      const signals: string[] = []
      let score = 0

      // 4.1 Typography signals
      // short-line
      if (para.text.length <= 30) {
        signals.push('short-line')
        score += 0.2
      }

      // large-spacing
      if (para.spacingBefore >= 2 * this.avgSpacingBefore || 
          para.spacingAfter >= 2 * this.avgSpacingAfter) {
        signals.push('large-spacing')
        score += 0.2
      }

      // large-font
      if (para.fontSize >= this.avgFontSize + 2) {
        signals.push('large-font')
        score += 0.2
      }

      // bold
      if (para.bold) {
        signals.push('bold')
        score += 0.1
      }

      // centered
      if (para.centered) {
        signals.push('centered')
        score += 0.1
      }

      // 4.2 Text pattern signals
      // numbering
      if (/^\d+(\.\d+)*[.、)]/.test(para.text)) {
        signals.push('numbering')
        score += 0.2
      }

      // chapter-en
      if (/^Chapter\s+[\dIVX]+/i.test(para.text)) {
        signals.push('chapter-en')
        score += 0.3
      }

      // chapter-zh
      if (/^第[一二三四五六七八九十\d]+章/.test(para.text)) {
        signals.push('chapter-zh')
        score += 0.3
      }

      // part-en
      if (/^Part\s+[\dIVX]+/i.test(para.text)) {
        signals.push('part-en')
        score += 0.2
      }

      // section-en
      if (/^Section\s+[\dIVX]+/i.test(para.text)) {
        signals.push('section-en')
        score += 0.2
      }

      // Heading style signals (additional)
      if (para.style && /heading/i.test(para.style)) {
        const levelMatch = para.style.match(/heading\s*(\d+)/i)
        if (levelMatch) {
          const level = parseInt(levelMatch[1])
          signals.push(`heading-${level}`)
          // Higher level headings get more score
          score += level <= 2 ? 0.3 : 0.2
        } else {
          signals.push('heading')
          score += 0.2
        }
      }

      // Normalize confidence to 0~1
      const confidence = Math.min(1.0, score)

      // Only include boundaries with confidence > 0.2
      if (confidence > 0.2 && signals.length > 0) {
        boundaries.push({
          index: para.index,
          text: para.text,
          signals,
          confidence,
        })
      }
    }

    return boundaries
  }
}

