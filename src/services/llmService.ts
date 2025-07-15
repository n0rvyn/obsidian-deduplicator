import { DeduplicatorSettings, LLMRequest } from "../types";

/**
 * Service for interacting with various LLM providers
 */
export class LLMService {
  private settings: DeduplicatorSettings;

  constructor(settings: DeduplicatorSettings) {
    this.settings = settings;
  }

  /**
   * Call the configured LLM provider
   * @param request The LLM request
   * @returns Promise that resolves to the LLM response
   */
  async call(request: LLMRequest): Promise<string> {
    if (!this.settings.enableLLM) {
      throw new Error("LLM is not enabled");
    }

    if (!this.settings.apiKey) {
      throw new Error("API key is required");
    }

    switch (this.settings.llmProvider) {
      case "openai":
        return this.callOpenAI(request);
      case "azure":
        return this.callAzure(request);
      case "zhipu":
        return this.callZhipu(request);
      case "qwen":
        return this.callQwen(request);
      case "custom":
        return this.callCustom(request);
      default:
        throw new Error(`Unsupported LLM provider: ${this.settings.llmProvider}`);
    }
  }

  /**
   * Call OpenAI API
   * @param request The LLM request
   * @returns Promise that resolves to the response
   */
  private async callOpenAI(request: LLMRequest): Promise<string> {
    const url = "https://api.openai.com/v1/chat/completions";
    return this.genericFetch(url, request);
  }

  /**
   * Call Azure OpenAI API
   * @param request The LLM request
   * @returns Promise that resolves to the response
   */
  private async callAzure(request: LLMRequest): Promise<string> {
    if (!this.settings.endpoint) {
      throw new Error("Azure endpoint is required");
    }
    return this.genericFetch(this.settings.endpoint, request);
  }

  /**
   * Call Zhipu AI API
   * @param request The LLM request
   * @returns Promise that resolves to the response
   */
  private async callZhipu(request: LLMRequest): Promise<string> {
    const url = "https://open.bigmodel.cn/api/paas/v3/model-api/chatglm_turbo/invoke";
    return this.genericFetch(url, request);
  }

  /**
   * Call Qwen API
   * @param request The LLM request
   * @returns Promise that resolves to the response
   */
  private async callQwen(request: LLMRequest): Promise<string> {
    const url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation";
    return this.genericFetch(url, request);
  }

  /**
   * Call custom API endpoint
   * @param request The LLM request
   * @returns Promise that resolves to the response
   */
  private async callCustom(request: LLMRequest): Promise<string> {
    if (!this.settings.endpoint) {
      throw new Error("Custom endpoint is required");
    }
    return this.genericFetch(this.settings.endpoint, request);
  }

  /**
   * Generic fetch function for API calls
   * @param url The API endpoint URL
   * @param request The LLM request
   * @returns Promise that resolves to the response
   */
  private async genericFetch(url: string, request: LLMRequest): Promise<string> {
    if (!url || !this.settings.apiKey) {
      throw new Error("Missing API URL or key");
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.settings.apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userPrompt }
          ],
          temperature: this.settings.temperature
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const json = await response.json();
      const content = json.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("No content returned from LLM");
      }

      return content;
    } catch (error) {
      console.error("LLM API error:", error);
      throw new Error(`LLM API call failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Test the LLM connection
   * @returns Promise that resolves to true if connection is successful
   */
  async testConnection(): Promise<boolean> {
    try {
      const testRequest: LLMRequest = {
        systemPrompt: "You are a helpful assistant.",
        userPrompt: "Say 'Hello' if you can understand this message."
      };

      const response = await this.call(testRequest);
      return response.toLowerCase().includes("hello");
    } catch (error) {
      console.error("LLM connection test failed:", error);
      return false;
    }
  }
}

// Legacy function for backward compatibility
export async function callLLM(settings: DeduplicatorSettings, request: LLMRequest): Promise<string> {
  const service = new LLMService(settings);
  return service.call(request);
}