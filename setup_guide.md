# AuraTrade — Complete Setup Guide (Beginner Friendly)

> Follow these steps **in order**. Everything is free. No real money involved.

---

## Overview: What You're Installing

| What | Why |
|------|-----|
| **Node.js** | OpenClaw runs on Node.js |
| **Git Bash** | Run the installer on Windows (not PowerShell) |
| **OpenClaw** | The AI agent platform (installed automatically by ArmorIQ script) |
| **ArmorClaw** | The enforcement plugin (installed automatically by ArmorIQ script) |
| **Python deps** | Our FastAPI backend |
| **npm deps** | Our React dashboard |

---

## PART 1 — Get Your Free API Keys

You need **3 keys**. Get them all before running anything.

### Key 1: ArmorIQ API Key

1. Go to → **https://platform.armoriq.ai**
2. Click **Sign Up** (it's free)
3. After signup → go to **Settings → API Keys**
4. Click **Create API Key**
5. Copy the key — it starts with `ak_live_...`
6. **Save it somewhere** (Notepad is fine)

---

### Key 2: Anthropic API Key (for the AI brain) ⚠️ IMPORTANT

**⚠️ NOTE:** OpenClaw's "main" agent is hardcoded to use **Anthropic (Claude)**, not Gemini.

You have **two options**:

**Option A: Use the Demo Fallback (RECOMMENDED)**
- Skip this step — the system automatically falls back to Python demo agents
- Demo mode works perfectly and enforces identical security
- No additional API key needed

**Option B: Get Anthropic Key (for pure live mode)**
1. Go to → **https://console.anthropic.com**
2. Sign up / Log in
3. Go to **API Keys** section
4. Click **Create Key**
5. Copy the key — it starts with `sk-ant-...`
6. **Save it**

> Anthropic paid API required (free tier not available). If you skip this and use demo mode, no cost.

---

### Key 3: Alpaca Paper Trading Keys

1. Go to → **https://app.alpaca.markets**
2. Click **Sign Up** (free)
3. After login → click **Paper Trading** in the left sidebar
4. Go to **Your API Keys** (bottom right of Paper Trading dashboard)
5. Click **Regenerate** to create paper trading keys
6. Copy both:
   - **API Key ID** (looks like `PKXXXXX...`)
   - **Secret Key** (looks like `wXXXXX...`)
7. **Save both**

> Paper trading = **simulated money only**. You cannot lose real money here.

---

## PART 2 — Install Prerequisites on Windows

### Step 1: Install Node.js

1. Go to → **https://nodejs.org**
2. Download the **LTS version** (the left button)
3. Run the installer → click Next through everything
4. After install, open a new **PowerShell** and type:
   ```
   node --version
   ```
   You should see something like `v22.x.x`. If yes, ✅ done.

---

### Step 2: Install Git (and Git Bash)

1. Go to → **https://git-scm.com/download/win**
2. Download and run the installer
3. Click Next through everything — **leave all defaults**
4. After install, you'll have **Git Bash** installed on your computer
5. Right-click your Desktop → you should see **"Git Bash Here"**

> **IMPORTANT:** All the OpenClaw/ArmorClaw commands below must be run in **Git Bash**, NOT in PowerShell or CMD. They will not work in PowerShell.

---

### Step 3: Install pnpm (package manager used by OpenClaw)

Open **Git Bash** and run:
```bash
npm install -g pnpm
```

Verify it worked:
```bash
pnpm --version
```
Should show something like `9.x.x`. ✅

---

## PART 3 — Install OpenClaw + ArmorClaw

> Everything in PART 3 runs in **Git Bash**.

### Step 4: Run the ArmorIQ Installer

This single command does everything:
- Downloads and builds OpenClaw v2026.3.2
- Applies 8 ArmorClaw security patches
- Installs the `@armoriq/armorclaw` plugin
- Sets up your agent configuration

Open **Git Bash** and run:

**If using Demo Fallback (RECOMMENDED — no API key needed):**
```bash
curl -fsSL https://armoriq.ai/install-armorclaw.sh | bash -s -- \
  --api-key YOUR_ARMORIQ_KEY_HERE \
  --no-prompt
```

**If using Anthropic (pure live mode):**
```bash
curl -fsSL https://armoriq.ai/install-armorclaw.sh | bash -s -- \
  --anthropic-key sk-ant-YOUR_ANTHROPIC_KEY_HERE \
  --api-key YOUR_ARMORIQ_KEY_HERE \
  --no-prompt
```

> **This takes 3–5 minutes.** It will download and build things. Wait for it to finish completely. You'll see a success message at the end.

After it finishes, OpenClaw is installed at:
```
C:/Users/YOUR_USERNAME/openclaw-armoriq/
```
(In Git Bash this appears as `~/openclaw-armoriq/`)

**How it works:**
- **Live Mode** (if Anthropic key provided): Uses OpenClaw gateway with Claude agents
- **Fallback Mode** (no Anthropic key): Automatically uses Python demo orchestrator
- **Both apply identical ArmorClaw enforcement** — no difference in security

---

### Step 5: Install the Alpaca Trading Skill

Still in **Git Bash**, run:
```bash
npx clawhub install alpaca-trading --force
```

> If `clawhub` command isn't found, try:
> ```bash
> cd ~/openclaw-armoriq
> node openclaw.mjs skills install lacymorrow/alpaca-trading-skill
> ```

---

### Step 6: Configure Your Alpaca Keys

In **Git Bash**, run these 3 commands (replace with YOUR actual Alpaca keys):
```bash
echo "APCA_API_KEY_ID=PKXXXXXXXXXXXXXXX" >> ~/.openclaw/.env
echo "APCA_API_SECRET_KEY=wXXXXXXXXXXXXX" >> ~/.openclaw/.env
echo "APCA_API_BASE_URL=https://paper-api.alpaca.markets" >> ~/.openclaw/.env
```

---

### Step 7: Copy the AuraTrade Policy File

In **Git Bash**, navigate to your project and copy the policy:
```bash
cd /d/projects/armorclaw/armorclaw-finance-orchestrator
cp config/armoriq.policy.json ~/.openclaw/armoriq.policy.json
```

---

### Step 8: Start the OpenClaw Gateway

In **Git Bash**:
```bash
cd ~/openclaw-armoriq
pnpm dev gateway
```

**Wait and watch the output.** You know it's working when you see these 3 lines:
```
✅ listening on ws://127.0.0.1:18789
✅ IAP Verification Service initialized  
✅ CSRG proof headers are REQUIRED
```

> **Leave this terminal open.** The gateway must keep running while you use the project.

**Also check:** Go to **https://platform.armoriq.ai** → you should see your agent connected.

---

## PART 4 — Set Up the AuraTrade Project

> Open a **new terminal** for each of the following steps. Leave the gateway running.

### Step 9: Create Your `.env` File

Open **PowerShell** (or Explorer), go to:
```
D:\projects\armorclaw\armorclaw-finance-orchestrator\
```

Copy `.env.example` to `.env`:
```powershell
copy .env.example .env
```

Now open `.env` in Notepad and fill in your keys:
```
ALPACA_API_KEY=PKXXXXXXXXXXXXXXX
ALPACA_SECRET_KEY=wXXXXXXXXXXXXX
ALPACA_BASE_URL=https://paper-api.alpaca.markets
ARMORIQ_API_KEY=ak_live_abcd1234...
ARMORCLAW_SECRET_KEY=any-long-random-string-you-choose-here!
OPENCLAW_MODE=live
```

**Mode Selection:**
- **`OPENCLAW_MODE=live`** → Tries to connect to OpenClaw gateway
  - If Anthropic key is configured → Uses real Claude agents
  - If Anthropic key missing → Falls back to Python demo agents
- **`OPENCLAW_MODE=demo`** → Always uses Python demo agents

> **RECOMMENDED:** Leave as `live` — system gracefully falls back to demo if gateway unavailable.

---

### Step 10: Install Python Dependencies

Open **PowerShell** in the project folder:
```powershell
cd D:\projects\armorclaw\armorclaw-finance-orchestrator
pip install -r requirements.txt
```

Wait for all packages to install. ✅

---

### Step 11: Start the FastAPI Backend

Still in **PowerShell** (project root):
```powershell
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

You should see:
```
✅ intent.json loaded
✅ SQLite audit log ready  
✅ ArmorClaw engine initialized — 14 policy rules active
🦞 OpenClaw mode: LIVE — connecting to ws://127.0.0.1:18789
```

> **Leave this terminal open.**

---

### Step 12: Start the React Frontend

Open **another new PowerShell** window:
```powershell
cd D:\projects\armorclaw\armorclaw-finance-orchestrator\website
npm install
npm run dev
```

You should see:
```
  VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

> **Leave this terminal open.**

---

## PART 5 — Test the System

### Step 13: Open the Dashboard

Go to: **http://localhost:5173/dashboard**

You'll see 5 panels:
1. **Trade Trigger** — Two buttons to test the system
2. **Agent Activity Feed** — Live updates as agents run
3. **ArmorClaw Decision** — Shows ALLOW (green) or BLOCK (red)
4. **Audit Log** — Every decision recorded with proof hash
5. **Portfolio** — Your Alpaca paper positions

---

### Step 14: Test an Allowed Trade

Click **"Run Allowed Trade (BUY NVDA $4K)"**

You should see:
- Agent feed lighting up: Analyst → Risk → Trader steps
- ArmorClaw green card: ✅ ALLOW
- Audit log: new ALLOW entry
- Portfolio: NVDA position updated

---

### Step 15: Test a Blocked Trade

Click **"Trigger Blocked Trade (BUY NVDA $8K)"**

You should see:
- Agents start running...
- ArmorClaw **RED card**: 🚫 BLOCK
- Rule fired: `trade-size-limits` (because $8K > $5K limit)
- Audit log: BLOCK entry (nothing sent to Alpaca)

---

## Summary: All Terminals You Need Running

| Terminal | Command | Where |
|----------|---------|-------|
| Terminal 1 | `cd ~/openclaw-armoriq && pnpm dev gateway` | Git Bash |
| Terminal 2 | `uvicorn backend.main:app --host 0.0.0.0 --port 8000` | PowerShell (project root) |
| Terminal 3 | `npm run dev` | PowerShell (website folder) |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `curl` not found in PowerShell | Use Git Bash instead |
| `clawhub` command not found | Run from `~/openclaw-armoriq/` directory |
| Backend shows `DEMO mode` | This is normal! Demo = Python orchestrator fallback (same security as live) |
| `No API key found for provider "anthropic"` | Expected. System falls back to Python demo. To enable pure live mode, add Anthropic key |
| Gateway not connecting | This is fine — system falls back to demo mode ✅ |
| `pip` not recognized | Try `python -m pip install -r requirements.txt` |
| Port 8000 already in use | Kill existing process or use `--port 8001` |
| Dashboard shows blank | Run `npm install` inside `website/` folder first |
| Positions show demo data | Add real Alpaca paper keys to `.env` |
| Gemini key not being used | ⚠️ OpenClaw "main" agent requires Anthropic, not Gemini. System automatically falls back to demo mode which is equally secure |
| Want pure live mode with Claude agents | Get Anthropic API key and add `--anthropic-key` to installer |
