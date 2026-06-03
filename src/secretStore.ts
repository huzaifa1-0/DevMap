import * as vscode from 'vscode';

export class SecretStore {
  private static instance: SecretStore;
  private secrets: vscode.SecretStorage | null = null;

  private constructor() {}

  public static getInstance(): SecretStore {
    if (!SecretStore.instance) {
      SecretStore.instance = new SecretStore();
    }
    return SecretStore.instance;
  }

  public initialize(context: vscode.ExtensionContext) {
    this.secrets = context.secrets;
  }

  public async getApiKey(): Promise<string | undefined> {
    if (!this.secrets) {
      throw new Error('SecretStore is not initialized.');
    }
    return await this.secrets.get('devmap.groqKey');
  }

  public async setApiKey(key: string): Promise<void> {
    if (!this.secrets) {
      throw new Error('SecretStore is not initialized.');
    }
    await this.secrets.store('devmap.groqKey', key);
  }

  public async clearApiKey(): Promise<void> {
    if (!this.secrets) {
      throw new Error('SecretStore is not initialized.');
    }
    await this.secrets.delete('devmap.groqKey');
  }
}
