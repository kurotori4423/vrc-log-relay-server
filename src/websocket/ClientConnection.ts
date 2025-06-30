import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import { BaseMessage } from '../types/messages';
import { logger } from '../utils/logger';

/**
 * WebSocketクライアント接続を管理するクラス
 */
export class ClientConnection extends EventEmitter {
  private ws: WebSocket;
  private id: string;
  private name: string = 'Unknown Client';
  private version: string = '1.0.0';
  private capabilities: string[] = [];
  private description: string = '';
  private connectedAt: number;
  private lastPing: number = Date.now();
  private isAlive: boolean = true;

  constructor(ws: WebSocket) {
    super();
    this.ws = ws;
    this.id = uuidv4();
    this.connectedAt = Date.now();

    this.setupWebSocketListeners();
  }

  /**
   * WebSocketのイベントリスナーを設定
   */
  private setupWebSocketListeners(): void {
    this.ws.on('message', (data: Buffer) => {
      try {
        const messageString = data.toString('utf8');
        const message: BaseMessage = JSON.parse(messageString);
        
        this.lastPing = Date.now();
        this.emit('message', message);
      } catch (error) {
        logger.error('Failed to parse message from client', { 
          clientId: this.id,
          error: error as Error
        });
        
        this.send(JSON.stringify({
          type: 'error',
          data: {
            code: 'INVALID_MESSAGE_FORMAT',
            message: 'Message must be valid JSON'
          }
        }));
      }
    });

    this.ws.on('error', (error: Error) => {
      logger.error('WebSocket connection error', { 
        clientId: this.id,
        error 
      });
      this.emit('error', error);
    });

    this.ws.on('close', (code: number, reason: string) => {
      logger.info('Client connection closed', { 
        clientId: this.id,
        code,
        reason 
      });
      this.isAlive = false;
      this.emit('close', { code, reason });
    });

    this.ws.on('pong', () => {
      this.isAlive = true;
      this.lastPing = Date.now();
    });
  }

  /**
   * クライアントにメッセージを送信
   */
  public send(message: string): void {
    if (!this.isConnected()) {
      throw new Error('Cannot send message: WebSocket is not connected');
    }

    try {
      this.ws.send(message);
    } catch (error) {
      logger.error('Failed to send message to client', { 
        clientId: this.id,
        error: error as Error
      });
      throw error;
    }
  }

  /**
   * 接続を閉じる
   */
  public close(code: number = 1000, reason: string = 'Normal closure'): void {
    if (this.ws && this.isConnected()) {
      this.ws.close(code, reason);
    }
    this.isAlive = false;
  }

  /**
   * Pingを送信して接続状態を確認
   */
  public ping(): void {
    if (this.isConnected()) {
      this.isAlive = false;
      this.ws.ping();
    }
  }

  /**
   * 接続が生きているかチェック
   */
  public isConnected(): boolean {
    return this.ws && 
           this.ws.readyState === WebSocket.OPEN &&
           this.isAlive;
  }

  /**
   * 最後のPing時刻からの経過時間をチェック
   */
  public getTimeSinceLastPing(): number {
    return Date.now() - this.lastPing;
  }

  /**
   * 接続がタイムアウトしているかチェック
   */
  public isTimedOut(timeoutMs: number = 60000): boolean {
    return this.getTimeSinceLastPing() > timeoutMs;
  }

  // ===============================================
  // Getter/Setter methods
  // ===============================================

  public getId(): string {
    return this.id;
  }

  public getName(): string {
    return this.name;
  }

  public setName(name: string): void {
    this.name = name;
  }

  public getVersion(): string {
    return this.version;
  }

  public setVersion(version: string): void {
    this.version = version;
  }

  public getCapabilities(): string[] {
    return [...this.capabilities];
  }

  public setCapabilities(capabilities: string[]): void {
    this.capabilities = [...capabilities];
  }

  public getDescription(): string {
    return this.description;
  }

  public setDescription(description: string): void {
    this.description = description;
  }

  public getConnectedAt(): number {
    return this.connectedAt;
  }

  public getLastPing(): number {
    return this.lastPing;
  }

  public isClientAlive(): boolean {
    return this.isAlive;
  }

  /**
   * クライアント情報の概要を取得
   */
  public getInfo(): {
    id: string;
    name: string;
    version: string;
    capabilities: string[];
    description: string;
    connectedAt: number;
    lastPing: number;
    isAlive: boolean;
    isConnected: boolean;
  } {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      capabilities: this.getCapabilities(),
      description: this.description,
      connectedAt: this.connectedAt,
      lastPing: this.lastPing,
      isAlive: this.isAlive,
      isConnected: this.isConnected()
    };
  }
}
