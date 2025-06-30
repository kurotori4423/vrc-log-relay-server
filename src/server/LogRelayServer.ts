/**
 * LogRelayServer - VRChat Log Relay Server メインコントローラー
 * 
 * 責任:
 * - システム全体の統合・制御
 * - コンポーネント間の連携調整  
 * - ライフサイクル管理（起動・停止）
 * - エラーハンドリングとロギング
 * - HTTPサーバーとWebSocketサーバーの統合管理
 * 
 * @created 2025-06-30
 */

import * as path from 'path';
import express, { Express } from 'express';
import { Server as HTTPServer } from 'http';
import { EventEmitter } from 'events';
import { VRChatLogWatcher } from '../log/VRChatLogWatcher';
import { MessageProcessor } from '../log/MessageProcessor';
import { WebSocketServer } from '../websocket/WebSocketServer';
import { ConfigManager } from './config';
import { 
  FullServerConfig, 
  VRChatStatus, 
  LogMetadata,
  ProcessedMessage,
  ServerMetrics,
  ServerStatus 
} from '../types';
import { getLogger } from '../utils/logger';

const logger = getLogger();

/**
 * サーバー状態
 */
export enum ServerState {
  STOPPED = 'stopped',
  STARTING = 'starting', 
  RUNNING = 'running',
  STOPPING = 'stopping',
  ERROR = 'error'
}

/**
 * メインサーバークラス
 * 全てのコンポーネントを統合し、システム全体を制御する
 */
export class LogRelayServer extends EventEmitter {
  // コア設定
  private config: FullServerConfig;
  private configManager: ConfigManager;
  
  // サーバーコンポーネント
  private httpServer: HTTPServer | null = null;
  private expressApp: Express;
  private wsServer: WebSocketServer;
  
  // ログ監視コンポーネント
  private logWatcher: VRChatLogWatcher;
  private messageProcessor: MessageProcessor;
  
  // 状態管理
  private state: ServerState = ServerState.STOPPED;
  private startTime: Date | null = null;
  private metrics: ServerMetrics = this.createInitialMetrics();
  
  // エラーハンドリング
  private shutdownCallbacks: Array<() => Promise<void>> = [];

  /**
   * コンストラクター
   */
  constructor(config: FullServerConfig) {
    super();
    
    this.config = config;
    this.configManager = new ConfigManager({
      configDir: path.dirname('./config'),
      environment: process.env.NODE_ENV || 'development'
    });
    
    // Express アプリケーション初期化
    this.expressApp = express();
    this.setupExpressMiddleware();
    this.setupExpressRoutes();
    
    // WebSocketサーバー初期化
    this.wsServer = new WebSocketServer(config);
    
    // ログ監視・処理コンポーネント初期化
    this.logWatcher = new VRChatLogWatcher({
      logDirectory: config.vrchat.logDirectory,
      groupPeriod: config.vrchat.monitoring.groupPeriod
    });
    this.messageProcessor = new MessageProcessor();
    
    // イベントリスナー設定
    this.setupEventListeners();
    
    // グレースフルシャットダウン設定
    this.setupGracefulShutdown();
    
    logger.info('LogRelayServer initialized', {
      httpPort: config.server.port,
      wsPort: config.websocket.port,
      environment: process.env.NODE_ENV || 'development'
    });
  }

  /**
   * サーバー開始
   */
  public async start(): Promise<void> {
    if (this.state !== ServerState.STOPPED) {
      throw new Error(`Cannot start server in state: ${this.state}`);
    }

    try {
      this.setState(ServerState.STARTING);
      logger.info('Starting VRChat Log Relay Server...');

      // 1. HTTP サーバー起動
      await this.startHttpServer();
      
      // 2. WebSocket サーバー起動  
      await this.startWebSocketServer();
      
      // 3. ログ監視開始
      await this.startLogWatcher();
      
      // 4. イベント配線の有効化
      this.wireEventHandlers();
      
      // 5. メトリクス初期化
      this.startTime = new Date();
      this.metrics = this.createInitialMetrics();
      
      this.setState(ServerState.RUNNING);
      logger.info('VRChat Log Relay Server started successfully', {
        httpPort: this.config.server.port,
        wsPort: this.config.websocket.port,
        processId: process.pid
      });

      this.emit('server_started');
      
    } catch (error) {
      this.setState(ServerState.ERROR);
      logger.error('Failed to start server:', error);
      
      // クリーンアップ
      await this.cleanup();
      throw error;
    }
  }

