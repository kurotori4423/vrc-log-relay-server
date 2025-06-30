#!/usr/bin/env node
/**
 * VRChat Log Relay Server - アプリケーションエントリーポイント
 * 
 * 主な責任:
 * - アプリケーションの起動・初期化
 * - 設定ファイルの読み込み
 * - 環境変数・コマンドライン引数の処理  
 * - LogRelayServerの生成・起動
 * - グレースフルシャットダウンの実装
 * - エラーハンドリング
 * 
 * @created 2025-06-30
 */

import path from 'path';
import dotenv from 'dotenv';
import { LogRelayServer } from './server/LogRelayServer';
import { ConfigManager } from './server/config';
import { getLogger } from './utils/logger';
import { FullServerConfig } from './types';

// 環境変数を読み込み
dotenv.config();

const logger = getLogger();

/**
 * コマンドライン引数のパース
 */
interface ParsedArgs {
  environment?: string;
  configDir?: string;
  port?: number;
  host?: string;
  logLevel?: string;
  help?: boolean;
}

/**
 * コマンドライン引数を解析
 */
function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const parsed: ParsedArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--env':
      case '-e':
        if (nextArg && !nextArg.startsWith('-')) {
          parsed.environment = nextArg;
          i++;
        }
        break;
      case '--config':
      case '-c':
        if (nextArg && !nextArg.startsWith('-')) {
          parsed.configDir = nextArg;
          i++;
        }
        break;
      case '--port':
      case '-p':
        if (nextArg && !nextArg.startsWith('-')) {
          parsed.port = parseInt(nextArg, 10);
          i++;
        }
        break;
      case '--host':
      case '-h':
        if (nextArg && !nextArg.startsWith('-')) {
          parsed.host = nextArg;
          i++;
        }
        break;
      case '--log-level':
      case '-l':
        if (nextArg && !nextArg.startsWith('-')) {
          parsed.logLevel = nextArg;
          i++;
        }
        break;
      case '--help':
        parsed.help = true;
        break;
    }
  }

  return parsed;
}

/**
 * ヘルプメッセージを表示
 */
function showHelp(): void {
  console.log(`
VRChat Log Relay Server

使用方法:
  npm start [オプション]
  node dist/index.js [オプション]

オプション:
  -e, --env <environment>    実行環境 (development, production) [default: development]
  -c, --config <directory>   設定ファイルディレクトリ [default: ./config]
  -p, --port <port>          HTTPサーバーポート [default: 設定ファイル値]
  -h, --host <host>          バインドホスト [default: 設定ファイル値]
  -l, --log-level <level>    ログレベル (error, warn, info, debug) [default: info]
      --help                 このヘルプを表示

環境変数:
  NODE_ENV                   実行環境
  VRC_LOG_RELAY_PORT         HTTPサーバーポート
  VRC_LOG_RELAY_HOST         バインドホスト
  VRC_LOG_RELAY_LOG_LEVEL    ログレベル

例:
  npm start                              # 開発環境で起動
  npm start -- --env production          # 本番環境で起動
  npm start -- --port 9000 --host 0.0.0.0  # ポート・ホスト指定
`);
}

/**
 * 設定を読み込み、コマンドライン引数と環境変数でオーバーライド
 */
async function loadConfiguration(args: ParsedArgs): Promise<FullServerConfig> {
  const environment = args.environment || process.env.NODE_ENV || 'development';
  const configDir = args.configDir || path.join(process.cwd(), 'config');

  logger.info('設定読み込み開始', { environment, configDir });

  // ConfigManagerで設定読み込み
  const configManager = new ConfigManager({
    configDir,
    environment,
    envPrefix: 'VRC_LOG_RELAY'
  });

  const result = await configManager.loadConfig();
  if (!result.success) {
    throw new Error('設定ファイルの読み込みに失敗しました');
  }

  const config = configManager.getConfig();
  if (!config) {
    throw new Error('設定が取得できませんでした');
  }

  // コマンドライン引数でオーバーライド
  if (args.port) {
    config.server.port = args.port;
    logger.info('ポートをコマンドライン引数でオーバーライド', { port: args.port });
  }

  if (args.host) {
    config.server.host = args.host;
    logger.info('ホストをコマンドライン引数でオーバーライド', { host: args.host });
  }

  if (args.logLevel) {
    config.logging.level = args.logLevel;
    logger.info('ログレベルをコマンドライン引数でオーバーライド', { logLevel: args.logLevel });
  }

  logger.info('設定読み込み完了', {
    loadedFiles: result.loadedFiles,
    envOverrides: Object.keys(result.envOverrides || {}),
    httpPort: config.server.port,
    wsPort: config.websocket.port
  });

  return config;
}

/**
 * アプリケーション初期化
 */
async function initializeApplication(): Promise<LogRelayServer> {
  logger.info('アプリケーション初期化開始');

  // コマンドライン引数解析
  const args = parseArgs();
  
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // 設定読み込み
  const config = await loadConfiguration(args);

  // LogRelayServer作成
  const server = new LogRelayServer(config);

  logger.info('アプリケーション初期化完了', {
    name: config.server.name,
    version: config.server.version,
    environment: process.env.NODE_ENV || 'development'
  });

  return server;
}

/**
 * グレースフルシャットダウンの設定
 */
function setupGracefulShutdown(server: LogRelayServer): void {
  const shutdown = async (signal: string) => {
    logger.info(`${signal} シグナルを受信しました。シャットダウンを開始します...`);

    try {
      await server.stop();
      logger.info('サーバーが正常に停止しました');
      process.exit(0);
    } catch (error) {
      logger.error('サーバー停止中にエラーが発生しました', { error });
      process.exit(1);
    }
  };

  // シグナルハンドラー設定
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Windows環境のサポート
  if (process.platform === 'win32') {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.on('SIGINT', () => {
      process.emit('SIGINT', 'SIGINT');
    });
  }

  // 未処理例外・Promise拒否の処理
  process.on('uncaughtException', (error) => {
    logger.error('未処理例外が発生しました', { error: error.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('未処理のPromise拒否が発生しました', {
      reason,
      promise: promise.toString()
    });
    process.exit(1);
  });
}

/**
 * メイン実行関数
 */
async function main(): Promise<void> {
  try {
    logger.info('=== VRChat Log Relay Server 起動中 ===', {
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid
    });

    // アプリケーション初期化
    const server = await initializeApplication();

    // グレースフルシャットダウン設定
    setupGracefulShutdown(server);

    // サーバー起動
    await server.start();

    logger.info('=== VRChat Log Relay Server 起動完了 ===');

  } catch (error) {
    logger.error('アプリケーション起動に失敗しました', { error });
    process.exit(1);
  }
}

// メイン実行（モジュールが直接実行された場合）
if (require.main === module) {
  main().catch((error) => {
    console.error('Critical error during startup:', error);
    process.exit(1);
  });
}

// テスト用にexport
export { main, initializeApplication, parseArgs, loadConfiguration };
