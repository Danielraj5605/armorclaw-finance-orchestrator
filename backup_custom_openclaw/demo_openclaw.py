import os
import sys

# Add parent to path if run directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.openclaw import OpenClawAgent, Role, ToolAccessDeniedError
from langchain_core.tools import tool

# ── 1. Define all systemic tools ──────────────────────────────────────────────
@tool("market-data")
def market_data(ticker: str) -> str:
    """Fetches real-time market data for a given ticker."""
    return f"Latest data for {ticker}: Price is $145.20, Trend is UP."

@tool("get_account")
def get_account() -> str:
    """Fetches the user's brokerage account equity and balance."""
    return "Account equity is $100,000. Purchasing power is $200,000."

@tool("alpaca-trading:execute")
def execute_trade(ticker: str, action: str, amount: float) -> str:
    """Actually submits a live order to the exchange."""
    return f"ORDER FILLED: {action} {ticker} for ${amount}."

ALL_TOOLS = [market_data, get_account, execute_trade]

# ── 2. Create a Dummy LLM for testing without an API Key ─────────────────────
# (In a real run, this would be ChatGoogleGenerativeAI or ChatOpenAI)
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage

# We will test two scenarios:
# 1. Analyst legally calling "market-data"
# 2. Analyst illegally hallucinating "get_account"

def run_test_scenario(scenario_name: str, tool_to_call: str):
    print(f"\n[{scenario_name}] ⟷ Attempting to call: {tool_to_call}")
    
    # Fake LLM that immediately tries to invoke the specified tool
    fake_llm = FakeMessagesListChatModel(responses=[
        AIMessage(content="", tool_calls=[{"name": tool_to_call, "args": {"ticker": "NVDA"}, "id": "call_123"}])
    ])

    # ── 3. Build the OpenClaw Agent ──────────────────────────────────────────
    # The Analyst is ONLY allowed to access market-data.
    analyst_builder = OpenClawAgent(
        name="AnalystAgent",
        role=Role.ANALYST,
        llm=fake_llm,
        allowed_tools=["market-data"], # <-- The Strict Firewall Rule
        system_prompt="You are a market analyst. Use your tools to evaluate the market."
    )

    # OpenClaw compiles the strict graph
    analyst_graph = analyst_builder.compile(ALL_TOOLS)

    # ── 4. Execute the Graph ──────────────────────────────────────────────────
    try:
        # We start the agent
        result = analyst_graph.invoke({"messages": [("user", f"Evaluate NVDA using {tool_to_call}")]})
        for msg in result["messages"]:
            if msg.type == "tool":
                print(f"✅ SUCCESS: Tool execution allowed! Result: {msg.content}")
                
    except Exception as e:
        # We expect a ToolAccessDeniedError if the LLM hallucinated
        print(f"🚫 BLOCKED by OpenClaw:\n   {str(e)}")

if __name__ == "__main__":
    print("==========================================================")
    print("🛡️ OpenClaw Architecture Test")
    print("==========================================================")
    
    # Scenario A: The Analyst calls the allowed tool
    run_test_scenario("Scenario A", tool_to_call="market-data")
    
    # Scenario B: The Analyst tries to peer into the user's bank account
    run_test_scenario("Scenario B", tool_to_call="get_account")
    
    # Scenario C: The Analyst tries to execute a live trade
    run_test_scenario("Scenario C", tool_to_call="alpaca-trading:execute")
