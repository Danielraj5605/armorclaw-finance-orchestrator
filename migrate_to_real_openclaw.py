#!/usr/bin/env python3
"""
Migration Script: Custom OpenClaw → Real OpenClaw
Run this script to migrate your existing AuraTrade project to use real OpenClaw
"""
import os
import sys
import json
import subprocess
from pathlib import Path

def print_banner():
    print("🦞" * 60)
    print("    AuraTrade Migration: Custom OpenClaw → Real OpenClaw")
    print("🦞" * 60)
    print()

def check_prerequisites():
    """Check if all prerequisites are met"""
    print("🔍 Checking prerequisites...")
    
    # Check if .env exists
    if not os.path.exists(".env"):
        print("❌ .env file not found. Please create it from .env.example")
        return False
    
    # Load and check environment variables
    from dotenv import load_dotenv
    load_dotenv()
    
    required_vars = [
        "GEMINI_API_KEY",
        "ARMORIQ_API_KEY", 
        "ALPACA_API_KEY",
        "ALPACA_SECRET_KEY"
    ]
    
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        print(f"❌ Missing environment variables: {missing_vars}")
        print("Please add these to your .env file")
        return False
    
    print("✅ All prerequisites met")
    return True

def backup_custom_implementation():
    """Backup the custom OpenClaw implementation"""
    print("💾 Backing up custom OpenClaw implementation...")
    
    backup_dir = Path("backup_custom_openclaw")
    backup_dir.mkdir(exist_ok=True)
    
    # Copy custom OpenClaw files to backup
    import shutil
    custom_files = [
        "backend/openclaw/__init__.py",
        "backend/openclaw/core.py", 
        "backend/demo_openclaw.py"
    ]
    
    for file_path in custom_files:
        if os.path.exists(file_path):
            dest = backup_dir / Path(file_path).name
            shutil.copy2(file_path, dest)
            print(f"  ✅ Backed up {file_path}")
    
    print(f"✅ Custom implementation backed up to {backup_dir}")
    return backup_dir

def generate_openclaw_config():
    """Generate OpenClaw configuration files"""
    print("⚙️ Generating OpenClaw configuration...")
    
    from backend.real_openclaw_integration import generate_openclaw_config
    config_dir = generate_openclaw_config()
    
    print(f"✅ OpenClaw config generated in {config_dir}")
    return config_dir

def update_env_file():
    """Update .env file for real OpenClaw"""
    print("📝 Updating .env file for real OpenClaw...")
    
    env_path = Path(".env")
    if not env_path.exists():
        print("❌ .env file not found")
        return False
    
    # Read current .env
    with open(env_path, 'r') as f:
        content = f.read()
    
    # Add or update OPENCLAW_MODE
    if "OPENCLAW_MODE=" in content:
        content = content.replace("OPENCLAW_MODE=demo", "OPENCLAW_MODE=live")
    else:
        content += "\nOPENCLAW_MODE=live\n"
    
    # Write back
    with open(env_path, 'w') as f:
        f.write(content)
    
    print("✅ Updated .env file with OPENCLAW_MODE=live")
    return True

def print_installation_instructions():
    """Print instructions for installing real OpenClaw"""
    print("\n" + "🚀" * 60)
    print("    INSTALLATION INSTRUCTIONS")
    print("🚀" * 60)
    print()
    print("⚠️  IMPORTANT: Run these commands in Git Bash or WSL, NOT PowerShell!")
    print()
    print("1️⃣ Install Real OpenClaw with ArmorClaw:")
    print("   curl -fsSL https://armoriq.ai/install-armorclaw.sh | bash -s -- \\")
    print("     --gemini-key $GEMINI_API_KEY \\")
    print("     --api-key $ARMORIQ_API_KEY \\")
    print("     --no-prompt")
    print()
    print("2️⃣ Install Alpaca Trading Skill:")
    print("   clawhub install lacymorrow/alpaca-trading-skill")
    print()
    print("3️⃣ Configure Alpaca keys:")
    print("   export APCA_API_KEY_ID=\"$ALPACA_API_KEY\"")
    print("   export APCA_API_SECRET_KEY=\"$ALPACA_SECRET_KEY\"")
    print("   export APCA_API_BASE_URL=\"https://paper-api.alpaca.markets\"")
    print()
    print("4️⃣ Start OpenClaw Gateway:")
    print("   cd ~/openclaw-armoriq")
    print("   pnpm dev gateway")
    print()
    print("5️⃣ Start your AuraTrade backend (new terminal):")
    print("   cd", os.getcwd())
    print("   uvicorn backend.main:app --host 0.0.0.0 --port 8000")
    print()
    print("6️⃣ Start your frontend (new terminal):")
    print("   cd website && npm run dev")
    print()
    print("🎯 Your dashboard will now use REAL OpenClaw agents!")

def create_migration_summary():
    """Create a summary of what was migrated"""
    summary = {
        "migration_date": str(Path.cwd()),
        "changes_made": [
            "Created backend/real_openclaw_integration.py - Real OpenClaw bridge",
            "Created backend/agents/real_openclaw_orchestrator.py - Real OpenClaw pipeline",
            "Updated backend/main.py - Added real OpenClaw import and routing",
            "Generated ~/.openclaw/openclaw.json configuration",
            "Updated .env file with OPENCLAW_MODE=live"
        ],
        "backup_location": "backup_custom_openclaw/",
        "next_steps": [
            "Install real OpenClaw using the provided commands",
            "Start OpenClaw daemon",
            "Test with existing dashboard"
        ]
    }
    
    with open("migration_summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    
    print("📋 Migration summary saved to migration_summary.json")

def main():
    """Main migration process"""
    print_banner()
    
    # Check prerequisites
    if not check_prerequisites():
        sys.exit(1)
    
    # Backup custom implementation
    backup_dir = backup_custom_implementation()
    
    # Generate OpenClaw config
    config_dir = generate_openclaw_config()
    
    # Update .env file
    update_env_file()
    
    # Create migration summary
    create_migration_summary()
    
    # Print installation instructions
    print_installation_instructions()
    
    print("\n" + "✅" * 60)
    print("    MIGRATION PREPARATION COMPLETE!")
    print("✅" * 60)
    print()
    print("What's been done:")
    print("✅ Backed up your custom OpenClaw implementation")
    print("✅ Created real OpenClaw integration code")
    print("✅ Generated OpenClaw configuration files")
    print("✅ Updated your .env for live mode")
    print()
    print("Next: Follow the installation instructions above to complete the migration!")

if __name__ == "__main__":
    main()
