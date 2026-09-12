# Blender MCP installation

Installed 12 September 2026 from Homebrew and the maintained ahujasid/blender-mcp project:

- Blender 5.2.1 LTS: `/Applications/Blender.app`
- uv 0.12.10: `/opt/homebrew/bin/uvx`
- MCP add-on 1.6, protocol 5, enabled in Blender's saved user preferences
- Codex MCP server name: `blender`
- Command: `/opt/homebrew/bin/uvx --python 3.12 blender-mcp`
- Environment: `DISABLE_TELEMETRY=true`, `BLENDER_HOST=127.0.0.1`
- Blender listener: localhost port 9876; telemetry consent disabled in the add-on

Verified using an MCP client: initialize, list tools, and get_scene_info all succeeded against the running Blender GUI. The actual scene contained Cube, Camera and Light. This is a connection check, not merely a saved config check.

Codex may need a restart before the newly registered MCP tools appear in its tool list. Keep Blender open while using them. In Blender, the viewport sidebar (N) has an MCP for Blender panel with connection controls. Scene generation and headless rendering work independently of the MCP connection.

Source and setup: https://github.com/ahujasid/blender-mcp

No API keys or paid external asset services are required for the delivered scenes.
