# Anonymous Telemetry Setup

Lemona uses optional anonymous telemetry to understand usage (daily active users, feature adoption, session duration, retention). No PII or content data is collected.

## Enable Telemetry

Create a `.env` file in the project root (or in `frontend/`) with:

```env
# PostHog (recommended, free tier: 1M events/month)
VITE_POSTHOG_KEY=phc_your_project_key_here

# Or use a custom endpoint (e.g. Supabase Edge Function)
# VITE_TELEMETRY_ENDPOINT=https://your-project.supabase.co/functions/v1/telemetry
# Note: For custom endpoints, add your domain to connect-src in desktop/main/index.ts (setupCSP)

# Optional: disable in local dev (telemetry is off by default when VITE_POSTHOG_KEY is unset)
# VITE_TELEMETRY_DEV=true   # Set to enable telemetry in dev mode
```

Get a PostHog key: [posthog.com](https://posthog.com) → New Project → Project API Key.

## Events Tracked

| Event | Properties |
|-------|------------|
| `app_launched` | — |
| `document_created` | `source`: layout, editor, agent, list |
| `ai_chat_sent` | `mode`: chat, agent |
| `agent_edit_applied` | `edit_type`: patch, full_content |
| `file_indexed` | `scope`: library, workspace; `file_type`: pdf (library only) |
| `pdf_imported` | `size_bucket`: &lt;1mb, 1_10mb, gt10mb |
| `search_performed` | `surface`: editor, file_explorer, pdf |
| `app_session_end` | `duration_ms` |

## Dashboards in PostHog

After events flow in, create 3 dashboards in the PostHog UI:

### 1. Feature Mix (weekly % share)

- **Insight**: Breakdown of events by event name.
- **Filter**: Event names `ai_chat_sent`, `search_performed`, `agent_edit_applied`, `document_created`, `file_indexed`, `pdf_imported`.
- **Group by**: Week.

### 2. Session Quality (median/avg duration by day)

- **Insight**: Filter event = `app_session_end`, show `properties.duration_ms` as metric.
- **Aggregation**: Median or average.
- **Group by**: Day.

### 3. Retention (D1 and D7)

- **Insight**: Retention analysis.
- **Start event**: `app_launched`.
- **Return event**: `app_launched`.
- **Breakdown by**: `distinct_id` (device_id).
- **Intervals**: Day 1, Day 7.
