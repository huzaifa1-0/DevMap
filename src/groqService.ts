import Groq from 'groq-sdk';
import { SecretStore } from './secretStore';

export class GroqService {
  private static instance: GroqService;

  private constructor() {}

  public static getInstance(): GroqService {
    if (!GroqService.instance) {
      GroqService.instance = new GroqService();
    }
    return GroqService.instance;
  }

  private async getClient(): Promise<Groq> {
    const apiKey = await SecretStore.getInstance().getApiKey();
    if (!apiKey) {
      throw new Error('APIKeyMissing');
    }
    return new Groq({ apiKey });
  }

  /**
   * Streams chat completions back to the caller chunk-by-chunk.
   */
  public async streamChatCompletion(
    prompt: string,
    onToken: (token: string) => void,
    abortSignal?: AbortSignal
  ): Promise<string> {
    const groq = await this.getClient();
    const responseStream = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      stream: true,
    }, { signal: abortSignal });

    let fullText = '';
    for await (const chunk of responseStream) {
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        fullText += token;
        onToken(token);
      }
    }
    return fullText;
  }

  /**
   * Gets a standard non-streamed chat completion.
   */
  public async getChatCompletion(
    prompt: string,
    abortSignal?: AbortSignal
  ): Promise<string> {
    const groq = await this.getClient();
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      stream: false,
    }, { signal: abortSignal });

    return completion.choices[0]?.message?.content || '';
  }
}
