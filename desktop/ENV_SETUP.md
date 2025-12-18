# Environment Setup for Desktop App

## Setting GEMINI_API_KEY

The Desktop app automatically loads environment variables from a `.env` file. It checks two locations in order:

1. **`desktop/.env`** (Desktop-specific, recommended)
2. **`Lemona/.env`** (Project root, shared with backend)

### Using .env file (Recommended)

**Option 1: Desktop-specific (Recommended)**

Create a `.env` file in the `desktop/` directory (`Lemona/desktop/.env`):

```env
GEMINI_API_KEY=your-api-key-here
PORT=3000
```

**Option 2: Project root (Shared)**

Create a `.env` file in the project root (`Lemona/.env`):

```env
GEMINI_API_KEY=your-api-key-here
PORT=3000
```

The Desktop app will automatically load from the first file it finds.

### Alternative: Environment Variables

If you prefer to use environment variables instead:

#### Windows (PowerShell)

```powershell
# Set for current session
$env:GEMINI_API_KEY="your-api-key-here"

# Or set permanently (requires admin)
[System.Environment]::SetEnvironmentVariable('GEMINI_API_KEY', 'your-api-key-here', 'User')
```

#### Windows (Command Prompt)

```cmd
set GEMINI_API_KEY=your-api-key-here
```

#### macOS/Linux

```bash
export GEMINI_API_KEY="your-api-key-here"
```

## Testing

After setting up the API key (via .env file or environment variable), restart the Electron app:

```bash
cd desktop
npm run dev
```

The app will log:
- ✅ `GEMINI_API_KEY loaded from .env` if successful
- ⚠️ `WARNING: GEMINI_API_KEY not found` if not set

## Note

The `.env` file should be in the project root, not in the `desktop/` directory. This allows both the backend server and desktop app to share the same configuration.

