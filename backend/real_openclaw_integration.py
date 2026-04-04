"""
Real OpenClaw Integration
Replace custom LangGraph agents with real OpenClaw daemon
"""
import asyncio
import json
import websockets
from typing import Dict, Any
import os

class RealOpenClawBridge:
    """
    Bridge to real OpenClaw daemon running on port 18789
    Replaces the custom LangGraph implementation
    """
    
    def __init__(self):
        self.openclaw_ws = "ws://127.0.0.1:18789"
        self.session_id = "auratrade-main"
    
    async def send_agent_command(
        self, 
        agent_name: str,
        command: str,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Send command to specific OpenClaw agent
        """
        if metadata is None:
            metadata = {}
            
        message = {
            "type": "agent.send",
            "session": self.session_id,
            "agent": agent_name,
            "message": command,
            "metadata": metadata
        }
        
        async with websockets.connect(self.openclaw_ws) as ws:
            await ws.send(json.dumps(message))
            
            # Collect response
            response = await ws.recv()
            return json.loads(response)
    
    async def run_analyst_pipeline(self, ticker: str, action: str, amount_usd: float) -> Dict[str, Any]:
        """
        Run: Analyst → Risk → Trader pipeline using real OpenClaw
        """
        results = {}
        
        # Step 1: Analyst Agent
        analyst_cmd = f"Analyze {ticker} market conditions and provide a trade recommendation for {action} ${amount_usd:,.0f}"
        results['analyst'] = await self.send_agent_command(
            "AnalystAgent", 
            analyst_cmd,
            {"ticker": ticker, "action": action, "amount_usd": amount_usd}
        )
        
        # Step 2: Risk Agent (if analyst approves)
        if "recommend" in results['analyst'].get('message', '').lower():
            risk_cmd = f"Evaluate portfolio risk for {action} {ticker} ${amount_usd:,.0f} and issue delegation token if approved"
            results['risk'] = await self.send_agent_command(
                "RiskAgent",
                risk_cmd,
                {"ticker": ticker, "action": action, "amount_usd": amount_usd}
            )
            
            # Step 3: Trader Agent (if risk approves)
            if "delegation" in results['risk'].get('message', '').lower():
                trader_cmd = f"Execute {action} order for {ticker} ${amount_usd:,.0f} with delegation token"
                results['trader'] = await self.send_agent_command(
                    "TraderAgent",
                    trader_cmd,
                    {"ticker": ticker, "action": action, "amount_usd": amount_usd}
                )
        
        return results

# OpenClaw Agent Configuration for AuraTrade
OPENCLAW_AGENT_CONFIG = {
    "agents": {
        "AnalystAgent": {
            "role": "analyst",
            "system_prompt": "You are a market analyst. Use market-data and research tools to evaluate trading opportunities. Never execute trades.",
            "allowed_tools": ["market-data", "research", "news-analysis"],
            "model": "google/gemini-2.5-flash"
        },
        "RiskAgent": {
            "role": "risk", 
            "system_prompt": "You are a risk manager. Use read-only portfolio tools to assess exposure. Issue delegation tokens for approved trades. Never execute trades directly.",
            "allowed_tools": ["alpaca:get_positions", "alpaca:get_account", "calculate_exposure", "portfolio-analysis"],
            "model": "google/gemini-2.5-flash"
        },
        "TraderAgent": {
            "role": "trader",
            "system_prompt": "You are a trade executor. Only execute trades that have valid delegation tokens from RiskAgent. Use only alpaca:execute tool.",
            "allowed_tools": ["alpaca:execute"],
            "model": "google/gemini-2.5-flash"
        }
    },
    "skills": [
        "lacymorrow/alpaca-trading-skill",
        "market-data",
        "portfolio-analysis"
    ],
    "plugins": [
        "@armoriq/armorclaw"
    ]
}

def generate_openclaw_config():
    """
    Generate OpenClaw configuration files
    """
    config_dir = os.path.expanduser("~/.openclaw")
    os.makedirs(config_dir, exist_ok=True)
    
    # Main OpenClaw config
    openclaw_config = {
        "version": "1.0",
        "gateway": {
            "port": 18789,
            "host": "127.0.0.1"
        },
        "models": {
            "default": "google/gemini-2.5-flash",
            "providers": {
                "google": {
                    "apiKey": os.getenv("GEMINI_API_KEY"),
                    "baseURL": "https://generativelanguage.googleapis.com"
                }
            }
        },
        "agents": OPENCLAW_AGENT_CONFIG["agents"],
        "skills": OPENCLAW_AGENT_CONFIG["skills"],
        "plugins": OPENCLAW_AGENT_CONFIG["plugins"]
    }
    
    # Write config
    with open(os.path.join(config_dir, "openclaw.json"), "w") as f:
        json.dump(openclaw_config, f, indent=2)
    
    print(f"✅ OpenClaw config written to {config_dir}/openclaw.json")
    return config_dir
