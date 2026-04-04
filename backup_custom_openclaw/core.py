from enum import Enum
from typing import List, Callable, Sequence, Any
from langchain_core.language_models.chat_models import BaseChatModel
from langgraph.prebuilt import create_react_agent
from langgraph.prebuilt.tool_node import ToolNode

class Role(Enum):
    ANALYST = "Analyst"
    RISK = "Risk"
    TRADER = "Trader"
    SUPERVISOR = "Supervisor"

class ToolAccessDeniedError(Exception):
    """Raised when an OpenClaw agent attempts to call a tool outside its allowed scope."""
    pass

class ClawEnforcerNode(ToolNode):
    """
    OpenClaw's custom execution node.
    It structurally intercepts all tool execution requests from the LLM.
    If the LLM hallucinates or maliciously attempts to call a tool not in the allowed list,
    it rejects the execution deterministically before any code is run.
    """
    def __init__(self, tools: Sequence[Callable], allowed_tool_names: set, agent_name: str, agent_role: str):
        super().__init__(tools)
        self.allowed_tool_names = allowed_tool_names
        self.agent_name = agent_name
        self.agent_role = agent_role

    def _invoke_tool(self, tool_call: dict, config: Any) -> Any:
        name = tool_call.get("name")
        if name not in self.allowed_tool_names:
            msg = (f"[OpenClaw Violation] Agent '{self.agent_name}' (Role: {self.agent_role}) "
                   f"attempted to call unauthorized tool '{name}'. "
                   f"Allowed tools: {list(self.allowed_tool_names)}")
            raise ToolAccessDeniedError(msg)
        # Pass to the standard LangGraph tool executor if safe
        return super()._invoke_tool(tool_call, config)


class OpenClawAgent:
    """
    The OpenClaw wrapper builder.
    Constructs a specialized LangGraph agent bound strictly to its declared role limits.
    """
    def __init__(
        self,
        name: str,
        role: Role,
        llm: BaseChatModel,
        allowed_tools: List[str],
        system_prompt: str
    ):
        self.name = name
        self.role = role
        self.llm = llm
        self.allowed_tools = set(allowed_tools)
        self.system_prompt = system_prompt

    def compile(self, available_tools: List[Callable]):
        """
        Builds the LangGraph agent graph with the OpenClaw interceptor acting as the firewall.
        """
        # 1. Filter tools so the LLM only binds to tools in its allowlist
        bound_tools = []
        for tool in available_tools:
            tool_name = getattr(tool, "name", tool.__name__)
            if tool_name in self.allowed_tools:
                bound_tools.append(tool)

        # 2. Create the interceptor node (the "Armor")
        interceptor = ClawEnforcerNode(
            tools=bound_tools,
            allowed_tool_names=self.allowed_tools,
            agent_name=self.name,
            agent_role=self.role.value
        )
        
        # 3. Compile the actual graph using create_react_agent
        app = create_react_agent(
            model=self.llm,
            tools=interceptor,
            state_modifier=self.system_prompt
        )
        
        return app
