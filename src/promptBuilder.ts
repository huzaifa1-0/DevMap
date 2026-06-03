import * as promptTemplates from '../data/prompts.json';

export class PromptBuilder {
  public static buildExplainPrompt(topicLabel: string, codeSnippet: string): string {
    const template = promptTemplates.explain;
    return template
      .replace(/{topic}/g, topicLabel)
      .replace(/{codeSnippet}/g, codeSnippet);
  }

  public static buildQuizPrompt(topicLabel: string, codeSnippet: string): string {
    const template = promptTemplates.quiz;
    return template
      .replace(/{topic}/g, topicLabel)
      .replace(/{codeSnippet}/g, codeSnippet);
  }

  public static buildSuggestPrompt(coveredList: string[], remainingList: string[]): string {
    const template = promptTemplates.suggest;
    return template
      .replace(/{coveredList}/g, coveredList.join(', ') || 'None')
      .replace(/{remainingList}/g, remainingList.join(', ') || 'None');
  }
}
