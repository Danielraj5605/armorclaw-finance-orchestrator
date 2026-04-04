#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test OpenClaw LIVE mode with real Gemini agents."""

import sys
import os

# Fix encoding for Windows
if sys.stdout.encoding != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from dotenv import load_dotenv
import asyncio
import json
from backend.openclaw_bridge import run_live_pipeline, is_live_mode

# Load environment
load_dotenv()

print("=" * 60)
print("OpenClaw LIVE Mode with Real Gemini Agents")
print("=" * 60)
print(f"OPENCLAW_MODE: {os.getenv('OPENCLAW_MODE')}")
print(f"is_live_mode(): {is_live_mode()}")
print(f"Gateway URL: {os.getenv('OPENCLAW_WS', 'ws://127.0.0.1:18789')}")
print()


async def test():
    events = {}
    print("Submitting trade to OpenClaw gateway (real agents)...\n")
    
    await run_live_pipeline('live-001', 'BUY', 'BTC/USD', 50, events)
    
    queue = events['live-001']
    count = 0
    start_time = None
    
    while count < 50:
        msg = await queue.get()
        if msg is None:
            print("\n[DONE] Stream ended")
            break
        
        if start_time is None:
            import time
            start_time = time.time()
        
        # Pretty print each event
        print(json.dumps(msg, indent=2))
        print()
        count += 1
    
    print(f"\nTotal events: {count}")


if __name__ == "__main__":
    asyncio.run(test())
