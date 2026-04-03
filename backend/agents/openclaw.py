from enum import Enum
from typing import List, Callable

class Role(Enum):
    ANALYST = "Analyst"
    RISK = "Risk"
    TRADER = "Trader"

class ToolAccessDeniedError(Exception):
    pass

class OpenClawAgent:
    """
    OpenClaw wrapper that structurally ensures an LLM can only execute
    the tools explicitly permitted for its role, providing Role-Based Access Control
    to LangGraph/LangChain agents.
    """
    def __init__(self, name: str, role: Role, llm, allowed_tools: List[str], system_prompt: str):
        self.name = name
        self.role = role
        self.llm = llm
        self.allowed_tools = set(allowed_tools)
        self.system_prompt = system_prompt
        self.tools = []

    def register_tools(self, available_tools: List[Callable]):
        """
        Binds only the allowed tools to the agent.
        If a user accidentally passes a forbidden tool, OpenClaw rejects it.
        """
        for tool in available_tools:
            tool_name = getattr(tool, "name", tool.__name__)
            if tool_name in self.allowed_tools:
                self.tools.append(tool)
            else:
                # Optionally log that a tool was filtered
                pass
        
        # In Langchain, we bind tools to the LLM making them callable
        if self.tools:
            self.llm = self.llm.bind_tools(self.tools)

    def enforce_tool_call(self, tool_name: str):
        """
        Hard enforcement method. Should be called by the orchestrator 
        before executing any ToolMessage produced by the LLM.
        """
        if tool_name not in self.allowed_tools:
            raise ToolAccessDeniedError(
                f"[OpenClaw Violation] {self.name} ({self.role.value}) attempted "
                f"to call restricted tool: '{tool_name}'."
            )
        return True
