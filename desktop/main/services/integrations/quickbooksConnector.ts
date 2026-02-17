import { IntegrationItem, IntegrationSource } from '../integrationTypes.js'

const QB_API = 'https://quickbooks.api.intuit.com/v3/company'
const MAX_RESULTS = 1000

interface QBCustomer {
  Id?: string
  DisplayName?: string
  CompanyName?: string
  PrimaryEmailAddr?: { Address?: string }
  Balance?: number
  MetaData?: { LastUpdatedTime?: string }
}

interface QBInvoice {
  Id?: string
  DocNumber?: string
  TxnDate?: string
  DueDate?: string
  TotalAmt?: number
  Balance?: number
  CustomerRef?: { value?: string; name?: string }
  Line?: Array<{ Amount?: number; Description?: string; DetailType?: string }>
  MetaData?: { LastUpdatedTime?: string }
}

interface QBQueryResponse<T> {
  QueryResponse?: { [entity: string]: T[] }
  Fault?: { Error?: Array<{ Message?: string }> }
}

function getRealmId(source: IntegrationSource): string {
  const config = source.config as { realmId?: string }
  if (!config?.realmId || typeof config.realmId !== 'string') {
    throw new Error('QuickBooks realm/company ID is missing. Please reconnect QuickBooks.')
  }
  return config.realmId.trim()
}

async function qbQuery<T>(realmId: string, accessToken: string, query: string): Promise<T[]> {
  const url = `${QB_API}/${realmId}/query?query=${encodeURIComponent(query)}`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'Lemona-Desktop',
    },
  })
  if (!response.ok) {
    const text = await response.text()
    const err = new Error(`QuickBooks API failed (${response.status})`)
    ;(err as { status?: number; body?: string }).status = response.status
    ;(err as { status?: number; body?: string }).body = text
    throw err
  }
  const data = (await response.json()) as QBQueryResponse<T>
  if (data.Fault?.Error?.length) {
    throw new Error(data.Fault.Error.map(e => e.Message).join('; ') || 'QuickBooks API error')
  }
  const entityName = query.match(/FROM\s+(\w+)/i)?.[1] || 'QueryResponse'
  const items = data.QueryResponse?.[entityName]
  return Array.isArray(items) ? items : []
}

function formatCurrency(amount: number | undefined): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function mapCustomerToItem(source: IntegrationSource, c: QBCustomer): IntegrationItem {
  const name = c.DisplayName || c.CompanyName || c.Id || 'Customer'
  const content = [
    c.CompanyName ? `Company: ${c.CompanyName}` : '',
    c.PrimaryEmailAddr?.Address ? `Email: ${c.PrimaryEmailAddr.Address}` : '',
    c.Balance != null ? `Balance: ${formatCurrency(c.Balance)}` : '',
  ].filter(Boolean).join('\n')

  return {
    sourceId: source.id,
    sourceType: 'quickbooks',
    id: `customer:${c.Id}`,
    externalId: c.Id,
    title: `[QuickBooks Customer] ${name}`,
    content: content || 'Customer',
    updatedAt: c.MetaData?.LastUpdatedTime || new Date().toISOString(),
    metadata: {
      itemType: 'quickbooks:customer',
      identifier: c.Id,
      displayName: c.DisplayName,
      companyName: c.CompanyName,
    },
  }
}

function mapInvoiceToItem(source: IntegrationSource, inv: QBInvoice): IntegrationItem {
  const title = inv.DocNumber ? `#${inv.DocNumber}` : inv.Id || 'Invoice'
  const customer = inv.CustomerRef?.name || inv.CustomerRef?.value || ''
  const lineSummary = inv.Line?.slice(0, 5).map(l => l.Description || l.DetailType || '').filter(Boolean).join('; ') || ''
  const content = [
    customer ? `Customer: ${customer}` : '',
    inv.TxnDate ? `Date: ${inv.TxnDate}` : '',
    inv.DueDate ? `Due: ${inv.DueDate}` : '',
    inv.TotalAmt != null ? `Total: ${formatCurrency(inv.TotalAmt)}` : '',
    inv.Balance != null ? `Balance: ${formatCurrency(inv.Balance)}` : '',
    lineSummary ? `Items: ${lineSummary}` : '',
  ].filter(Boolean).join('\n')

  return {
    sourceId: source.id,
    sourceType: 'quickbooks',
    id: `invoice:${inv.Id}`,
    externalId: inv.Id,
    title: `[QuickBooks Invoice] ${title} ${customer ? `(${customer})` : ''}`.trim(),
    content: content || 'Invoice',
    updatedAt: inv.MetaData?.LastUpdatedTime || new Date().toISOString(),
    metadata: {
      itemType: 'quickbooks:invoice',
      identifier: inv.Id,
      docNumber: inv.DocNumber,
      totalAmt: inv.TotalAmt,
      balance: inv.Balance,
    },
  }
}

export async function fetchQuickBooksItems(source: IntegrationSource, accessToken: string): Promise<IntegrationItem[]> {
  const realmId = getRealmId(source)

  const [customers, invoices] = await Promise.all([
    qbQuery<QBCustomer>(realmId, accessToken, `SELECT * FROM Customer MAXRESULTS ${MAX_RESULTS}`),
    qbQuery<QBInvoice>(realmId, accessToken, `SELECT * FROM Invoice MAXRESULTS ${MAX_RESULTS}`),
  ])

  const items: IntegrationItem[] = []
  for (const c of customers) {
    if (c.Id) items.push(mapCustomerToItem(source, c))
  }
  for (const inv of invoices) {
    if (inv.Id) items.push(mapInvoiceToItem(source, inv))
  }
  return items
}
