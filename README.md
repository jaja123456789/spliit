# Spliit (Fork)

[<img alt="Spliit" height="60" src="https://github.com/spliit-app/spliit/blob/main/public/logo-with-text.png?raw=true" />](https://spliit.app)

This is a fork of [Spliit](https://github.com/spliit-app/spliit) (an open-source Splitwise alternative). I modified it to support my specific use cases that weren't in the original repo.

**Disclaimer:** I used AI agents extensively to write and modify the code in this fork. While it works for my needs, the codebase has changed significantly from upstream. Features are experimental and test coverage is mixed.

## Added Features

- **Cloud Sync:** Sync groups across devices using Magic Links (based on [PR #495](https://github.com/spliit-app/spliit/pull/495)).
- **Receipt Scanning:** Upload a photo of a receipt to automatically extract items, prices, and dates using Google Gemini with OpenRouter fallback.
- **Itemized Splitting:** Assign specific items from a receipt to specific people, rather than just splitting the total.
- **Multiple Payers:** Handle scenarios where multiple people contributed to a single bill (e.g., A paid deposit, B paid remainder).
- **Payment Links:** Add Venmo, PayPal, CashApp, or Revolut handles to profiles so balances link directly to the payment app.
- **Exclusions:** Logic to exclude specific items from the group split (for personal items on a shared bill).
- **AI assistant access (MCP):** Connect ChatGPT (or any MCP client) to read your groups and add expenses. See below.

## AI assistant access (MCP)

The instance exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so an
assistant can list your groups, read expenses and balances, and record new expenses.

**Setup**

1. Sign in with a magic link, then open **Settings → AI assistant access**.
2. Create a token and copy it — it is shown once and only its hash is stored.
3. In ChatGPT, enable Developer Mode, then add a connector pointing at the server URL shown on that
   settings page (`https://<your-host><base-path>/api/mcp`), authenticating with a **bearer token**.
   Put the token in the auth field, not in the URL — a token in the URL is a common cause of a
   connector that silently fails to connect.

**What it can do**

| Tool            |                                                                       |
| --------------- | --------------------------------------------------------------------- |
| `list_groups`   | Your synced groups, their participants, and which participant you are |
| `list_expenses` | Recent expenses in a group                                            |
| `get_balances`  | Who owes what, plus suggested reimbursements                          |
| `add_expense`   | Record a new expense (**writes to shared data**)                      |

**Scope and safety**

- A token acts as the user who created it and can only reach groups on that user's sync profile.
  Groups you have not synced are invisible to it, and it cannot touch other users' groups.
- Amounts are in the group's currency unless a `currency` is given, in which case the total is
  converted using the rate for the expense date. If no rate can be found the call fails rather than
  storing an unconverted amount.
- An identical expense created within five minutes is treated as a retry and not duplicated.
- Expenses added this way notify the group like any other, and appear in the activity log.
- Revoke a token from the same settings page at any time.

## Which version am I running?

Published images are tagged with `latest`, the `package.json` version, a short commit sha, and the
git tag when one triggered the build. The version and commit are also baked into the image:

```bash
curl -s https://your-domain.com/spliit/api/health | jq '{version, commit}'
docker inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' <image>
```

Pin a specific build in compose with `image: ghcr.io/jaja123456789/spliit:sha-abc1234` instead of
`:latest`.

## Deployment (Docker Compose)

Quickest way to get started:

```yaml
services:
  app:
    image: ghcr.io/jaja123456789/spliit:latest
    ports:
      - '3000:3000'
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
    restart: always

  db:
    image: postgres:15-alpine
    expose:
      - 5432
    environment:
      # --- Database ---
      POSTGRES_PASSWORD: 'password'
      POSTGRES_PRISMA_URL: 'postgresql://postgres:password@db:5432/spliit'
      POSTGRES_URL_NON_POOLING: 'postgresql://postgres:password@db:5432/spliit'

      # --- App ---
      NODE_ENV: 'production'
      NEXT_PUBLIC_BASE_URL: 'https://your-domain.com'
      # Optional to serve the app under a sub-directory
      NEXT_PUBLIC_BASE_PATH: '/spliit'
      # Use a random string: openssl rand -base64 32
      NEXTAUTH_SECRET: 'replace_this_with_secret'
      NEXTAUTH_URL: 'https://your-domain.com/api/auth'

      # --- Cloud Sync (Email) ---
      # Required for sending Magic Links
      SMTP_HOST: 'smtp.provider.com'
      SMTP_PORT: 587
      SMTP_USER: 'user'
      SMTP_PASS: 'your-key'
      EMAIL_FROM: 'noreply@your-domain.com'

      # --- AI Features (Receipt Scanning) ---
      # Gemini is used first. Get a free key at https://aistudio.google.com/
      GEMINI_API_KEY: 'your_gemini_key'
      GEMINI_RECEIPT_MODEL: 'gemini-3.1-flash-lite'
      # OpenRouter is used as a fallback if Gemini returns a 429 rate-limit error.
      OPENROUTER_API_KEY: 'your_openrouter_key'
      OPENROUTER_RECEIPT_MODEL: 'openrouter/free'
      OPENROUTER_CATEGORY_MODEL: 'openrouter/free'

      # --- Feature Flags ---
      NEXT_PUBLIC_ENABLE_RECEIPT_EXTRACT: true
      NEXT_PUBLIC_ENABLE_CATEGORY_EXTRACT: true
      NEXT_PUBLIC_ENABLE_EXPENSE_DOCUMENTS: false # S3 storage still has to be tested

      # --- Push Notifications (VAPID) ---
      # Generate these by running: npx web-push generate-vapid-keys
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'your_public_key'
      VAPID_PRIVATE_KEY: 'your_private_key'

      # --- Storage (S3) ---
      # Required for storing receipt images
      S3_UPLOAD_BUCKET: 'your-bucket'
      S3_UPLOAD_REGION: 'auto'
      S3_UPLOAD_KEY: 'access-key'
      S3_UPLOAD_SECRET: 'secret-key'
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5
    restart: always

volumes:
  postgres-data:
```
