/**
 * VRChat Log Relay Server - 設定管理クラス
 * 
 * 階層化された設定ファイル（YAML）の読み込み、環境変数のオーバーライド、
 * 設定検証機能を提供します。
 * 
 * @created 2025-06-30
 * @updated 2025-06-30
 */

import path from 'path';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import { getLogger } from '../utils/logger';
import { 
  FullServerConfig, 
  ConfigLoadResult, 
  ConfigValidationResult, 
  ConfigManagerOptions,
  EnvVarMapping 
} from '../types';

// =============================================================================
// 設定管理クラス
// =============================================================================

/**
 * 設定管理クラス
 * 
 * YAML設定ファイルの階層読み込み、環境変数オーバーライド、
 * 設定検証を行う
 */
export class ConfigManager {
  private logger = getLogger();
  private config: FullServerConfig | null = null;
  private options: ConfigManagerOptions;

  constructor(options: ConfigManagerOptions) {
    this.options = {
      environment: process.env.NODE_ENV || 'development',
      envPrefix: 'VRC_LOG_RELAY',
      watchFiles: false,
      ...options
    };
  }

  /**
   * 設定を読み込む
   * 
   * 優先順位:
   * 1. 環境変数
   * 2. local.yaml
   * 3. {environment}.yaml
   * 4. default.yaml
   */
  async loadConfig(): Promise<ConfigLoadResult> {
    const result: ConfigLoadResult = {
      success: false,
      loadedFiles: [],
      envOverrides: {}
    };

    try {
      this.logger.info('設定ファイル読み込み開始', { 
        environment: this.options.environment,
        configDir: this.options.configDir 
      });

      // 1. デフォルト設定を読み込み
      const defaultConfig = await this.loadConfigFile('default.yaml');
      if (!defaultConfig) {
        throw new Error('デフォルト設定ファイル (default.yaml) が見つかりません');
      }
      result.loadedFiles.push(path.join(this.options.configDir, 'default.yaml'));

      // 2. 環境別設定をマージ
      let mergedConfig = { ...defaultConfig };
      const envConfigPath = `${this.options.environment}.yaml`;
      const envConfig = await this.loadConfigFile(envConfigPath);
      if (envConfig) {
        mergedConfig = this.deepMerge(mergedConfig, envConfig);
        result.loadedFiles.push(path.join(this.options.configDir, envConfigPath));
        this.logger.info('環境別設定をマージしました', { file: envConfigPath });
      }

      // 3. ローカル設定をマージ
      const localConfig = await this.loadConfigFile('local.yaml');
      if (localConfig) {
        mergedConfig = this.deepMerge(mergedConfig, localConfig);
        result.loadedFiles.push(path.join(this.options.configDir, 'local.yaml'));
        this.logger.info('ローカル設定をマージしました');
      }

      // 4. 環境変数でオーバーライド
      const envOverrides = this.applyEnvironmentVariables(mergedConfig);
      result.envOverrides = envOverrides;

      // 5. 設定検証
      const validation = this.validateConfig(mergedConfig);
      if (!validation.valid) {
        throw new Error(`設定検証エラー: ${validation.errors.join(', ')}`);
      }

      // 6. 警告があれば出力
      if (validation.warnings.length > 0) {
        this.logger.warn('設定に警告があります', { warnings: validation.warnings });
      }

      this.config = mergedConfig;
      result.success = true;
      result.config = mergedConfig;

      this.logger.info('設定読み込み完了', { 
        loadedFiles: result.loadedFiles.length,
        envOverrides: Object.keys(envOverrides).length
      });

      return result;

    } catch (error: any) {
      this.logger.error('設定読み込みエラー', { error: error?.message || error });
      result.error = {
        message: error?.message || String(error),
        details: error
      };
      return result;
    }
  }

  /**
   * 現在の設定を取得
   */
  getConfig(): FullServerConfig {
    if (!this.config) {
      throw new Error('設定が読み込まれていません。loadConfig()を先に実行してください。');
    }
    return this.config;
  }

  /**
   * 設定の一部を更新
   */
  updateConfig(updates: Partial<FullServerConfig>): void {
    if (!this.config) {
      throw new Error('設定が読み込まれていません。');
    }
    
    this.config = this.deepMerge(this.config, updates);
    this.logger.info('設定を更新しました', { updates });
  }

  /**
   * 設定をリロード
   */
  async reloadConfig(): Promise<ConfigLoadResult> {
    this.logger.info('設定をリロードします');
    return await this.loadConfig();
  }

  // =============================================================================
  // プライベートメソッド
  // =============================================================================

