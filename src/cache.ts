export class AICache {
  private static instance: AICache;
  private explanationCache: Map<string, string> = new Map();
  private quizCache: Map<string, any[]> = new Map();
  private lastRequestTime = 0;
  private cooldownMs = 2000;

  private constructor() {}

  public static getInstance(): AICache {
    if (!AICache.instance) {
      AICache.instance = new AICache();
    }
    return AICache.instance;
  }

  public getExplanation(topicId: string): string | undefined {
    return this.explanationCache.get(topicId);
  }

  public setExplanation(topicId: string, text: string): void {
    this.explanationCache.set(topicId, text);
  }

  public getQuiz(topicId: string): any[] | undefined {
    return this.quizCache.get(topicId);
  }

  public setQuiz(topicId: string, quiz: any[]): void {
    this.quizCache.set(topicId, quiz);
  }

  public clear(): void {
    this.explanationCache.clear();
    this.quizCache.clear();
  }

  /**
   * Delays execution if the previous request occurred too recently, protecting rate limits.
   */
  public async enforceCooldown(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.cooldownMs) {
      const waitTime = this.cooldownMs - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Simulates a streaming typewriter output for cached explanations to maintain UI/UX flow.
   */
  public simulateStream(
    text: string,
    onToken: (token: string) => void,
    speedMs = 10
  ): Promise<void> {
    return new Promise((resolve) => {
      let index = 0;
      const interval = setInterval(() => {
        if (index < text.length) {
          const chunkSize = Math.min(8, text.length - index);
          onToken(text.substr(index, chunkSize));
          index += chunkSize;
        } else {
          clearInterval(interval);
          resolve();
        }
      }, speedMs);
    });
  }
}
