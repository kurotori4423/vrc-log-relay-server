/**
 * VRChat Log Relay Server - 設定関連型定義
 * 
 * 設定ファイルの構造と設定管理に関する型定義
 * 
 * @created 2025-06-30
 * @updated 2025-06-30
 */

// =============================================================================
// 詳細な設定型定義（YAMLファイル構造に対応）
// =============================================================================

/**
 * 完全なサーバー設定（YAML構造対応）
 */
export interface FullServerConfig {
  /** サーバー基本設定 */
  server: {
    port: number;
    host: string;
    name: string;
    version: string;
  };

  /** VRChat関連設定 */
  vrchat: {
    logDirectory?: string;
    monitoring: {
      groupPeriod: number;
      maxFiles: number;
      filePattern: string;
      encoding: string;
    };
    processMonitoring: {
      enabled: boolean;
      interval: number;
      processName: string;
      retryLimit: number;
      detectionTimeout: number;
      quietMode: {
        enabled: boolean;
        suppressDebugLogs: boolean;
      };
    };
    directoryMonitoring: {
      enabled: boolean;
      depth: number;
      usePolling: boolean;
      pollInterval: number;
    };
  };

  /** WebSocket設定 */
  websocket: {
    port: number;
    host: string;
    maxClients: number;
    pingInterval: number;
    pongTimeout: number;
    compression: boolean;
    perMessageDeflate: boolean;
    maxPayload: number;
    distributionBatch: {
      enabled: boolean;
      batchSize: number;
      batchTimeout: number;
    };
    statusBroadcast: {
      enabled: boolean;
      debounceInterval: number;
    };
  };

  /** ログ設定 */
  logging: {
    level: string;
    format: string;
    timestamp: boolean;
    console: {
      enabled: boolean;
      colorize: boolean;
      format: string;
    };
    file: {
      enabled: boolean;
      filename: string;
      maxSize: string;
      maxFiles: number;
      datePattern: string;
      zippedArchive: boolean;
    };
    errorFile: {
      enabled: boolean;
      filename: string;
      level: string;
    };
    categories: {
      server: string;
      vrchat: string;
      websocket: string;
      messages: string;
    };
  };

  /** 機能有効/無効設定 */
  features: {
    webUI: boolean;
    healthCheck: boolean;
    metrics: boolean;
    authentication: boolean;
    rateLimit: boolean;
    vrchatMonitoring: {
      processDetection: boolean;
      directoryWatching: boolean;
      fileWatching: boolean;
      statusNotification: boolean;
    };
  };

  /** パフォーマンス設定 */
  performance: {
    memory: {
      maxHeapSize: string;
      gcThreshold: number;
    };
    processing: {
      maxConcurrentTasks: number;
      taskTimeout: number;
      messageQueueSize: number;
    };
    fileWatching: {
      stabilityThreshold: number;
      pollInterval: number;
      useNativeEvents: boolean;
    };
  };

  /** ヘルスチェック設定 */
  healthCheck: {
    enabled: boolean;
    endpoint: string;
    interval: number;
    timeout: number;
    checks: {
      memoryUsage: boolean;
      vrchatProcess: boolean;
      logDirectory: boolean;
      websocketServer: boolean;
    };
    thresholds: {
      memoryUsagePercent: number;
      responseTimeMs: number;
    };
  };

  /** Web UI設定 */
  webUI: {
    enabled: boolean;
    path: string;
    staticFiles: string;
    development: {
      hotReload: boolean;
      devServer: boolean;
    };
  };
}

/**
 * 設定ファイル読み込み結果
 */
export interface ConfigLoadResult {
  /** 読み込み成功フラグ */
  success: boolean;
  /** 設定データ */
  config?: FullServerConfig;
  /** エラー情報 */
  error?: {
    message: string;
    filePath?: string;
    details?: any;
  };
  /** 読み込んだファイルパス一覧 */
  loadedFiles: string[];
  /** 環境変数オーバーライド情報 */
  envOverrides: Record<string, any>;
}

/**
 * 設定検証結果
 */
export interface ConfigValidationResult {
  /** 検証成功フラグ */
  valid: boolean;
  /** エラー一覧 */
  errors: string[];
  /** 警告一覧 */
  warnings: string[];
}

/**
 * 設定管理オプション
 */
export interface ConfigManagerOptions {
  /** 設定ファイルディレクトリ */
  configDir: string;
  /** 環境名（development, production等） */
  environment?: string;
  /** 環境変数のプレフィックス */
  envPrefix?: string;
  /** 設定ファイル監視フラグ */
  watchFiles?: boolean;
  /** 設定変更時のコールバック */
  onConfigChange?: (config: FullServerConfig) => void;
}

/**
 * 環境変数マッピング定義
 */
export interface EnvVarMapping {
  /** 環境変数名 */
  envVar: string;
  /** 設定オブジェクトのパス（ドット記法） */
  configPath: string;
  /** 型変換関数 */
  transform?: (value: string) => any;
  /** デフォルト値 */
  defaultValue?: any;
}

/**
 * 簡易サーバー設定（後方互換性のため）
 */
export type ServerConfig = FullServerConfig;
