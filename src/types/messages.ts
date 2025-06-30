/**
 * VRChat Log Relay Server - メッセージ型定義
 * 
 * WebSocketメッセージとログデータの型定義
 * 
 * @created 2025-06-30
 */

// =============================================================================
// WebSocketメッセージ型定義
// =============================================================================

/**
 * 基本メッセージ形式
 */
export interface BaseMessage {
  type: string;                    // メッセージタイプ
  data?: Record<string, any>;      // ペイロードデータ（オプショナル）
  timestamp?: number;              // タイムスタンプ（省略可）
  id?: string;                     // メッセージID（省略可）
}

/**
 * Hello メッセージ（クライアント → サーバー）
 */
export interface HelloMessage extends BaseMessage {
  type: 'hello';
  data: {
    clientName: string;
    version: string;
    capabilities?: string[];
    description?: string;
  };
}

/**
 * Welcome メッセージ（サーバー → クライアント）
 */
export interface WelcomeMessage extends BaseMessage {
  type: 'welcome';
  data: {
    clientId: string;
    serverVersion: string;
    connectedAt: number;
    capabilities: string[];
  };
}

/**
 * エラーメッセージ
 */
export interface ErrorMessage extends BaseMessage {
  type: 'error';
  data: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

/**
 * ステータス要求メッセージ
 */
export interface GetStatusMessage extends BaseMessage {
  type: 'get_status';
  data?: Record<string, any>;
}

/**
 * ステータス応答メッセージ
 */
export interface StatusMessage extends BaseMessage {
  type: 'status';
  data: {
    uptime: number;
    connectedClients: number;
    monitoredFiles: number;
    messagesProcessed: number;
    messagesDistributed: number;
    lastLogTime: number | null;
    memoryUsage: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
      external?: number;
      arrayBuffers?: number;
    };
    vrchatStatus: {
      isRunning: boolean;
      processId: number | null;
      logDirectoryExists: boolean;
      activeLogFiles: number;
      lastLogActivity: number | null;
      detectedAt: number | null;
    };
  };
}

/**
 * メトリクス要求メッセージ
 */
export interface GetMetricsMessage extends BaseMessage {
  type: 'get_metrics';
  data?: {
    timeRange?: number;
    includeHistory?: boolean;
  };
}

/**
 * メトリクス応答メッセージ
 */
export interface MetricsMessage extends BaseMessage {
  type: 'metrics';
  data: {
    current: {
      messagesPerSecond: number;
      clientConnections: number;
      memoryUsageMB: number;
      cpuUsage: number;
    };
    history?: Array<{
      timestamp: number;
      messagesPerSecond: number;
      memoryUsageMB: number;
      cpuUsage?: number;
    }>;
  };
}

/**
 * VRChat状態変更通知メッセージ
 */
export interface VRChatStatusChangeMessage extends BaseMessage {
  type: 'vrchat_status_change';
  data: {
    changeType: 'vrchat_process' | 'log_directory' | 'log_monitoring';
    timestamp: number;
    data: Record<string, any>;
    currentStatus: {
      isRunning: boolean;
      processId?: number | null;
      logDirectoryExists?: boolean;
      activeLogFiles?: number;
      detectedAt?: number | null;
    };
  };
}

/**
 * ログメッセージ（ログ配信）
 */
export interface LogMessage extends BaseMessage {
  type: 'log_message';
  data: {
    source: string;
    timestamp: number;
    level: string;
    message: string;
    parsed?: Record<string, any>;
    raw: string;
  };
}

/**
 * フィルター設定メッセージ
 */
export interface SetFilterMessage extends BaseMessage {
  type: 'set_filter';
  data: {
    logLevel?: string[];
    sources?: string[];
    messageTypes?: string[];
    keywords?: string[];
    exclude?: {
      logLevel?: string[];
      sources?: string[];
      messageTypes?: string[];
      keywords?: string[];
    };
  };
}

/**
 * フィルター設定確認メッセージ
 */
export interface FilterSetMessage extends BaseMessage {
  type: 'filter_set';
  data: {
    success: boolean;
    filter: Record<string, any>;
    error?: string;
  };
}

/**
 * Ping メッセージ
 */
export interface PingMessage extends BaseMessage {
  type: 'ping';
  data?: {
    timestamp?: number;
  };
}

/**
 * Pong メッセージ
 */
export interface PongMessage extends BaseMessage {
  type: 'pong';
  data: {
    timestamp: number;
  };
}

// =============================================================================
// WebSocketメッセージのユニオン型
// =============================================================================

/**
 * すべてのWebSocketメッセージの型
 */
export type WebSocketMessage = 
  | HelloMessage
  | WelcomeMessage
  | ErrorMessage
  | GetStatusMessage
  | StatusMessage
  | GetMetricsMessage
  | MetricsMessage
  | VRChatStatusChangeMessage
  | LogMessage
  | SetFilterMessage
  | FilterSetMessage
  | PingMessage
  | PongMessage;

// =============================================================================
// ログデータ型定義
// =============================================================================

/**
 * ログエントリの基本形式
 */
export interface LogEntry {
  timestamp: number;
  level: string;
  source: string;
  message: string;
  raw: string;
}

/**
 * 解析済みログメッセージ
 */
export interface ProcessedLogMessage extends LogEntry {
  parsed?: {
    type: string;
    data: Record<string, any>;
  };
}

/**
 * VRChatログの特殊パース結果
 */
export interface VRChatLogParsed {
  type: 'user_join' | 'user_leave' | 'world_change' | 'udon_event' | 'system_message' | 'unknown';
  data: Record<string, any>;
  confidence: number; // パース信頼度 (0-1)
}

/**
 * Udonログの特殊パース結果
 */
export interface UdonLogParsed {
  type: 'debug' | 'info' | 'warning' | 'error' | 'custom';
  objectName?: string;
  scriptName?: string;
  methodName?: string;
  data: Record<string, any>;
  stackTrace?: string[];
}
