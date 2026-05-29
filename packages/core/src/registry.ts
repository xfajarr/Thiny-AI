import type { Tool } from "./tool.js";

/**
 * An in-memory store for the tools registered in one agent instance.
 *
 * Populated during the plugin loading phase (Phase 1 of `loadPlugins`).
 * After loading completes the registry is effectively immutable for the
 * lifetime of the agent — no runtime registration or removal is supported
 * to prevent race conditions in concurrent runs.
 */
export class ToolRegistry {
  private readonly map = new Map<string, Tool>();

  /**
   * Register a tool.
   * Tool names must be unique across all registered tools.
   *
   * @throws {Error} When a tool with the same name is already registered.
   *   The error message includes the conflicting tool name and a hint to
   *   check which plugin contributed the duplicate.
   */
  register(tool: Tool): void {
    if (this.map.has(tool.name)) {
      throw new Error(
        `Tool already registered: "${tool.name}". ` +
          `Check for duplicate tool names across your plugins.`,
      );
    }
    this.map.set(tool.name, tool);
  }

  /**
   * Retrieve a tool by name.
   *
   * @throws {Error} When no tool with the given name is registered.
   *   The error includes the total count of registered tools.
   *   Tool names are intentionally omitted from the error message to avoid
   *   leaking the agent's capability surface in multi-tenant environments.
   *   Use `registry.all()` in your own debug tooling to inspect names.
   */
  get(name: string): Tool {
    const tool = this.map.get(name);
    if (!tool) {
      throw new Error(
        `Unknown tool: "${name}". ` +
          `${String(this.map.size)} tool(s) are registered. ` +
          `Check that the plugin providing this tool was loaded.`,
      );
    }
    return tool;
  }

  /** Return all registered tools in insertion order. */
  all(): Tool[] {
    return [...this.map.values()];
  }
}
