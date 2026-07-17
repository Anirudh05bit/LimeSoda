import asyncio
import os
import sys
import json
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def test_mcp():
    python_exe = sys.executable or "python"
    server_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server", "mcp_server.py"))
    
    print(f"Python Executable: {python_exe}")
    print(f"Server Path: {server_path}")
    
    server_params = StdioServerParameters(
        command=python_exe,
        args=[server_path],
        env=os.environ.copy()
    )
    
    try:
        async with stdio_client(server_params) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                print("Initializing session...")
                await session.initialize()
                print("Session initialized successfully!")
                
                print("Listing tools...")
                tools = await session.list_tools()
                print(f"Tools discovered: {[t.name for t in tools.tools]}")
                
                print("Calling get_transaction for TX2002...")
                res = await session.call_tool("get_transaction", {"transaction_id": "TX2002"})
                print(f"Result type: {type(res)}")
                print(f"Result content: {res}")
                
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_mcp())
