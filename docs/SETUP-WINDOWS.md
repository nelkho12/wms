# ApexWMS – setup on Windows (SQL Server + desktop app)

## How the pieces fit

```
  Warehouse / office PCs                    The "SQL PC" (one computer, always on)
  ┌──────────────────┐                      ┌─────────────────────────────────────┐
  │ ApexWMS desktop  │ ── port 3000 ──────▶ │ ApexWMS service  ──▶  SQL Server    │
  │ app (installed)  │   (your network)     │ (logins, rules)       (the database)│
  └──────────────────┘                      └─────────────────────────────────────┘
```

* **SQL Server** keeps all data (stock, batches, orders, users, audit log).
* The **ApexWMS service** runs on the same PC as SQL Server. It checks logins and permissions and makes
  sure two people can never change the same stock at the same moment.
* The **desktop app** is installed on each PC. It only shows the screens – it never talks to SQL Server directly,
  so no database password is stored on the workstations.
* Only **port 3000** needs to be reachable from the other PCs. SQL Server itself stays closed to the network.

## Part 1 – the SQL PC (one time)

1. **Install SQL Server Express** (free, from Microsoft) and choose **Mixed Mode** authentication when asked.
   Also install **SQL Server Management Studio (SSMS)**.
2. **Turn on TCP/IP**: open *SQL Server Configuration Manager* → *SQL Server Network Configuration* →
   *Protocols for SQLEXPRESS* → **TCP/IP = Enabled** → double-click TCP/IP → *IP Addresses* tab → scroll to **IPAll**:
   clear *TCP Dynamic Ports* and set **TCP Port = 1433** → OK → restart the *SQL Server (SQLEXPRESS)* service.
3. **Create the database**: open `01-create-database.sql` in SSMS, change `CHANGE_ME_TO_A_LONG_PASSWORD` to a long
   password of your own, press *Execute*.
4. **Install Node.js** (LTS version) from nodejs.org.
5. **Copy the `ApexWMS-service-for-SQL-PC` folder** (see "Getting the files" below) to the PC, then:
   * copy `.env.example` to `.env` and edit it: set `MSSQL_PASSWORD` (same password as step 3) and
     `ADMIN_EMAIL` / `ADMIN_PASSWORD` (your first login);
   * double-click **`start-service.bat`**. You should see `ApexWMS service running on port 3000`.
     Fix any red error text first (usually a wrong password or TCP/IP not enabled);
   * close that window, then right-click PowerShell → *Run as administrator* and run
     `powershell -ExecutionPolicy Bypass -File .\install-service.ps1`
     This makes the service start automatically with Windows and opens port 3000 for your private network.
6. **Nightly backup**: in *Task Scheduler* create a daily task that runs `C:\ApexWMS\service\backup-database.bat`
   (backups go to `C:\ApexWMS\backups`; the last 30 days are kept). Copy that folder to another computer or cloud
   drive regularly – a backup on the same PC does not protect you if the PC fails.

## Part 2 – every workstation

1. Run **`ApexWMS-Setup-1.0.0.exe`**. (Windows may show a blue "SmartScreen" warning because the installer is not
   code-signed: click *More info* → *Run anyway*.)
2. Open **ApexWMS**. In *ApexWMS service address* type the SQL PC's name or IP and the port, e.g.
   `192.168.1.20:3000` (give the SQL PC a fixed IP in your router). A green "Connected to the service" appears.
3. Sign in. The app remembers the address and your login. To reset them use the menu
   *ApexWMS → Change service address / sign in again* (press the Alt key to show the menu bar).

## Getting the files

**Easiest (recommended):** on GitHub open the repository → **Actions** → **Build Windows installer** → **Run workflow**.
When it finishes, download the two files at the bottom of the run:
`ApexWMS-desktop-installer` (the `.exe`) and `ApexWMS-service-for-SQL-PC` (the folder for Part 1).

**Alternative:** on any Windows PC with Node.js: `npm install`, then `npm run desktop:dist` (installer appears in
`release\`) and `npm run build:service` (service file `dist-service\server.cjs`).

## Everyday use

* Add people: click your name/role badge at the top → **Add New Team Member** (give a starting password, they change it under
  *their name → Edit Info → Change My Password*).
* What each role may do is set under the same screen and is enforced by the service on every computer.
* Everything people do is written to the audit log with their real name and the time of the SQL PC.
* If a change cannot be saved (e.g. SQL Server is stopped) the app says so and **nothing is half-saved**.
* To update the software: install the new `.exe` on the workstations, replace `server.cjs` on the SQL PC and
  restart the *ApexWMS Service* task. The data stays in SQL Server.

## Good to know

* **Rotate the old password.** The previous version of this project had a SQL Server address and password written
  in `.env.example` on GitHub. Treat that password as public and never reuse it.
* `SEED_MODE=master` loads your product catalog, bin locations, zones and customers into an empty database.
  Use `demo` only on a test installation.
* The **MS SQL** tab is a read-only viewer of the app's own data, not a free SQL prompt.
* Several people can work at once; screens refresh by themselves every ~20 seconds, and immediately after you act.
* This setup is for a trusted office network. Do not expose port 3000 to the internet.
