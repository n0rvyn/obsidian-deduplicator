import { DeduplicatorSettings } from "./settings";

export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
}

export async function callLLM(settings: DeduplicatorSettings, req: LLMRequest): Promise<string> {
  switch (settings.llmProvider) {
    case "openai":
      return callOpenAI(settings, req);
    case "azure":
      return callAzure(settings, req);
    case "zhipu":
      return callZhipu(settings, req);
    case "qwen":
      return callQwen(settings, req);
    case "custom":
      return callCustom(settings, req);
    default:
      throw new Error("Unsupported provider");
  }
}

async function callOpenAI(settings: DeduplicatorSettings, req: LLMRequest): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions";
  return genericFetch(url, settings.apiKey, req);
}

async function callAzure(settings: DeduplicatorSettings, req: LLMRequest): Promise<string> {
  return genericFetch(settings.endpoint, settings.apiKey, req);
}

async function callZhipu(settings: DeduplicatorSettings, req: LLMRequest): Promise<string> {
  const url = "https://open.bigmodel.cn/api/paas/v3/model-api/chatglm_turbo/invoke";
  return genericFetch(url, settings.apiKey, req);
}

async function callQwen(settings: DeduplicatorSettings, req: LLMRequest): Promise<string> {
  const url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation";
  return genericFetch(url, settings.apiKey, req);
}

async function callCustom(settings: DeduplicatorSettings, req: LLMRequest): Promise<string> {
  return genericFetch(settings.endpoint, settings.apiKey, req);
}

async function genericFetch(url: string, apiKey: string, req: LLMRequest): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPrompt }
      ],
      temperature: 0.7
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}