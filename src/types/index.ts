/**
 * VRChat Log Relay Server - 基本型定義
 * 
 * このファイルには、プロジェクト全体で使用される基本的な型定義を含めます。
 * 
 * @created 2025-06-30
 * @updated 2025-06-30
 */

// =============================================================================
// VRChat関連の型定義
// =============================================================================

/**
 * VRChatの実行状態を表す列挙型
 */
export enum VRChatStatus {
  /** VRChatが起動していない状態 */
  NOT_RUNNING = 'not_running',
  /** VRChatが起動中だが、ログディレクトリが見つからない状態 */
  STARTING = 'starting',
  /** VRChatが正常に動作し、ログファイルが監視可能な状態 */
  RUNNING = 'running',
  /** VRChatが終了処理中の状態 */
  STOPPING = 'stopping'
}

/**
 * VRChatプロセス情報
 */
export interface VRChatProcessInfo {
  /** プロセスID */
  processId: number;
  /** プロセス名 */
  processName: string;
  /** 実行ファイルパス */
  executablePath?: string;
  /** プロセス開始時刻 */
  startTime: Date;
}

// =============================================================================
// ログメッセージ関連の型定義
// =============================================================================

/**
 * ログレベル（VRChatの標準ログレベル）
 */
export enum LogLevel {
  /** デバッグレベル */
  DEBUG = 'debug',
  /** 情報レベル */
  INFO = 'info',
  /** 警告レベル */
  WARNING = 'warning',
  /** エラーレベル */
  ERROR = 'error',
  /** 致命的エラーレベル */
  FATAL = 'fatal'
}

/**
 * ログメッセージのソース種別
 */
export enum LogSource {
  /** VRChat本体 */
  VRCHAT = 'vrchat',
  /** Udonスクリプト */
  UDON = 'udon',
  /** ネットワーク関連 */
  NETWORK = 'network',
  /** その他・不明 */
  OTHER = 'other'
}

/**
 * 生ログメッセージ（VRChatから直接取得）
 */
export interface RawLogMessage {
  /** タイムスタンプ */
  timestamp: Date;
  /** ログレベル */
  level: LogLevel;
  /** 生ログテキスト */
  content: string;
  /** ファイル名（ログファイルの名前） */
  fileName: string;
  /** ファイル内行番号 */
  lineNumber?: number;
}

/**
 * 解析済みログメッセージ
 */
export interface ProcessedMessage {
  /** 一意識別子 */
  id: string;
  /** 元の生ログメッセージ */
  raw: RawLogMessage;
  /** ログソース */
  source: LogSource;
  /** 解析済みデータ */
  parsed?: ParsedLogData;
  /** フィルタリング用タグ */
  tags: string[];
  /** 処理時刻 */
  processedAt: Date;
}

/**
 * 解析済みログデータ（ログ内容による可変データ）
 */
export interface ParsedLogData {
  /** イベントタイプ */
  type: string;
  /** 解析済みデータ */
  data: Record<string, any>;
  /** 信頼度（0-1） */
  confidence: number;
}

/**
 * ログメタデータ（ファイル情報など）
 */
export interface LogMetadata {
  /** ログソース */
  source: LogSource;
  /** ファイルパス */
  filePath: string;
  /** ファイル名 */
  fileName: string;
  /** タイムスタンプ */
  timestamp: number;
  /** ファイル内行番号 */
  lineNumber?: number;
}

// =============================================================================
// WebSocket通信関連の型定義
// =============================================================================

/**
 * WebSocketメッセージタイプ
 */
export enum MessageType {
  /** ログメッセージの配信 */
  LOG_MESSAGE = 'log_message',
  /** VRChat状態変更通知 */
  VRCHAT_STATUS_CHANGE = 'vrchat_status_change',
  /** クライアント認証要求 */
  CLIENT_AUTH = 'client_auth',
  /** サーバー状態通知 */
  SERVER_STATUS = 'server_status',
  /** フィルター設定 */
  FILTER_CONFIG = 'filter_config',
  /** エラー通知 */
  ERROR = 'error'
}

/**
 * WebSocketメッセージの基本構造
 */
export interface WebSocketMessage {
  /** メッセージタイプ */
  type: MessageType;
  /** メッセージデータ */
  data: any;
  /** タイムスタンプ */
  timestamp: Date;
  /** メッセージID */
  messageId: string;
}

/**
 * ログメッセージ配信用のWebSocketメッセージ
 */
export interface LogMessageWebSocket extends WebSocketMessage {
  type: MessageType.LOG_MESSAGE;
  data: ProcessedMessage;
}

/**
 * VRChat状態変更通知用のWebSocketメッセージ
 */
export interface VRChatStatusWebSocket extends WebSocketMessage {
  type: MessageType.VRCHAT_STATUS_CHANGE;
  data: {
    previousStatus: VRChatStatus;
    currentStatus: VRChatStatus;
    processInfo?: VRChatProcessInfo;
  };
}

// =============================================================================
// クライアント管理関連の型定義
// =============================================================================

/**
 * 接続中のクライアント情報
 */
export interface ClientConnection {
  /** 一意識別子 */
  id: string;
  /** 接続時刻 */
  connectedAt: Date;
  /** 最後の通信時刻 */
  lastActivity: Date;
  /** クライアント情報 */
  userAgent?: string;
  /** IPアドレス */
  remoteAddress: string;
  /** 現在のフィルター設定 */
  filters: MessageFilter[];
  /** 送信メッセージ数 */
  sentMessages: number;
  /** 接続状態 */
  isActive: boolean;
}

