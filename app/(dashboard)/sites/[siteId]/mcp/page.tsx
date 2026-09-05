import { redirect } from "next/navigation";

/** The MCP setup lives in the account settings now; keep old links working. */
export default async function McpPage() {
  redirect("/settings#mcp");
}
