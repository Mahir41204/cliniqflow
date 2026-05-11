# Clinic Queue Manager

Production-ready clinic queue management system with a React frontend and Express API.

## Requirements

- Node.js 18+
- pnpm 9+
- PostgreSQL 14+

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create a root `.env` file:

```env
DATABASE_URL=postgresql://clinic_user:YourStrongPassword@localhost:5432/clinic_queue
PORT=8080
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
VITE_API_BASE_URL=http://localhost:8080
SESSION_SECRET=change-this-in-production
COOKIE_SECURE=false
```

### WhatsApp configuration

To enable automated WhatsApp notifications set one of the providers below and the related environment variables.

Twilio (WhatsApp via Twilio):

```env
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=+1415XXXXXXX
```

Meta / WhatsApp Cloud API:

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_API_TOKEN=EAAG... (page access token)
```

3. Apply the database schema:

```bash
pnpm run --filter @workspace/db push
```

4. Run the apps:

```bash
pnpm run dev --filter @workspace/api-server
pnpm run dev --filter @workspace/clinic-queue
```

## Tests

```bash
pnpm test
```

## Production notes

- Set `NODE_ENV=production`.
- Set `FRONTEND_URL` to your deployed frontend origin.
- Set `COOKIE_SECURE=true` behind HTTPS.
- Set `SESSION_SECRET` to a long random value in production.
- Put the API behind a reverse proxy such as nginx, Caddy, or your cloud provider’s ingress.
- Use a managed PostgreSQL instance with backups enabled.

## Health checks

- `GET /api/healthz` for process health
- `GET /api/readyz` for database readiness