  /**
   * サーバー停止
   */
  public async stop(): Promise<void> {
    if (this.state === ServerState.STOPPED || this.state === ServerState.STOPPING) {
      return;
    }

    try {
      this.setState(ServerState.STOPPING);
      logger.info('Stopping VRChat Log Relay Server...');

      // 全ての停止処理を実行
      await this.cleanup();
      
      this.setState(ServerState.STOPPED);
      logger.info('VRChat Log Relay Server stopped successfully');
      
      this.emit('server_stopped');
      
    } catch (error) {
      this.setState(ServerState.ERROR);
      logger.error('Error during server shutdown:', error);
      throw error;
    }
  }

  /**
   * サーバー状態取得
   */
  public getStatus(): ServerStatus {
    return {
      state: this.state,
      startTime: this.startTime,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      version: process.env.npm_package_version || '1.0.0',
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      processId: process.pid,
      memoryUsage: process.memoryUsage(),
      config: {
        httpPort: this.config.server.port,
        wsPort: this.config.websocket.port,
        environment: process.env.NODE_ENV || 'development'
      }
    };
  }

  /**
   * メトリクス取得
   */
  public getMetrics(): ServerMetrics {
    return {
      ...this.metrics,
      lastUpdated: new Date(),
      connectedClients: this.wsServer.getClientCount(),
      vrchatStatus: this.logWatcher.getVRChatStatus(),
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * 設定更新
   */
  public async updateConfig(newConfig: Partial<FullServerConfig>): Promise<void> {
    logger.info('Updating server configuration');
    
    const updatedConfig = { ...this.config, ...newConfig };
    
    // 簡易的な設定検証
    if (!updatedConfig.server?.port || !updatedConfig.websocket?.port) {
      throw new Error('Invalid configuration: Required ports not specified');
    }
    
    this.config = updatedConfig;
    this.emit('config_updated', updatedConfig);
    
    logger.info('Configuration updated successfully');
  }

  /**
   * 設定再読み込み
   */
  public async reloadConfig(): Promise<void> {
    logger.info('Reloading configuration from files');
    
    const result = await this.configManager.loadConfig();
    if (!result.success || !result.config) {
      const errorMessage = result.error?.message || 'Unknown error';
      throw new Error(`Failed to reload config: ${errorMessage}`);
    }
    
    await this.updateConfig(result.config);
  }

  // =============================================================================
  // プライベートメソッド - サーバー起動
  // =============================================================================

  /**
   * HTTPサーバー起動
   */
  private async startHttpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer = this.expressApp.listen(
          this.config.server.port,
          this.config.server.host,
          () => {
            logger.info(`HTTP server listening on ${this.config.server.host}:${this.config.server.port}`);
            resolve();
          }
        );

        this.httpServer.on('error', (error: any) => {
          logger.error('HTTP server error:', error);
          this.setState(ServerState.ERROR);
          reject(error);
        });

        // シャットダウンコールバック登録
        this.shutdownCallbacks.push(async () => {
          if (this.httpServer) {
            await new Promise<void>((resolve) => {
              this.httpServer!.close(() => {
                logger.info('HTTP server closed');
                resolve();
              });
            });
          }
        });
        
      } catch (error) {
        this.setState(ServerState.ERROR);
        reject(error);
      }
    });
  }

  /**
   * WebSocketサーバー起動
   */
  private async startWebSocketServer(): Promise<void> {
    try {
      // HTTPサーバーにアタッチして起動（独立ポートの代わりに）
      await this.wsServer.start(this.httpServer || undefined);
      logger.info('WebSocket server started');

      // シャットダウンコールバック登録
      this.shutdownCallbacks.push(async () => {
        await this.wsServer.stop();
      });
      
    } catch (error) {
      logger.error('Failed to start WebSocket server:', error);
      this.setState(ServerState.ERROR);
      throw error;
    }
  }

  /**
   * ログ監視開始
   */
  private async startLogWatcher(): Promise<void> {
    try {
      await this.logWatcher.startWatching();
      logger.info('VRChat log watcher started');

      // シャットダウンコールバック登録
      this.shutdownCallbacks.push(async () => {
        await this.logWatcher.stopWatching();
      });
      
    } catch (error) {
      logger.error('Failed to start log watcher:', error);
      throw error;
    }
  }

  // =============================================================================
  // プライベートメソッド - イベントハンドリング
  // =============================================================================

  /**
   * イベントリスナー設定
   */
  private setupEventListeners(): void {
    // WebSocketサーバーイベント
    this.wsServer.on('client_connected', (clientId: string) => {
      this.onClientConnected(clientId);
    });

    this.wsServer.on('client_disconnected', (clientId: string) => {
      this.onClientDisconnected(clientId);
    });

    this.wsServer.on('client_message', (clientId: string, message: any) => {
      this.onClientMessage(clientId, message);
    });

    // ログ監視イベント
    this.logWatcher.on('log_line', (line: string, metadata: LogMetadata) => {
      this.onLogMessage(line, metadata);
    });

    this.logWatcher.on('vrchat_status_change', (status: VRChatStatus) => {
      this.onVRChatStatusChange(status);
    });

    this.logWatcher.on('error', (error: Error) => {
      this.onLogWatcherError(error);
    });

    logger.debug('Event listeners configured');
  }

  /**
   * イベント配線
   */
  private wireEventHandlers(): void {
    logger.debug('Event handlers wired successfully');
  }

  /**
   * ログメッセージ処理
   */
  private onLogMessage(line: string, metadata: LogMetadata): void {
    try {
      // メッセージ処理
      const processed = this.messageProcessor.processLogLine(line, metadata);
      
      if (processed) {
        // メトリクス更新
        this.metrics.logMessagesProcessed++;
        this.metrics.lastLogMessage = new Date();

        // WebSocketで配信（BaseMessage形式に変換）
        const logMessage = {
          type: 'log_message',
          data: processed,
          timestamp: Date.now()
        };
        this.wsServer.broadcast(logMessage);
        
        this.emit('log_message_processed', processed);
      }
      
    } catch (error) {
      logger.error('Error processing log message:', error);
      this.metrics.errors++;
    }
  }

  /**
   * VRChat状態変更処理
   */
  private onVRChatStatusChange(status: VRChatStatus): void {
    try {
      logger.info('VRChat status changed:', status);
      
      // メトリクス更新
      this.metrics.vrchatStatusChanges++;
      
      // ステータス変更をWebSocketで配信（BaseMessage形式）
      const statusMessage = {
        type: 'vrchat_status_change',
        data: {
          currentStatus: status,
          timestamp: new Date().toISOString()
        },
        timestamp: Date.now()
      };
      
      this.wsServer.broadcast(statusMessage);
      this.emit('vrchat_status_change', status);
      
    } catch (error) {
      logger.error('Error handling VRChat status change:', error);
      this.metrics.errors++;
    }
  }

  /**
   * クライアント接続処理
   */
  private onClientConnected(clientId: string): void {
    logger.info(`WebSocket client connected: ${clientId}`);
    this.metrics.totalConnections++;
    this.emit('client_connected', clientId);
  }

  /**
   * クライアント切断処理
   */
  private onClientDisconnected(clientId: string): void {
    logger.info(`WebSocket client disconnected: ${clientId}`);
    this.emit('client_disconnected', clientId);
  }

  /**
   * クライアントメッセージ処理
   */
  private onClientMessage(clientId: string, message: any): void {
    try {
      logger.debug(`Message from client ${clientId}:`, message);
      
      // メッセージタイプに応じた処理
      switch (message.type) {
        case 'get_status':
          this.wsServer.sendToClient(clientId, {
            type: 'status_response',
            data: this.getStatus()
          });
          break;
          
        case 'get_metrics':
          this.wsServer.sendToClient(clientId, {
            type: 'metrics_response', 
            data: this.getMetrics()
          });
          break;
          
        default:
          logger.warn(`Unknown message type from client ${clientId}: ${message.type}`);
      }
      
    } catch (error) {
      logger.error(`Error handling message from client ${clientId}:`, error);
    }
  }

  /**
   * ログ監視エラー処理
   */
  private onLogWatcherError(error: Error): void {
    logger.error('Log watcher error:', error);
    this.metrics.errors++;
    this.emit('log_watcher_error', error);
  }

  // =============================================================================
  // プライベートメソッド - Express設定
  // =============================================================================

  /**
   * Express ミドルウェア設定
   */
  private setupExpressMiddleware(): void {
    // JSON パース
    this.expressApp.use(express.json());
    
    // ヘルスチェック用ヘッダー
    this.expressApp.use((req, res, next) => {
      res.header('X-Server-Name', 'VRChat-Log-Relay-Server');
      res.header('X-Server-Version', process.env.npm_package_version || '1.0.0');
      next();
    });

    // リクエストログ
    this.expressApp.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`, {
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
      next();
    });
  }

  /**
   * Express ルート設定
   */
  private setupExpressRoutes(): void {
    // ヘルスチェック
    this.expressApp.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        server: this.getStatus()
      });
    });

    // ステータス取得
    this.expressApp.get('/api/status', (req, res) => {
      res.json(this.getStatus());
    });

    // メトリクス取得
    this.expressApp.get('/api/metrics', (req, res) => {
      res.json(this.getMetrics());
    });

    // 404ハンドラー
    this.expressApp.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Path ${req.path} not found`,
        timestamp: new Date().toISOString()
      });
    });

    // エラーハンドラー
    this.expressApp.use((error: Error, req: any, res: any, next: any) => {
      logger.error('Express error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An error occurred processing your request',
        timestamp: new Date().toISOString()
      });
    });
  }

  // =============================================================================
  // プライベートメソッド - ユーティリティ
  // =============================================================================

  /**
   * 状態設定
   */
  private setState(newState: ServerState): void {
    const oldState = this.state;
    this.state = newState;
    
    logger.debug(`Server state changed: ${oldState} -> ${newState}`);
    this.emit('state_change', { from: oldState, to: newState });
  }

  /**
   * 初期メトリクス作成
   */
  private createInitialMetrics(): ServerMetrics {
    return {
      startTime: new Date(),
      lastUpdated: new Date(),
      uptime: 0,
      totalConnections: 0,
      connectedClients: 0,
      logMessagesProcessed: 0,
      vrchatStatusChanges: 0,
      errors: 0,
      lastLogMessage: null,
      vrchatStatus: 'unknown' as VRChatStatus,
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * グレースフルシャットダウン設定
   */
  private setupGracefulShutdown(): void {
    // テスト環境では無効化
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      shutdown('uncaughtException').catch(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection').catch(() => process.exit(1));
    });
  }

  /**
   * クリーンアップ処理
   */
  private async cleanup(): Promise<void> {
    logger.debug('Starting cleanup process...');
    
    // 全てのシャットダウンコールバックを逆順で実行
    for (const callback of this.shutdownCallbacks.reverse()) {
      try {
        await callback();
      } catch (error) {
        logger.error('Error in shutdown callback:', error);
      }
    }
    
    this.shutdownCallbacks.length = 0;
    logger.debug('Cleanup process completed');
  }
}
