import "server-only";

/**
 * The AI desk: the one place that decides which model handles which task and talks to the API.
 * Screens and jobs ask for a task by name, so a model can be changed here without touching them.
 * People always decide: nothing here sends, pays or deletes anything.
 */
export type AiTask =
  | "drustva_triage" // classify a reply from a društvo and draft an answer
  | "web_reservation" // read a reservation e-mail from the website form
  | "morning_brief" // short plain-language summary of the day for the manager
  | "inbox_triage" // label an incoming e-mail, summarise it, draft an answer, read a bill attached to it
  | "bill_extract"; // read the figures printed on one supplier invoice (PDF or photo)

interface TaskConfig {
  /** Environment variable that can override the model for this task only. */
  modelEnv: string;
  maxTokens: number;
}

const TASKS: Record<AiTask, TaskConfig> = {
  drustva_triage: { modelEnv: "ANTHROPIC_MODEL_TRIAGE", maxTokens: 1200 },
  web_reservation: { modelEnv: "ANTHROPIC_MODEL_RESERVATION", maxTokens: 1200 },
  morning_brief: { modelEnv: "ANTHROPIC_MODEL_BRIEF", maxTokens: 700 },
  inbox_triage: { modelEnv: "ANTHROPIC_MODEL_INBOX", maxTokens: 1800 },
  bill_extract: { modelEnv: "ANTHROPIC_MODEL_BILL", maxTokens: 900 },
};

const DEFAULT_MODEL = "claude-sonnet-5-5";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function modelFor(task: AiTask): string {
  return process.env[TASKS[task].modelEnv] || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

interface ApiResponse {
  content?: { type: string; name?: string; input?: unknown; text?: string }[];
  error?: { message?: string };
}

async function call(task: AiTask, body: Record<string, unknown>): Promise<{ json: ApiResponse; model: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const model = modelFor(task);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: TASKS[task].maxTokens, ...body }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as ApiResponse;
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${json.error?.message ?? "napaka"}`);
  return { json, model };
}

/** Structured answer: the model must call the given tool exactly once and its input is returned. */
export async function aiTool(
  task: AiTask,
  args: {
    system: string;
    user: string;
    tool: { name: string } & Record<string, unknown>;
    /** PDFs or images the model should read together with the text (e.g. a bill attached to an e-mail). */
    files?: { mediaType: string; base64: string }[];
  },
): Promise<{ input: unknown; model: string }> {
  const content: unknown =
    args.files && args.files.length > 0
      ? [
          ...args.files.map((f) =>
            f.mediaType === "application/pdf"
              ? { type: "document", source: { type: "base64", media_type: f.mediaType, data: f.base64 } }
              : { type: "image", source: { type: "base64", media_type: f.mediaType, data: f.base64 } },
          ),
          { type: "text", text: args.user },
        ]
      : args.user;
  const { json, model } = await call(task, {
    system: args.system,
    messages: [{ role: "user", content }],
    tools: [args.tool],
    tool_choice: { type: "tool", name: args.tool.name },
  });
  const block = json.content?.find((b) => b.type === "tool_use" && b.name === args.tool.name);
  if (!block) throw new Error(`Model did not return the ${args.tool.name} tool call`);
  return { input: block.input, model };
}

/** Free text answer (summaries). */
export async function aiText(task: AiTask, args: { system: string; user: string }): Promise<{ text: string; model: string }> {
  const { json, model } = await call(task, {
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });
  const text = (json.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
  if (!text) throw new Error("Model returned no text");
  return { text, model };
}
