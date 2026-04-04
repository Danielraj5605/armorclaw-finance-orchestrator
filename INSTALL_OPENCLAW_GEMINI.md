# Install OpenClaw with Gemini Support — Step-by-Step Guide

This guide walks you through **completely removing the old OpenClaw installation** and **reinstalling from scratch with Gemini configuration**.

---

## Prerequisites

- ✅ Git Bash installed
- ✅ Node.js installed
- ✅ pnpm installed globally (`npm install -g pnpm`)
- ✅ Gemini API key: `AIzaSyAp37GgDly0pbGg-DnNy3_Ssq9VA0eXUHM`
- ✅ ArmorIQ API key: `ak_live_0a822d342e9fd3e184e669d7eed5a8d195c43644b7c7183c28f3c396dfd87e5d`
- ✅ Alpaca keys: `PKWEKVYCLOKSHD5QJHN2OGJS3Z` and `8AutbfchDrVYa7X7Ppy8g49Mx8cUR8JqM9gUaW2S5a3R`

---

## Step 1: Stop All Running Services

**Close/stop these terminals if they're running:**
- Terminal running `pnpm dev gateway`
- Terminal running `uvicorn backend.main:app`
- Terminal running `npm run dev` (React)

---

## Step 2: Open Git Bash

Right-click your desktop → **Git Bash Here**

Or open your Git Bash terminal.

---

## Step 3: Remove Old OpenClaw Installation

Copy and paste these commands one at a time:

```bash
rm -rf ~/openclaw-armoriq
```

Wait for completion. Then:

```bash
rm -rf ~/.openclaw
```

Wait for completion. ✅

**Both directories should be completely deleted.**

---

## Step 4: Reinstall OpenClaw with Gemini

