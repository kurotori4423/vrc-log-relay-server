import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { IncomingMessage } from 'http';
import { EventEmitter } from 'events';
import { ClientConnection } from './ClientConnection';
import { logger } from '../utils/logger';
import { ServerConfig } from '../types/config';
import { BaseMessage } from '../types/messages';

/**
 * WebSocketサーバー
 * 複数のクライアント接続を管理し、リアルタイムでメッセージを配信する
 */
export class WebSocketServer extends EventEmitter {
  private wss: WSServer | null = null;
  private clients: Map<string, ClientConnection> = new Map();
  private config: ServerConfig;
  private isRunning: boolean = false;

  constructor(config: ServerConfig) {
    super();
    this.config = config;
  }

  /**
   * WebSocketサーバーを開始
   */
  public async start(httpServer?: HTTPServer): Promise<void> {
    if (this.isRunning) {
      throw new Error('WebSocket server is already running');
    }

    try {
      // WebSocketサーバーを作成
      const wsOptions = {
        port: httpServer ? undefined : this.config.websocket.port,
        host: this.config.websocket.host,
        server: httpServer,
        perMessageDeflate: false, // ローカル通信では圧縮無効
        maxPayload: 1024 * 1024,  // 1MB制限
        clientTracking: true,
        skipUTF8Validation: false
      };

      this.wss = new WSServer(wsOptions);

      // イベントリスナーの設定
      this.setupEventListeners();

      this.isRunning = true;
      
      const address = httpServer ? 'HTTP server' : `${this.config.websocket.host}:${this.config.websocket.port}`;
      logger.info(`WebSocket server started on ${address}`);

      this.emit('started');
    } catch (error) {
      logger.error('Failed to start WebSocket server', { error });
      throw error;
    }
  }

  /**
   * WebSocketサーバーを停止
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // すべてのクライアント接続を閉じる
      for (const client of this.clients.values()) {
        client.close(1001, 'Server shutting down');
      }
      this.clients.clear();

      // WebSocketサーバーを閉じる
      if (this.wss) {
        await new Promise<void>((resolve, reject) => {
          this.wss!.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
        this.wss = null;
      }

      this.isRunning = false;
      logger.info('WebSocket server stopped');
      this.emit('stopped');
    } catch (error) {
      logger.error('Error stopping WebSocket server', { error });
      throw error;
    }
  }

  /**
   * すべてのクライアントにメッセージをブロードキャスト
   */
  public broadcast(message: BaseMessage): void {
    if (!this.isRunning) {
      logger.warn('Cannot broadcast: WebSocket server is not running');
      return;
    }

    const messageString = JSON.stringify(message);
    let successCount = 0;
    let errorCount = 0;

    for (const client of this.clients.values()) {
      try {
        if (client.isConnected()) {
          client.send(messageString);
          successCount++;
        }
      } catch (error) {
        logger.error('Failed to send message to client', { 
          clientId: client.getId(),
          error 
        });
        errorCount++;
      }
    }

    logger.debug('Message broadcasted', {
      messageType: message.type,
      successCount,
      errorCount,
      totalClients: this.clients.size
    });
  }

  /**
   * 特定のクライアントにメッセージを送信
   */
  public sendToClient(clientId: string, message: BaseMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || !client.isConnected()) {
      logger.warn('Client not found or not connected', { clientId });
      return false;
    }

