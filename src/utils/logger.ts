/**
 * VRChat Log Relay Server - ロガーユーティリティ
 * 
 * Winston を使用したログ管理機能を提供します。
 * 開発環境とプロダクション環境で異なるログ設定を適用します。
 * 
 * @created 2025-06-30
 * @updated 2025-06-30
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

// =============================================================================
// ログ設定の型定義
// =============================================================================

/**
 * ログ設定インターface
 */
export interface LoggerConfig {
  /** ログレベル */
  level: string;
  /** ログファイルパス（undefined = ファイル出力なし） */
  file?: string;
  /** コンソール出力フラグ */
  console: boolean;
  /** 最大ログファイルサイズ（バイト） */
  maxFileSize?: number;
  /** 保存するログファイル数 */
  maxFiles?: number;
}

// =============================================================================
// デフォルト設定
// =============================================================================

/**
 * デフォルトのログ設定
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  console: true,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
};

// =============================================================================
// カスタムログフォーマット
// =============================================================================

/**
 * コンソール用のカラーフォーマット
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

/**
 * ファイル用のJSONフォーマット
 */
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// =============================================================================
// ログディレクトリの作成
// =============================================================================

/**
 * ログディレクトリを作成する
 * @param filePath ログファイルのパス
 */
function ensureLogDirectory(filePath: string): void {
  try {
    const logDir = path.dirname(filePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (error) {
    console.error('ログディレクトリの作成に失敗しました:', error);
  }
}

// =============================================================================
// ロガーインスタンス作成
// =============================================================================

/**
 * ロガーインスタンス（シングルトン）
 */
let loggerInstance: winston.Logger | null = null;

/**
 * ロガーを初期化する
 * @param config ログ設定
 * @returns 初期化されたロガーインスタンス
 */
export function initializeLogger(config: Partial<LoggerConfig> = {}): winston.Logger {
  // 設定をマージ
  const mergedConfig: LoggerConfig = {
    ...DEFAULT_CONFIG,
    ...config
  };

  // トランスポート設定
  const transports: winston.transport[] = [];

  // コンソール出力設定
  if (mergedConfig.console) {
    transports.push(
      new winston.transports.Console({
        level: mergedConfig.level,
        format: consoleFormat
      })
    );
  }

  // ファイル出力設定
  if (mergedConfig.file) {
    try {
      ensureLogDirectory(mergedConfig.file);
      
      // 通常ログファイル
      transports.push(
        new winston.transports.File({
          filename: mergedConfig.file,
          level: mergedConfig.level,
          format: fileFormat,
          maxsize: mergedConfig.maxFileSize,
          maxFiles: mergedConfig.maxFiles,
          tailable: true
        })
      );

      // エラー専用ログファイル
      const errorLogFile = mergedConfig.file.replace(/\.log$/, '.error.log');
      transports.push(
        new winston.transports.File({
          filename: errorLogFile,
          level: 'error',
          format: fileFormat,
          maxsize: mergedConfig.maxFileSize,
          maxFiles: mergedConfig.maxFiles,
          tailable: true
        })
      );
    } catch (error) {
      console.error('ログファイル設定に失敗しました:', error);
    }
  }

  // ロガーインスタンス作成
  loggerInstance = winston.createLogger({
    level: mergedConfig.level,
    transports,
    // プロセス終了時のログ処理
    exitOnError: false,
    // 例外ハンドリング
    exceptionHandlers: mergedConfig.file ? [
      new winston.transports.File({
        filename: mergedConfig.file.replace(/\.log$/, '.exceptions.log'),
        format: fileFormat
      })
    ] : undefined,
    // 未処理のPromise拒否ハンドリング
    rejectionHandlers: mergedConfig.file ? [
      new winston.transports.File({
        filename: mergedConfig.file.replace(/\.log$/, '.rejections.log'),
        format: fileFormat
      })
    ] : undefined
  });

  return loggerInstance;
}

/**
 * 現在のロガーインスタンスを取得する
 * @returns ロガーインスタンス
 */
export function getLogger(): winston.Logger {
  if (!loggerInstance) {
    // デフォルト設定でロガーを初期化
    loggerInstance = initializeLogger();
  }
  return loggerInstance;
}

// =============================================================================
// 便利なログ関数
// =============================================================================

/**
 * デバッグメッセージをログ出力
 * @param message メッセージ
 * @param meta 追加メタデータ
 */
export function debug(message: string, meta: Record<string, any> = {}): void {
  getLogger().debug(message, meta);
}

/**
 * 情報メッセージをログ出力
 * @param message メッセージ
 * @param meta 追加メタデータ
 */
export function info(message: string, meta: Record<string, any> = {}): void {
  getLogger().info(message, meta);
}

/**
 * 警告メッセージをログ出力
 * @param message メッセージ
 * @param meta 追加メタデータ
 */
export function warn(message: string, meta: Record<string, any> = {}): void {
  getLogger().warn(message, meta);
}

/**
 * エラーメッセージをログ出力
 * @param message メッセージ
 * @param error エラーオブジェクト（オプション）
 * @param meta 追加メタデータ
 */
export function error(message: string, error?: Error, meta: Record<string, any> = {}): void {
  const errorMeta = {
    ...meta,
    ...(error && {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    })
  };
  getLogger().error(message, errorMeta);
}

/**
 * 致命的エラーメッセージをログ出力
 * @param message メッセージ
 * @param error エラーオブジェクト（オプション）
 * @param meta 追加メタデータ
 */
export function fatal(message: string, error?: Error, meta: Record<string, any> = {}): void {
  const errorMeta = {
    ...meta,
    ...(error && {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    })
  };
  getLogger().error(message, { ...errorMeta, level: 'fatal' });
}

// =============================================================================
// VRChat Log Relay Server 専用ログ関数
// =============================================================================

/**
 * VRChatプロセス関連のログ
 * @param message メッセージ
 * @param processInfo プロセス情報
 */
export function logVRChatProcess(message: string, processInfo: Record<string, any> = {}): void {
  info(message, { component: 'VRChatProcess', ...processInfo });
}

/**
 * ファイル監視関連のログ
 * @param message メッセージ
 * @param fileInfo ファイル情報
 */
export function logFileWatcher(message: string, fileInfo: Record<string, any> = {}): void {
  debug(message, { component: 'FileWatcher', ...fileInfo });
}

/**
 * WebSocket関連のログ
 * @param message メッセージ
 * @param connectionInfo 接続情報
 */
export function logWebSocket(message: string, connectionInfo: Record<string, any> = {}): void {
  debug(message, { component: 'WebSocket', ...connectionInfo });
}

/**
 * メッセージ処理関連のログ
 * @param message メッセージ
 * @param messageInfo メッセージ情報
 */
export function logMessageProcessor(message: string, messageInfo: Record<string, any> = {}): void {
  debug(message, { component: 'MessageProcessor', ...messageInfo });
}

/**
 * サーバー関連のログ
 * @param message メッセージ
 * @param serverInfo サーバー情報
 */
export function logServer(message: string, serverInfo: Record<string, any> = {}): void {
  info(message, { component: 'Server', ...serverInfo });
}

// =============================================================================
// パフォーマンス測定用ログ関数
// =============================================================================

/**
 * パフォーマンス測定開始
 * @param label 測定ラベル
 * @returns 測定終了関数
 */
export function startPerformanceLog(label: string): () => void {
  const start = Date.now();
  debug(`Performance: ${label} - 開始`);
  
  return () => {
    const duration = Date.now() - start;
    debug(`Performance: ${label} - 完了`, { duration: `${duration}ms` });
  };
}

/**
 * メモリ使用量をログ出力
 * @param label ラベル
 */
export function logMemoryUsage(label: string = 'Memory Usage'): void {
  const usage = process.memoryUsage();
  const formatBytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
  
  debug(label, {
    rss: formatBytes(usage.rss),
    heapTotal: formatBytes(usage.heapTotal),
    heapUsed: formatBytes(usage.heapUsed),
    external: formatBytes(usage.external)
  });
}

// =============================================================================
// ログレベル動的変更
// =============================================================================

/**
 * ログレベルを動的に変更する
 * @param level 新しいログレベル
 */
export function setLogLevel(level: string): void {
  const logger = getLogger();
  logger.level = level;
  info(`ログレベルを変更しました: ${level}`);
}

/**
 * 現在のログレベルを取得する
 * @returns 現在のログレベル
 */
export function getLogLevel(): string {
  return getLogger().level;
}

// =============================================================================
// ログローテーション・クリーンアップ
// =============================================================================

/**
 * 古いログファイルをクリーンアップする
 * @param logDirectory ログディレクトリ
 * @param daysToKeep 保持日数
 */
export async function cleanupOldLogs(logDirectory: string, daysToKeep: number = 7): Promise<void> {
  try {
    if (!fs.existsSync(logDirectory)) {
      return;
    }

    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    const files = fs.readdirSync(logDirectory);

    for (const file of files) {
      if (file.endsWith('.log')) {
        const filePath = path.join(logDirectory, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          info(`古いログファイルを削除しました: ${file}`);
        }
      }
    }
  } catch (err) {
    error('ログファイルクリーンアップに失敗しました', err as Error);
  }
}

// =============================================================================
// デフォルトエクスポート
// =============================================================================

/**
 * デフォルトロガーインスタンス
 */
export default getLogger;

/**
 * 名前付きエクスポート（便利なアクセス用）
 */
export const logger = getLogger();
