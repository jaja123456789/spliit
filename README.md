# Spliit (Fork)

[<img alt="Spliit" height="60" src="https://github.com/spliit-app/spliit/blob/main/public/logo-with-text.png?raw=true" />](https://spliit.app)

This is a fork of [Spliit](https://github.com/spliit-app/spliit) (an open-source Splitwise alternative). I modified it to support my specific use cases that weren't in the original repo.

**Disclaimer:** I used AI agents extensively to write and modify the code in this fork. While it works for my needs, the codebase has changed significantly from upstream. Features are experimental and test coverage is mixed.

## Added Features

- **Cloud Sync:** Sync groups across devices using Magic Links (based on [PR #495](https://github.com/spliit-app/spliit/pull/495)).
- **Receipt Scanning:** Upload a photo of a receipt to automatically extract items, prices, and dates using Google Gemini or OpenAI.
- **Itemized Splitting:** Assign specific items from a receipt to specific people, rather than just splitting the total.
- **Multiple Payers:** Handle scenarios where multiple people contributed to a single bill (e.g., A paid deposit, B paid remainder).
- **Payment Links:** Add Venmo, PayPal, CashApp, or Revolut handles to profiles so balances link directly to the payment app.
- **Exclusions:** Logic to exclude specific items from the group split (for personal items on a shared bill).

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
      # Get a free key at https://aistudio.google.com/
      GEMINI_API_KEY: 'your_gemini_key'
      # Or use OpenAI
      # OPENAI_API_KEY=sk-...

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
