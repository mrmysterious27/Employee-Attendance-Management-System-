# Setup

## Development
Requires Node.js 18+.

```bash
npm install
cp .env.example .env
npm start
```

Windows PowerShell:
```powershell
copy .env.example .env
npm install
npm start
```

## Production considerations
- Use a strong random `JWT_SECRET`.
- Run behind HTTPS.
- Set secure cookies when deployed over HTTPS.
- Put the app behind a reverse proxy.
- Back up the SQLite database or migrate to PostgreSQL for multi-instance deployments.
- Add CSRF protection if the authentication strategy is expanded to cross-site contexts.
- Configure a company-specific leave policy.