/**
 * メッセージフィルター設定
 */
export interface MessageFilter {
  /** フィルター名 */
  name: string;
  /** ログレベルフィルター */
  logLevels?: LogLevel[];
  /** ログソースフィルター */
  sources?: LogSource[];
  /** タグフィルター */
  tags?: string[];
  /** 正規表現パターン */
  patterns?: string[];
  /** 除外フィルター（true = 除外、false = 含める） */
  exclude: boolean;
}

// =============================================================================
// サーバー設定関連の型定義
// =============================================================================

/**
 * サーバー設定
 */
export interface ServerConfig {
  /** サーバー関連設定 */
  server: {
    /** HTTPサーバーポート */
    port: number;
    /** バインドアドレス */
    host: string;
  };
  /** WebSocket関連設定 */
  websocket: {
    /** WebSocketサーバーポート */
    port: number;
    /** バインドアドレス */
    host: string;
    /** 最大接続数 */
    maxConnections: number;
  };
  /** VRChat関連設定 */
  vrchat: {
    /** ログディレクトリパス（null = 自動検出） */
    logDirectory?: string;
    /** プロセス監視間隔（秒） */
    processCheckInterval: number;
    /** ログファイル監視のグループ化期間（秒） */
    groupPeriod: number;
  };
  /** ログ設定 */
  logging: {
    /** ログレベル */
    level: string;
    /** ログファイルパス */
    file?: string;
    /** コンソール出力 */
    console: boolean;
  };
}

// =============================================================================
// エラー関連の型定義
// =============================================================================

/**
 * サーバーエラーの種別
 */
export enum ErrorType {
  /** VRChatプロセス関連エラー */
  VRCHAT_PROCESS_ERROR = 'vrchat_process_error',
  /** ファイル監視エラー */
  FILE_WATCHER_ERROR = 'file_watcher_error',
  /** WebSocket通信エラー */
  WEBSOCKET_ERROR = 'websocket_error',
  /** 設定ファイルエラー */
  CONFIG_ERROR = 'config_error',
  /** ログ解析エラー */
  PARSE_ERROR = 'parse_error',
  /** システムエラー */
  SYSTEM_ERROR = 'system_error'
}

/**
 * サーバーエラー情報
 */
export interface ServerError {
  /** エラータイプ */
  type: ErrorType;
  /** エラーメッセージ */
  message: string;
  /** 詳細情報 */
  details?: Record<string, any>;
  /** 発生時刻 */
  timestamp: Date;
  /** スタックトレース */
  stack?: string;
}

// =============================================================================
// ユーティリティ型
// =============================================================================

/**
 * 非同期関数の戻り値型
 */
export type AsyncResult<T> = Promise<T>;

/**
 * エラーハンドリング付きの非同期関数結果
 */
export type SafeAsyncResult<T> = Promise<{
  success: boolean;
  data?: T;
  error?: ServerError;
}>;

/**
 * イベントハンドラー関数の型
 */
export type EventHandler<T = any> = (data: T) => void | Promise<void>;

/**
 * ログ監視イベントハンドラーの型
 */
export type LogEventHandler = EventHandler<ProcessedMessage>;

/**
 * VRChat状態変更イベントハンドラーの型
 */
export type StatusChangeHandler = EventHandler<{
  previous: VRChatStatus;
  current: VRChatStatus;
  processInfo?: VRChatProcessInfo;
}>;

// =============================================================================
// サーバー状態・メトリクス関連の型定義
// =============================================================================

/**
 * サーバー状態情報
 */
export interface ServerStatus {
  /** サーバー状態 */
  state: string;
  /** 開始時刻 */
  startTime: Date | null;
  /** 稼働時間（ミリ秒） */
  uptime: number;
  /** バージョン情報 */
  version: string;
  /** Node.jsバージョン */
  nodeVersion: string;
  /** プラットフォーム */
  platform: string;
  /** アーキテクチャ */
  architecture: string;
  /** プロセスID */
  processId: number;
  /** メモリ使用量 */
  memoryUsage: NodeJS.MemoryUsage;
  /** 設定情報 */
  config: {
    httpPort: number;
    wsPort: number;
    environment?: string;
  };
}

/**
 * サーバーメトリクス
 */
export interface ServerMetrics {
  /** 開始時刻 */
  startTime: Date;
  /** 最終更新時刻 */
  lastUpdated: Date;
  /** 稼働時間（ミリ秒） */
  uptime: number;
  /** 総接続数 */
  totalConnections: number;
  /** 現在の接続数 */
  connectedClients: number;
  /** 処理済みログメッセージ数 */
  logMessagesProcessed: number;
  /** VRChat状態変更回数 */
  vrchatStatusChanges: number;
  /** エラー発生回数 */
  errors: number;
  /** 最新ログメッセージ時刻 */
  lastLogMessage: Date | null;
  /** 現在のVRChat状態 */
  vrchatStatus: VRChatStatus;
  /** メモリ使用量 */
  memoryUsage: NodeJS.MemoryUsage;
}

// 設定関連の型定義をエクスポート
export * from './config';