  /**
   * 個別の設定ファイルを読み込む
   */
  private async loadConfigFile(filename: string): Promise<any | null> {
    const filePath = path.join(this.options.configDir, filename);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const config = yaml.load(content) as any;
      this.logger.debug('設定ファイル読み込み成功', { file: filename });
      return config;
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        this.logger.debug('設定ファイルが見つかりません', { file: filename });
        return null;
      }
      this.logger.error('設定ファイル読み込みエラー', { file: filename, error: error?.message || error });
      throw error;
    }
  }

  /**
   * オブジェクトの深いマージ
   */
  private deepMerge(target: any, source: any): any {
    if (source === null || source === undefined) {
      return target;
    }

    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (
          source[key] &&
          typeof source[key] === 'object' &&
          !Array.isArray(source[key]) &&
          result[key] &&
          typeof result[key] === 'object' &&
          !Array.isArray(result[key])
        ) {
          result[key] = this.deepMerge(result[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * 環境変数による設定オーバーライド
   */
  private applyEnvironmentVariables(config: any): Record<string, any> {
    const overrides: Record<string, any> = {};
    const envMappings = this.getEnvironmentVariableMappings();

    for (const mapping of envMappings) {
      const envValue = process.env[mapping.envVar];
      if (envValue !== undefined) {
        const transformedValue = mapping.transform ? mapping.transform(envValue) : envValue;
        this.setConfigValue(config, mapping.configPath, transformedValue);
        overrides[mapping.envVar] = transformedValue;
        this.logger.debug('環境変数でオーバーライド', { 
          envVar: mapping.envVar, 
          configPath: mapping.configPath, 
          value: transformedValue 
        });
      }
    }

    return overrides;
  }

  /**
   * 環境変数マッピングの定義
   */
  private getEnvironmentVariableMappings(): EnvVarMapping[] {
    const prefix = this.options.envPrefix!;
    return [
      // サーバー設定
      { envVar: `${prefix}_SERVER_PORT`, configPath: 'server.port', transform: parseInt },
      { envVar: `${prefix}_SERVER_HOST`, configPath: 'server.host' },
      
      // WebSocket設定
      { envVar: `${prefix}_WS_PORT`, configPath: 'websocket.port', transform: parseInt },
      { envVar: `${prefix}_WS_HOST`, configPath: 'websocket.host' },
      { envVar: `${prefix}_WS_MAX_CLIENTS`, configPath: 'websocket.maxClients', transform: parseInt },
      
      // VRChat設定
      { envVar: `${prefix}_VRCHAT_LOG_DIR`, configPath: 'vrchat.logDirectory' },
      { envVar: `${prefix}_VRCHAT_GROUP_PERIOD`, configPath: 'vrchat.monitoring.groupPeriod', transform: parseInt },
      
      // ログ設定
      { envVar: `${prefix}_LOG_LEVEL`, configPath: 'logging.level' },
      { envVar: `${prefix}_LOG_FILE`, configPath: 'logging.file.filename' },
      { envVar: `${prefix}_LOG_CONSOLE`, configPath: 'logging.console.enabled', transform: (v) => v.toLowerCase() === 'true' },
    ];
  }

  /**
   * ドット記法でオブジェクトの値を設定
   */
  private setConfigValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * 設定検証
   */
  private validateConfig(config: any): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 必須項目のチェック
    if (!config.server?.port) {
      errors.push('server.port は必須です');
    }
    if (!config.server?.host) {
      errors.push('server.host は必須です');
    }
    if (!config.websocket?.port) {
      errors.push('websocket.port は必須です');
    }
    if (!config.websocket?.host) {
      errors.push('websocket.host は必須です');
    }

    // 値の範囲チェック
    if (config.server?.port && (config.server.port < 1 || config.server.port > 65535)) {
      errors.push('server.port は 1-65535 の範囲で指定してください');
    }
    if (config.websocket?.port && (config.websocket.port < 1 || config.websocket.port > 65535)) {
      errors.push('websocket.port は 1-65535 の範囲で指定してください');
    }

    // ポート競合チェック
    if (config.server?.port && config.websocket?.port && config.server.port === config.websocket.port) {
      errors.push('server.port と websocket.port は異なる値にしてください');
    }

    // ログレベルチェック
    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (config.logging?.level && !validLogLevels.includes(config.logging.level)) {
      errors.push(`logging.level は ${validLogLevels.join(', ')} のいずれかを指定してください`);
    }

    // 警告項目
    if (config.server?.host !== '127.0.0.1' && config.server?.host !== 'localhost') {
      warnings.push('server.host は localhost 以外が設定されています。セキュリティに注意してください。');
    }
    if (config.websocket?.host !== '127.0.0.1' && config.websocket?.host !== 'localhost') {
      warnings.push('websocket.host は localhost 以外が設定されています。セキュリティに注意してください。');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// =============================================================================
// エクスポート関数
// =============================================================================

/**
 * デフォルト設定管理インスタンスを作成して設定を読み込む
 */
export async function loadConfig(configDir: string = 'config'): Promise<FullServerConfig> {
  const configManager = new ConfigManager({ configDir });
  const result = await configManager.loadConfig();
  
  if (!result.success || !result.config) {
    throw new Error(`設定読み込み失敗: ${result.error?.message}`);
  }
  
  return result.config;
}

/**
 * 設定管理インスタンスを作成
 */
export function createConfigManager(options: Partial<ConfigManagerOptions> = {}): ConfigManager {
  return new ConfigManager({
    configDir: 'config',
    environment: process.env.NODE_ENV || 'development',
    envPrefix: 'VRC_LOG_RELAY',
    watchFiles: false,
    ...options
  });
}
