export type BrowserTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {readOnlyHint: boolean; untrustedContentHint: boolean};
  execute: (input?: Record<string, unknown>) => unknown;
};
export function browserModelContext() {
  return (document as Document & {modelContext?: {registerTool: (tool: BrowserTool, options: {signal: AbortSignal}) => unknown}}).modelContext;
}