    try {
      client.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('Failed to send message to client', { clientId, error });
      return false;
    }
  }

  /**
   * 接続中のクライアント数を取得
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * 接続中のクライアント情報を取得
   */
  public getClientInfo(): Array<{ id: string; name: string; connectedAt: number }> {
    return Array.from(this.clients.values()).map(client => ({
      id: client.getId(),
      name: client.getName(),
      connectedAt: client.getConnectedAt()
    }));
  }

  /**
   * サーバーの動作状態を取得
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * イベントリスナーの設定
   */
  private setupEventListeners(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { error });
      this.emit('error', error);
    });

    this.wss.on('close', () => {
      logger.info('WebSocket server closed');
      this.emit('closed');
    });
  }

  /**
   * 新しいクライアント接続を処理
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    try {
      // 接続元IPアドレスの検証
      const clientIP = req.socket.remoteAddress;
      if (!clientIP || !this.isValidClientIP(clientIP)) {
        logger.warn('Unauthorized connection attempt', { clientIP });
        ws.close(1008, 'Unauthorized');
        return;
      }

      // 最大接続数の確認
      if (this.clients.size >= this.config.websocket.maxClients) {
        logger.warn('Maximum client connections reached', { 
          currentClients: this.clients.size,
          maxClients: this.config.websocket.maxClients
        });
        
        const errorMessage = {
          type: 'error',
          data: {
            code: 'CONNECTION_LIMIT',
            message: 'Maximum client connections reached',
            details: {
              maxClients: this.config.websocket.maxClients,
              currentClients: this.clients.size
            }
          }
        };
        
        ws.send(JSON.stringify(errorMessage));
        ws.close(1008, 'Connection limit exceeded');
        return;
      }

      // クライアント接続オブジェクトを作成
      const clientConnection = new ClientConnection(ws);

      // クライアントイベントの設定
      clientConnection.on('message', (message: BaseMessage) => {
        this.handleClientMessage(clientConnection, message);
      });

      clientConnection.on('error', (error: Error) => {
        logger.error('Client connection error', { 
          clientId: clientConnection.getId(),
          error 
        });
      });

      clientConnection.on('close', () => {
        this.handleClientDisconnection(clientConnection);
      });

      // クライアントを登録
      this.clients.set(clientConnection.getId(), clientConnection);

      logger.info('New client connected', {
        clientId: clientConnection.getId(),
        clientIP,
        totalClients: this.clients.size
      });

      this.emit('clientConnected', {
        clientId: clientConnection.getId(),
        clientIP,
        totalClients: this.clients.size
      });

    } catch (error) {
      logger.error('Error handling new connection', { error });
      ws.close(1011, 'Internal server error');
    }
  }

  /**
   * クライアントからのメッセージを処理
   */
  private handleClientMessage(client: ClientConnection, message: BaseMessage): void {
    logger.debug('Received message from client', {
      clientId: client.getId(),
      messageType: message.type
    });

    // メッセージタイプ別の処理
    switch (message.type) {
      case 'hello':
        this.handleHelloMessage(client, message);
        break;
      case 'get_status':
        this.handleGetStatusMessage(client);
        break;
      case 'get_metrics':
        this.handleGetMetricsMessage(client, message);
        break;
      case 'set_filter':
        this.handleSetFilterMessage(client, message);
        break;
      case 'ping':
        this.handlePingMessage(client);
        break;
      default:
        logger.warn('Unknown message type', {
          clientId: client.getId(),
          messageType: message.type
        });
        
        client.send(JSON.stringify({
          type: 'error',
          data: {
            code: 'UNKNOWN_MESSAGE_TYPE',
            message: `Unknown message type: ${message.type}`
          }
        }));
        break;
    }
  }

  /**
   * Helloメッセージの処理
   */
  private handleHelloMessage(client: ClientConnection, message: BaseMessage): void {
    if (!message.data) {
      logger.warn('Hello message missing data', { clientId: client.getId() });
      return;
    }

    const { clientName, version, capabilities, description } = message.data;

    // クライアント情報を更新
    client.setName(clientName || 'Unknown Client');
    client.setVersion(version || '1.0.0');
    client.setCapabilities(capabilities || []);
    client.setDescription(description || '');

    // Welcomeメッセージを送信
    const welcomeMessage = {
      type: 'welcome',
      data: {
        clientId: client.getId(),
        serverVersion: '1.0.0', // TODO: package.jsonから取得
        connectedAt: client.getConnectedAt(),
        capabilities: [
          'filtering',
          'status_monitoring',
          'metrics'
        ]
      }
    };

    client.send(JSON.stringify(welcomeMessage));

    logger.info('Client introduced', {
      clientId: client.getId(),
      clientName: client.getName(),
      version: client.getVersion()
    });
  }

  /**
   * Get statusメッセージの処理
   */
  private handleGetStatusMessage(client: ClientConnection): void {
    // ステータス情報を収集（現在は基本情報のみ）
    const statusMessage = {
      type: 'status',
      data: {
        uptime: process.uptime() * 1000,
        connectedClients: this.clients.size,
        monitoredFiles: 0, // TODO: ログ監視から取得
        messagesProcessed: 0, // TODO: 統計情報から取得
        messagesDistributed: 0, // TODO: 統計情報から取得
        lastLogTime: null, // TODO: 最新ログ時刻
        memoryUsage: process.memoryUsage(),
        vrchatStatus: {
          isRunning: false, // TODO: VRChat監視から取得
          processId: null,
          logDirectoryExists: false,
          activeLogFiles: 0,
          lastLogActivity: null,
          detectedAt: null
        }
      }
    };

    client.send(JSON.stringify(statusMessage));
  }

  /**
   * Get metricsメッセージの処理
   */
  private handleGetMetricsMessage(client: ClientConnection, message: BaseMessage): void {
    // メトリクス情報を収集（現在は基本情報のみ）
    const metricsMessage = {
      type: 'metrics',
      data: {
        current: {
          messagesPerSecond: 0, // TODO: 統計情報から計算
          clientConnections: this.clients.size,
          memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
          cpuUsage: 0 // TODO: CPU使用率取得
        },
        history: [] // TODO: 履歴データ（オプション）
      }
    };

    client.send(JSON.stringify(metricsMessage));
  }

  /**
   * Set filterメッセージの処理
   */
  private handleSetFilterMessage(client: ClientConnection, message: BaseMessage): void {
    // TODO: フィルター設定の実装
    logger.debug('Filter setting requested', {
      clientId: client.getId(),
      filter: message.data
    });

    // 確認メッセージを送信
    client.send(JSON.stringify({
      type: 'filter_set',
      data: {
        success: true,
        filter: message.data
      }
    }));
  }

  /**
   * Pingメッセージの処理
   */
  private handlePingMessage(client: ClientConnection): void {
    client.send(JSON.stringify({
      type: 'pong',
      data: {
        timestamp: Date.now()
      }
    }));
  }

  /**
   * クライアント切断の処理
   */
  private handleClientDisconnection(client: ClientConnection): void {
    const clientId = client.getId();
    this.clients.delete(clientId);

    logger.info('Client disconnected', {
      clientId,
      clientName: client.getName(),
      totalClients: this.clients.size
    });

    this.emit('clientDisconnected', {
      clientId,
      clientName: client.getName(),
      totalClients: this.clients.size
    });
  }

  /**
   * クライアントIPアドレスの検証
   */
  private isValidClientIP(clientIP: string): boolean {
    // localhost のみ許可
    const allowedIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    return allowedIPs.includes(clientIP);
  }
}
