/**
 * Unified LLM helper.
 *
 *  - Anthropic Claude — used for high-quality reasoning (audits, help center)
 *  - Workers AI       — used for cheap first-pass classification (cron monitor)
 *
 * If AI_GATEWAY_NAME is set on the environment, all Anthropic calls are
 * routed through Cloudflare AI Gateway, which gives us:
 *   - cache on identical prompts (huge win for idempotent rule audits)
 *   - one place to see every LLM call we make
 *   - rate-limit smoothing + automatic retries
 * If it's not set, calls fall back to direct api.anthropic.com.
 */

export class LlmNotConfiguredError extends Error {
  constructor(reason: string) {
    super(`LLM not configured: ${reason}`);
  }
}

type AnthropicMessage = { role: "user" | "assistant"; content: string };

export type AnthropicRequest = {
  model?: string;
  system?: string;
  messages: AnthropicMessage[];
  maxTokens?: number;
  temperature?: number;
};

export type AnthropicResponse = {
  text: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
};

const DEFAULT_MODEL = "claude-sonnet-4-6";

function anthropicEndpoint(env: Env): string {
  const account: string = env.AI_GATEWAY_ACCOUNT_ID ?? "";
  const gw: string = env.AI_GATEWAY_NAME ?? "";
  if (account && gw && !gw.startsWith("set-")) {
    return `https://gateway.ai.cloudflare.com/v1/${account}/${gw}/anthropic/v1/messages`;
  }
  return "https://api.anthropic.com/v1/messages";
}

export async function anthropicComplete(
  env: Env,
  req: AnthropicRequest,
): Promise<AnthropicResponse> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key || key === "set-in-keys-pass") {
    throw new LlmNotConfiguredError("ANTHROPIC_API_KEY not set");
  }
  const model = req.model ?? DEFAULT_MODEL;
  const res = await fetch(anthropicEndpoint(env), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: req.system,
      messages: req.messages,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.2,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    model: string;
    usage: { input_tokens: number; output_tokens: number };
  };
  const text = (json.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
  return {
    text,
    modelUsed: json.model,
    inputTokens: json.usage.input_tokens,
    outputTokens: json.usage.output_tokens,
  };
}

/**
 * Cheap classification via Workers AI. Use for high-frequency, low-stakes
 * decisions like "did this state DMV page change in a material way?"
 */
export type WorkersAIClassifyResult = {
  text: string;
  modelUsed: string;
};

const WORKERS_AI_DEFAULT = "@cf/meta/llama-3.1-8b-instruct";

export async function workersAiPrompt(
  env: Env,
  args: { prompt: string; system?: string; model?: string; maxTokens?: number },
): Promise<WorkersAIClassifyResult> {
  if (!env.AI) {
    throw new LlmNotConfiguredError("Workers AI binding (AI) not configured");
  }
  const model = args.model ?? WORKERS_AI_DEFAULT;
  // The Workers AI binding's `.run` is typed loosely; the runtime accepts
  // either {prompt} or {messages}. We use messages because system+user
  // separation matters for classification accuracy.
  const messages = [
    ...(args.system ? [{ role: "system" as const, content: args.system }] : []),
    { role: "user" as const, content: args.prompt },
  ];
  const result = (await env.AI.run(model as never, {
    messages,
    max_tokens: args.maxTokens ?? 256,
  } as never)) as { response?: string } | string;
  const text =
    typeof result === "string" ? result : (result?.response ?? "");
  return { text, modelUsed: model };
}

/**
 * Parse a structured JSON response from a model. Tolerant of code fences
 * and trailing prose.
 */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  // Strip ```json ... ``` fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  // Find the first { or [
  const start = candidate.search(/[\{\[]/);
  if (start < 0) return null;
  // Find the matching brace by tracking depth (simple, not bullet-proof
  // but enough for well-formed model output)
  const stack: string[] = [];
  const opens: Record<string, string> = { "{": "}", "[": "]" };
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (c === "{" || c === "[") stack.push(opens[c]);
    else if (c === "}" || c === "]") {
      const expected = stack.pop();
      if (expected !== c) return null;
      if (stack.length === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    } else if (c === '"') {
      // skip the rest of the string
      i++;
      while (i < candidate.length && candidate[i] !== '"') {
        if (candidate[i] === "\\") i++;
        i++;
      }
    }
  }
  return null;
}
