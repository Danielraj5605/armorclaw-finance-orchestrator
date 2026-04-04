#!/usr/bin/env python3
"""
Setup Real OpenClaw for AuraTrade
This script helps you get real OpenClaw working with your project
"""
import os
import sys
import subprocess
from pathlib import Path

def print_banner():
    print("🦞" * 60)
    print("    Setting Up Real OpenClaw for AuraTrade")
    print("🦞" * 60)
    print()

def check_prerequisites():
    """Check if we have what we need"""
    print("🔍 Checking prerequisites...")
    
    # Check if .env exists
    env_file = Path(".env")
    if not env_file.exists():
        print("❌ .env file not found!")
        print("Please copy .env.template to .env and add your API keys")
        return False
    
    # Load and check environment variables
    from dotenv import load_dotenv
    load_dotenv()
    
    required_vars = {
        "GEMINI_API_KEY": "https://aistudio.google.com",
        "ARMORIQ_API_KEY": "https://platform.armoriq.ai", 
        "ALPACA_API_KEY": "https://app.alpaca.markets/paper/dashboard",
        "ALPACA_SECRET_KEY": "https://app.alpaca.markets/paper/dashboard"
    }
    
    missing_vars = []
    for var, url in required_vars.items():
        value = os.getenv(var)
        if not value or value.startswith("your_") or value == "ak_live_your_armoriq_key_here":
            missing_vars.append(f"{var} (get from {url})")
    
    if missing_vars:
        print("❌ Missing or placeholder API keys:")
        for var in missing_vars:
            print(f"   • {var}")
        print()
        print("Please add these to your .env file and run again")
        return False
    
    print("✅ All API keys found!")
    return True

def install_openclaw():
    """Install real OpenClaw with ArmorClaw"""
    print("\n📦 Installing Real OpenClaw...")
    print("⚠️  This requires Git Bash or WSL, not PowerShell!")
    print()
    
    # Get API keys from environment
    from dotenv import load_dotenv
    load_dotenv()
    
    gemini_key = os.getenv("GEMINI_API_KEY")
    armoriq_key = os.getenv("ARMORIQ_API_KEY")
    
    print("🚀 Run these commands in Git Bash or WSL:")
    print("=" * 60)
    print("# Step 1: Install OpenClaw with ArmorClaw")
    print("curl -fsSL https://armoriq.ai/install-armorclaw.sh | bash -s -- \\")
    print(f"  --gemini-key {gemini_key[:20]}... \\")
    print(f"  --api-key {armoriq_key[:20]}... \\")
    print("  --no-prompt")
    print()
    print("# Step 2: Install Alpaca Trading Skill")
    print("clawhub install lacymorrow/alpaca-trading-skill")
    print()
    print("# Step 3: Configure Alpaca keys")
    print("export APCA_API_KEY_ID=\"$ALPACA_API_KEY\"")
    print("export APCA_API_SECRET_KEY=\"$ALPACA_SECRET_KEY\"")
    print("export APCA_API_BASE_URL=\"https://paper-api.alpaca.markets\"")
    print()
    print("# Step 4: Start OpenClaw Gateway")
    print("cd ~/openclaw-armoriq")
    print("pnpm dev gateway")
    print("=" * 60)
    
    print("\n⏳ After running these commands, you should see:")
    print('✅ "listening on ws://127.0.0.1:18789"')
    print('✅ "IAP Verification Service initialized"')
    print('✅ "CSRG proof headers are REQUIRED"')
    
    return True

def generate_openclaw_config():
    """Generate OpenClaw configuration"""
    print("\n⚙️ Generating OpenClaw configuration...")
    
    from backend.real_openclaw_integration import generate_openclaw_config
    config_dir = generate_openclaw_config()
    
    print(f"✅ OpenClaw config generated in {config_dir}")
    return config_dir

def test_connection():
    """Test if we can connect to OpenClaw"""
    print("\n🔌 Testing OpenClaw connection...")
    
    try:
        import asyncio
        import websockets
        import json
        
        async def test():
            try:
                async with websockets.connect("ws://127.0.0.1:18789", timeout=5) as ws:
                    await ws.send(json.dumps({"type": "ping"}))
                    response = await ws.recv()
                    print("✅ OpenClaw daemon is running and accessible!")
                    return True
            except Exception as e:
                print(f"❌ Cannot connect to OpenClaw daemon: {e}")
                print("Make sure you started: cd ~/openclaw-armoriq && pnpm dev gateway")
                return False
        
        return asyncio.run(test())
    except ImportError:
        print("❌ websockets not installed. Run: pip install websockets")
        return False
    except Exception as e:
        print(f"❌ Connection test failed: {e}")
        return False

def main():
    """Main setup process"""
    print_banner()
    
    # Check prerequisites
    if not check_prerequisites():
        sys.exit(1)
    
    # Generate OpenClaw config
    generate_openclaw_config()
    
    # Show installation commands
    install_openclaw()
    
    print("\n" + "🎯" * 60)
    print("    NEXT STEPS")
    print("🎯" * 60)
    print("1. Run the installation commands above in Git Bash/WSL")
    print("2. Start the OpenClaw daemon")
    print("3. Restart this Python backend (OPENCLAW_MODE=live)")
    print("4. Test with your dashboard at http://localhost:5173")
    print()
    print("Your AuraTrade will then use REAL OpenClaw agents! 🦞")

if __name__ == "__main__":
    main()
