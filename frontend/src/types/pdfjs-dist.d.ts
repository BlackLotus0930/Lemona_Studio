declare module 'pdfjs-dist/web/pdf_viewer.mjs' {
  export class TextLayerBuilder {
    constructor(options: { pdfPage: any; highlighter?: any; accessibilityManager?: any; enablePermissions?: boolean; onAppend?: (div: HTMLDivElement) => void })
    render(options: { viewport: any; textContentParams?: any }): Promise<void>
    cancel(): void
  }
}