Copy and paste this **entire command block** into Git Bash (it's all one command):

```bash
curl -fsSL https://armoriq.ai/install-armorclaw.sh | bash -s -- \
  --gemini-key AIzaSyAp37GgDly0pbGg-DnNy3_Ssq9VA0eXUHM \
  --api-key ak_live_0a822d342e9fd3e184e669d7eed5a8d195c43644b7c7183c28f3c396dfd87e5d \
  --no-prompt
```

**This will run for 3-5 minutes.** Watch the output.

You should see:
```
✅ OpenClaw installed
✅ ArmorClaw applied
✅ Configuration complete
```

**Do not interrupt the process.** Wait for it to finish completely. ⏳

---

## Step 5: Create Agent Configuration for Gemini

After Step 4 completes, run this command:

```bash
cat > ~/.openclaw/agents/main/agent.json << 'EOF'
{
  "id": "main",
  "name": "Trading Agent",
  "provider": "google",
  "model": "gemini-2.0-flash",
  "tools": ["analyst-tools", "risk-tools", "trader-tools"],
  "mcp_servers": []
}
EOF
```

Press **Enter** at the end. ✅

This creates the agent.json file specifying Google/Gemini as the provider.

---

## Step 6: Update Auth Profiles for Gemini

Run this command:

```bash
cat > ~/.openclaw/agents/main/agent/auth-profiles.json << 'EOF'
{
  "google": {
    "apiKey": "AIzaSyAp37GgDly0pbGg-DnNy3_Ssq9VA0eXUHM",
    "model": "gemini-2.0-flash"
  }
}
EOF
```

Press **Enter** at the end. ✅

This configures only Google/Gemini (no Anthropic fallback).

---

## Step 7: Configure Alpaca Keys

Run these **three commands** one by one, pressing Enter after each:

```bash
echo "APCA_API_KEY_ID=PKWEKVYCLOKSHD5QJHN2OGJS3Z" >> ~/.openclaw/.env
```

```bash
echo "APCA_API_SECRET_KEY=8AutbfchDrVYa7X7Ppy8g49Mx8cUR8JqM9gUaW2S5a3R" >> ~/.openclaw/.env
```

```bash
echo "APCA_API_BASE_URL=https://paper-api.alpaca.markets" >> ~/.openclaw/.env
```

All three done? ✅

---

## Step 8: Copy Policy File

Run this command:

```bash
cp /d/projects/armorclaw/armorclaw-finance-orchestrator/config/armoriq.policy.json ~/.openclaw/armoriq.policy.json
```

Press **Enter**. ✅

---

## Step 9: Start the Gateway (The Critical Test)

Run this command:

```bash
cd ~/openclaw-armoriq
pnpm dev gateway
```

**WATCH THE OUTPUT CAREFULLY.**

The gateway will start up. Look for one of these outcomes:

---

### ✅ SUCCESS — Gemini is Working!

You should see something like:
```
11:54:20 [system] Starting OpenClaw Gateway
11:54:22 [system] Loading agent: main
11:54:23 [agent] Provider: google
11:54:23 [agent] Model: gemini-2.0-flash
11:54:25 ✅ listening on ws://127.0.0.1:18789
11:54:26 ✅ Agent main connected
11:54:27 ✅ Ready to accept trades
```

**If you see this, you're DONE! Gemini is configured.** ✅

Keep this terminal open and go to the next section.

---

### ❌ FAILURE — Still Anthropic Error

You might see:
```
No API key found for provider "anthropic"
[error] Agent initialization failed
```

If this happens:
1. **The agent is still hardcoded to Anthropic** despite our configuration
2. **This is expected** — OpenClaw's agent doesn't respect the provider override
3. **Don't panic** — Your fallback mode still works perfectly

---

## If Step 9 Succeeded (Gemini Working)

### Next: Start Backend & Frontend

Open a **new PowerShell** window (keep gateway running):

```powershell
cd D:\projects\armorclaw\armorclaw-finance-orchestrator
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

You should see:
```
✅ intent.json loaded
✅ SQLite audit log ready
✅ ArmorClaw engine initialized — 14 policy rules active
🦞 OpenClaw mode: LIVE — connecting to ws://127.0.0.1:18789
```

Open **another new PowerShell** window:

```powershell
cd D:\projects\armorclaw\armorclaw-finance-orchestrator\website
npm run dev
```

You should see:
```
VITE v5.x.x ready
➜ Local: http://localhost:5173/
```

### Test the System

Go to: **http://localhost:5173/dashboard**

Click **"Run Allowed Trade (BUY NVDA $4K)"**

You should see:
- ✅ Agent activity feed updating (Analyst → Risk → Trader)
- ✅ ArmorClaw green card (ALLOW)
- ✅ Real Alpaca order ID in results
- ✅ Audit log entry

**If you see this, Gemini live mode is fully working!** 🎉

---

## If Step 9 Failed (Still Anthropic Error)

This means the agent is **hardcoded to require Anthropic** and our configuration overrides don't work.

**Your options:**

### Option A: Stick with Fallback Mode (RECOMMENDED)
```powershell
# Update your .env
OPENCLAW_MODE=demo
```

Then start backend and frontend as above. The Python demo orchestrator will run (fully functional, identical security).

### Option B: Get Anthropic API Key and Reinstall
1. Go to https://console.anthropic.com
2. Create API key (`sk-ant-...`)
3. Re-run this command:
```bash
curl -fsSL https://armoriq.ai/install-armorclaw.sh | bash -s -- \
  --anthropic-key sk-ant-YOUR_KEY_HERE \
  --api-key ak_live_0a822d342e9fd3e184e669d7eed5a8d195c43644b7c7183c28f3c396dfd87e5d \
  --no-prompt
```

4. Then start gateway and test

---

## Summary: What Happens

| Outcome | What It Means | Action |
|---------|--------------|--------|
| **Gateway starts with provider: google** | ✅ Gemini is configured | Proceed to backend/frontend |
| **Gateway ready on ws://127.0.0.1:18789** | ✅ Gateway listening | System can use live mode |
| **Still "No API key for anthropic"** | ❌ Agent hardcoded | Use fallback (demo mode) or get Anthropic key |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `curl: command not found` | You're in PowerShell. Use Git Bash instead. |
| `mkdir: already exists` | That's OK. Just delete and recreate. |
| `pnpm: command not found` | Run `npm install -g pnpm` in Git Bash |
| Gateway says "port 18789 already in use" | Kill previous gateway process or restart Git Bash |
| "No API key found for provider anthropic" | Agent is hardcoded to Anthropic. Use fallback mode. |
| Agent activity says "connecting..." then fails | Gateway isn't running. Check Step 9 output. |

---

## Files Modified

After this installation:
- ✅ `~/.openclaw/agents/main/agent.json` — Created (provider = google)
- ✅ `~/.openclaw/agents/main/agent/auth-profiles.json` — Updated (google key only)
- ✅ `~/.openclaw/.env` — Updated (Alpaca keys)
- ✅ `~/.openclaw/armoriq.policy.json` — Copied from project

---

## Next Steps

After successful installation:

1. **Update your project `.env`:**
   ```
   OPENCLAW_MODE=live
   ```

2. **Start the 3-terminal setup:**
   - Terminal 1: `cd ~/openclaw-armoriq && pnpm dev gateway`
   - Terminal 2: `uvicorn backend.main:app --host 0.0.0.0 --port 8000`
   - Terminal 3: `cd website && npm run dev`

3. **Test at:** http://localhost:5173/dashboard

---

## Questions?

If Step 9 fails with Anthropic error, refer to the "If Step 9 Failed" section above. Your fallback system will handle it gracefully.

Good luck! 🚀
