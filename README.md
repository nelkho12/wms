# ApexWMS

Warehouse management: batch / best-before traceability, FEFO picking, sales orders, stock movements, audit log.

* **Service** (`server.ts`, `server/`) – Node + Microsoft SQL Server. Logins, roles, safe stock updates.
* **Desktop app** (`electron/`, `src/`) – Windows application that shows the screens.
* Setup for Windows: see [`docs/SETUP-WINDOWS.md`](docs/SETUP-WINDOWS.md).

## Developing

```bash
npm install
npm test                 # automated tests (use an in-memory database, no SQL Server needed)
npm run lint             # TypeScript check

# try it without SQL Server (data is lost on restart):
WMS_STORE=memory SEED_MODE=demo DEMO_USER_PASSWORD='Demo12345!' npm run dev
#   -> http://localhost:3000   sign in: s.connor@apexwms.io / Demo12345!

npm run desktop          # open the desktop app (needs the service running)
npm run desktop:dist     # build the Windows installer (run on Windows)
npm run build:service    # build dist-service/server.cjs for the SQL PC
```

Settings are read from a `.env` file; see `.env.example`.
