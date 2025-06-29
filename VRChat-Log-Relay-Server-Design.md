# VRChat Log Relay Server 設計仕様書

## 概要

VRChatのログファイルをリアルタイムで監視し、WebSocketを通じて外部アプリケーションにログ情報を中継するサーバーシステムの設計仕様書です。

## 目的

- VRChatワールドから外部への唯一のデータ出力手段であるログファイルを活用
- 複数のクライアントアプリケーションが容易にVRChatのログ情報を取得できる中継システムを提供
- リアルタイム性と信頼性を両立したログ配信機能

## 技術スタック

### バックエンド
- **Runtime**: Node.js 22.x
- **Language**: TypeScript 5.x
- **Framework**: Express.js 4.x
- **WebSocket**: ws 8.x
- **File Monitoring**: chokidar 4.x
- **Log Tailing**: tail 2.x
- **Configuration**: dotenv, yaml
- **Logging**: winston 3.x
- **Testing**: Jest 29.x

### フロントエンド（管理画面）
- **Framework**: React 18.x + TypeScript
- **Build Tool**: Vite 5.x
- **WebSocket Client**: native WebSocket API
- **UI Library**: Material-UI または Tailwind CSS

### 開発・運用
- **Package Manager**: npm
- **Linter**: ESLint + Prettier
- **Process Manager**: PM2
- **Monitoring**: Health check endpoints

## システムアーキテクチャ

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   VRChat Log    │───▶│  Log Relay      │───▶│  Client Apps    │
│   Files         │    │  Server         │    │  (WebSocket)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │  Admin Web UI   │
                       │  (Management)   │
                       └─────────────────┘
```

## 主要機能

### 1. ログファイル監視機能
- VRChatログディレクトリの自動検出
- 複数ログファイルの同時監視（vrc-tail方式）
- ファイルローテーション対応
- グループ期間に基づく監視対象切り替え
- **VRChat起動状態の監視・検知**
- **ログディレクトリ存在確認と継続監視**

### 2. メッセージ解析機能
- VRChatログフォーマットの解析
- Udonログメッセージの検出・抽出
- ログレベル分類（Log/Warning/Error/Exception）
- 構造化データへの変換

### 3. WebSocket配信機能
- 複数クライアントへの同時配信
- 接続管理・切断検知
- フィルタリング機能
- レート制限・バックプレッシャー対応
- **VRChat起動状態の通知**
- **リアルタイム状態変更通知**

### 4. 管理機能
- 管理Web UI
- 接続クライアント監視
- ログ統計・メトリクス
- 設定変更・リロード

## クラス設計

### Core Classes

#### 1. LogRelayServer
```typescript
class LogRelayServer {
  private config: ServerConfig;
  private logWatcher: VRChatLogWatcher;
  private wsServer: WebSocketServer;
  private httpServer: Express;
  private messageProcessor: MessageProcessor;
  
  constructor(config: ServerConfig);
  start(): Promise<void>;
  stop(): Promise<void>;
  getMetrics(): ServerMetrics;
}
```

#### 2. VRChatLogWatcher
```typescript
class VRChatLogWatcher extends EventEmitter {
  private logDirectory: string;
  private watchers: Map<string, Tail>;
  private config: WatcherConfig;
  private vrchatStatus: VRChatStatus;
  private processWatcher: NodeJS.Timer;
  private directoryWatcher: chokidar.FSWatcher;
  
  constructor(config: WatcherConfig);
  startWatching(): void;
  stopWatching(): void;
  getVRChatStatus(): VRChatStatus;
  private checkVRChatProcess(): boolean;
  private monitorVRChatStatus(): void;
  private addLogFile(filePath: string): void;
  private removeLogFile(filePath: string): void;
  private onLogLine(line: string, fileIndex: number): void;
  private onVRChatStatusChange(status: VRChatStatus): void;
}
```

#### 3. MessageProcessor
```typescript
class MessageProcessor {
  private parsers: Map<string, LogParser>;
  private filters: LogFilter[];
  
  processLogLine(line: string, metadata: LogMetadata): ProcessedMessage | null;
  addParser(type: string, parser: LogParser): void;
  addFilter(filter: LogFilter): void;
  private parseVRChatLog(line: string): ParsedLogData | null;
  private parseUdonLog(line: string): UdonLogData | null;
}
```

#### 4. WebSocketServer
```typescript
class WebSocketServer extends EventEmitter {
  private wss: WS.Server;
  private clients: Map<string, ClientConnection>;
  private messageQueue: MessageQueue;
  
  constructor(port: number, config: WSConfig);
  broadcast(message: ProcessedMessage): void;
  sendToClient(clientId: string, message: ProcessedMessage): void;
  private handleConnection(ws: WS, req: IncomingMessage): void;
  private handleMessage(clientId: string, data: string): void;
  getConnectedClients(): ClientInfo[];
}
```

#### 5. ClientConnection
```typescript
class ClientConnection {
  public readonly id: string;
  public readonly ws: WS;
  public readonly connectedAt: Date;
  public filters: MessageFilter[];
  public isAlive: boolean;
  
  constructor(ws: WS);
  send(message: ProcessedMessage): boolean;
  ping(): void;
  addFilter(filter: MessageFilter): void;
  removeFilter(filterId: string): void;
  matches(message: ProcessedMessage): boolean;
}
```

### Data Types

#### 1. Configuration Types
```typescript
interface ServerConfig {
  server: {
    port: number;
    host: string;    // "127.0.0.1" 固定
  };
  vrchat: {
    logDirectory?: string;
    groupPeriod: number;
    filePattern: RegExp;
  };
  websocket: {
    port: number;
    host: string;    // "127.0.0.1" 固定
    pingInterval: number;
    maxClients: number;
  };
  logging: {
    level: string;
    file?: string;
  };
}

interface WatcherConfig {
  directory: string;
  groupPeriod: number;
  filePattern: RegExp;
  encoding: string;
}
```

#### 2. Message Types
```typescript
interface ProcessedMessage {
  id: string;
  timestamp: number;
  source: 'vrchat' | 'udon' | 'system';
  level: LogLevel;
  raw: string;
  parsed?: ParsedData;
  metadata: LogMetadata;
}

interface ParsedData {
  type: 'world_change' | 'user_join' | 'user_leave' | 'udon_event' | 'vrchat_status' | 'other';
  data: Record<string, any>;
}

interface LogMetadata {
  filePath: string;
  fileIndex: number;
  lineNumber: number;
  originalTimestamp?: string;
}

interface UdonLogData {
  eventType: string;
  objectName?: string;
  methodName?: string;
  parameters?: any[];
  customData?: Record<string, any>;
}

interface VRChatStatus {
  isRunning: boolean;
  processId?: number;
  logDirectoryExists: boolean;
  activeLogFiles: number;
  lastLogActivity?: number;
  detectedAt: number;
}

type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'exception';
```

#### 3. Client Types
```typescript
interface ClientInfo {
  id: string;
  connectedAt: Date;
  lastSeen: Date;
  filtersCount: number;
  messagesSent: number;
  clientName?: string;  // 識別用
}

interface MessageFilter {
  id: string;
  type: 'level' | 'source' | 'content' | 'regex';
  condition: FilterCondition;
}

interface FilterCondition {
  operator: 'equals' | 'contains' | 'regex' | 'in';
  value: string | string[] | RegExp;
  caseSensitive?: boolean;
}
```

## アルゴリズム

### 1. ログファイル監視アルゴリズム（vrc-tail準拠）

```typescript
class LogFileMonitoring {
  private vrchatStatus: VRChatStatus = {
    isRunning: false,
    logDirectoryExists: false,
    activeLogFiles: 0,
    detectedAt: Date.now()
  };

  // VRChatログファイルの検出・監視アルゴリズム
  async monitorLogFiles(): Promise<void> {
    // 1. VRChat起動状態の監視開始
    this.startVRChatStatusMonitoring();
    
    // 2. ログディレクトリの存在確認と監視
    await this.monitorLogDirectory();
    
    // 3. ログファイルの監視（VRChat起動時）
    if (this.vrchatStatus.isRunning && this.vrchatStatus.logDirectoryExists) {
      await this.startLogFileWatching();
    }
  }
  
  private async startVRChatStatusMonitoring(): Promise<void> {
    // VRChatプロセス監視（5秒間隔）
    setInterval(async () => {
      const wasRunning = this.vrchatStatus.isRunning;
      const isNowRunning = await this.checkVRChatProcess();
      
      if (wasRunning !== isNowRunning) {
        this.vrchatStatus.isRunning = isNowRunning;
        this.vrchatStatus.detectedAt = Date.now();
        
        // 状態変更の通知
        this.emitStatusChange('vrchat_process', {
          isRunning: isNowRunning,
          processId: isNowRunning ? await this.getVRChatProcessId() : undefined
        });
        
        if (isNowRunning) {
          // VRChat起動時：ログファイル監視開始
          await this.startLogFileWatching();
        } else {
          // VRChat終了時：監視停止
          this.stopLogFileWatching();
        }
      }
    }, 5000);
  }
  
  private async monitorLogDirectory(): Promise<void> {
    const logDirectory = this.getVRChatLogDirectory();
    
    // 初期チェック
    this.vrchatStatus.logDirectoryExists = await this.checkDirectoryExists(logDirectory);
    
    // ディレクトリ監視（作成・削除の検知）
    const parentDirectory = path.dirname(logDirectory);
    this.directoryWatcher = chokidar.watch(parentDirectory, {
      depth: 1,
      ignoreInitial: true
    });
    
    this.directoryWatcher.on('addDir', (dirPath) => {
      if (dirPath === logDirectory) {
        this.vrchatStatus.logDirectoryExists = true;
        this.emitStatusChange('log_directory', { exists: true });
        if (this.vrchatStatus.isRunning) {
          this.startLogFileWatching();
        }
      }
    });
    
    this.directoryWatcher.on('unlinkDir', (dirPath) => {
      if (dirPath === logDirectory) {
        this.vrchatStatus.logDirectoryExists = false;
        this.emitStatusChange('log_directory', { exists: false });
        this.stopLogFileWatching();
      }
    });
  }
  
  private async startLogFileWatching(): Promise<void> {
    if (!this.vrchatStatus.logDirectoryExists) {
      return;
    }
    
    // 1. ログディレクトリ内のファイル一覧取得
    const files = await this.scanLogDirectory();
    
    // 2. ファイル名から日時を解析してソート
    const sortedFiles = files
      .map(file => ({
        path: file,
        timestamp: this.parseTimestampFromFilename(file)
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
    
    // 3. グループ期間に基づく監視対象選定
    const targetFiles = this.selectTargetFiles(sortedFiles);
    
    // 4. 各ファイルにTailを設定
    targetFiles.forEach((file, index) => {
      this.setupTailWatcher(file.path, index);
    });
    
    this.vrchatStatus.activeLogFiles = targetFiles.length;
    
    // ログファイル監視状態の通知
    this.emitStatusChange('log_monitoring', {
      active: true,
      fileCount: targetFiles.length,
      files: targetFiles.map(f => path.basename(f.path))
    });
  }
  
  private async checkVRChatProcess(): Promise<boolean> {
    try {
      const commands = [
        // メインの検出方法
        'wmic process where "name=\'VRChat.exe\'" get ProcessId /format:value',
        // フォールバック方法
        'tasklist /FI "IMAGENAME eq VRChat.exe" /NH',
        // Steam経由の起動も検出
        'wmic process where "commandline like \'%VRChat%\'" get ProcessId /format:value'
      ];
      
      for (const command of commands) {
        const result = await this.execCommand(command);
        if (this.hasValidProcessOutput(result)) {
          return true;
        }
      }
      return false;
    } catch (error) {
      console.warn('VRChat process check failed:', error);
      return false;
    }
  }
  
  private emitStatusChange(type: string, data: any): void {
    this.emit('vrchat_status_change', {
      type,
      timestamp: Date.now(),
      data,
      currentStatus: { ...this.vrchatStatus }
    });
  }
  
  private selectTargetFiles(files: FileInfo[]): FileInfo[] {
    const result: FileInfo[] = [];
    let lastTimestamp = 0;
    
    for (const file of files.reverse()) {
      if (result.length === 0) {
        result.push(file);
        lastTimestamp = file.timestamp;
        continue;
      }
      
      // グループ期間内のファイルのみ追加
      if (file.timestamp - lastTimestamp <= this.config.groupPeriod * 1000) {
        result.unshift(file);
      } else {
        // 新しいグループ開始
        result.length = 0;
        result.push(file);
        this.cleanupOldWatchers();
      }
      lastTimestamp = file.timestamp;
    }
    
    return result.slice(0, 4); // 最大4ファイル
  }
}
```

### 2. メッセージ解析アルゴリズム

```typescript
class MessageParsing {
  parseVRChatLogLine(line: string): ProcessedMessage | null {
    // 1. 基本ログフォーマットの解析
    const basicMatch = line.match(this.LOG_PATTERN);
    if (!basicMatch) return null;
    
    const [, timestamp, level, content] = basicMatch;
    
    // 2. Udonログの特別処理
    const udonData = this.parseUdonContent(content);
    
    // 3. その他VRCイベントの解析
    const eventData = this.parseVRChatEvents(content);
    
    // 4. 構造化メッセージの構築
    return {
      id: this.generateMessageId(),
      timestamp: Date.now(),
      source: udonData ? 'udon' : 'vrchat',
      level: level.toLowerCase() as LogLevel,
      raw: line,
      parsed: udonData || eventData,
      metadata: this.createMetadata(line)
    };
  }
  
  private parseUdonContent(content: string): UdonLogData | null {
    // Udonログパターンの検出
    const patterns = [
      /\[UdonBehaviour\]\s+(.+?):\s*(.+)/,
      /\[Udon\]\s+(.+)/,
      // カスタムUdonログパターン
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return this.processUdonMatch(match);
      }
    }
    
    return null;
  }
}
```

### 3. WebSocket配信アルゴリズム

```typescript
class MessageDistribution {
  async distributeMessage(message: ProcessedMessage): Promise<void> {
    const eligibleClients = this.findEligibleClients(message);
    
    // 並列配信でパフォーマンス向上
    const distributionTasks = eligibleClients.map(async (client) => {
      try {
        await this.sendToClient(client, message);
        this.updateClientMetrics(client.id, 'sent');
      } catch (error) {
        this.handleDeliveryError(client, error);
      }
    });
    
    await Promise.allSettled(distributionTasks);
  }
  
  private findEligibleClients(message: ProcessedMessage): ClientConnection[] {
    return Array.from(this.clients.values()).filter(client => {
      return client.isAlive && client.matches(message);
    });
  }
  
  private async sendToClient(
    client: ClientConnection, 
    message: ProcessedMessage
  ): Promise<void> {
    const payload = JSON.stringify({
      type: 'log_message',
      data: message
    });
    
    return new Promise((resolve, reject) => {
      client.ws.send(payload, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
```

## WebSocketプロトコル仕様

### 1. 接続・認証
```typescript
// クライアント → サーバー（簡素化）
{
  "type": "hello",
  "data": {
    "clientName": "MyVRCApp",
    "version": "1.0.0"
  }
}

// サーバー → クライアント
{
  "type": "welcome",
  "data": {
    "clientId": "client-uuid",
    "serverVersion": "1.0.0",
    "connectedAt": 1719734400000
  }
}
```

### 2. フィルター設定
```typescript
// フィルター追加
{
  "type": "add_filter",
  "data": {
    "id": "filter-1",
    "type": "level",
    "condition": {
      "operator": "in",
      "value": ["error", "warning"]
    }
  }
}

// フィルター削除
{
  "type": "remove_filter",
  "data": {
    "id": "filter-1"
  }
}
```

### 3. ログメッセージ配信
```typescript
// サーバー → クライアント
{
  "type": "log_message",
  "data": {
    "id": "msg-uuid",
    "timestamp": 1719734400000,
    "source": "udon",
    "level": "info",
    "raw": "[UdonBehaviour] PlayerTracker: Player joined - Alice",
    "parsed": {
      "type": "udon_event",
      "data": {
        "objectName": "PlayerTracker",
        "eventType": "player_joined",
        "playerName": "Alice"
      }
    }
  }
}
```

### 4. ステータス・メトリクス
```typescript
// サーバー情報要求
{
  "type": "get_status"
}

// サーバー情報応答
{
  "type": "status",
  "data": {
    "uptime": 86400000,
    "connectedClients": 5,
    "monitoredFiles": 2,
    "messagesProcessed": 1520,
    "lastLogTime": 1719734400000,
    "vrchatStatus": {
      "isRunning": true,
      "processId": 12345,
      "logDirectoryExists": true,
      "activeLogFiles": 2,
      "lastLogActivity": 1719734395000,
      "detectedAt": 1719734300000
    }
  }
}
```

### 5. VRChat状態変更通知
```typescript
// VRChat起動検知
{
  "type": "vrchat_status_change",
  "data": {
    "changeType": "vrchat_process",
    "timestamp": 1719734400000,
    "data": {
      "isRunning": true,
      "processId": 12345
    },
    "currentStatus": {
      "isRunning": true,
      "logDirectoryExists": true,
      "activeLogFiles": 0
    }
  }
}

// ログディレクトリ作成検知
{
  "type": "vrchat_status_change",
  "data": {
    "changeType": "log_directory",
    "timestamp": 1719734405000,
    "data": {
      "exists": true
    }
  }
}

// ログファイル監視開始
{
  "type": "vrchat_status_change",
  "data": {
    "changeType": "log_monitoring",
    "timestamp": 1719734410000,
    "data": {
      "active": true,
      "fileCount": 1,
      "files": ["output_log_2025-06-30_15-30-10.txt"]
    }
  }
}
```

## ファイル構成

```
vrchat-log-relay-server/
├── src/
│   ├── index.ts                 # エントリーポイント
│   ├── server/
│   │   ├── LogRelayServer.ts    # メインサーバークラス
│   │   └── config.ts            # 設定管理
│   ├── log/
│   │   ├── VRChatLogWatcher.ts  # ログファイル監視
│   │   ├── MessageProcessor.ts  # メッセージ解析
│   │   └── parsers/
│   │       ├── UdonLogParser.ts
│   │       └── VRChatEventParser.ts
│   ├── websocket/
│   │   ├── WebSocketServer.ts   # WebSocket管理
│   │   ├── ClientConnection.ts  # クライアント接続管理
│   │   └── MessageFilter.ts     # フィルタリング
│   ├── web/
│   │   ├── AdminController.ts   # 管理API
│   │   └── routes/
│   │       ├── api.ts
│   │       └── health.ts
│   ├── types/
│   │   ├── index.ts
│   │   ├── config.ts
│   │   ├── messages.ts
│   │   └── client.ts
│   └── utils/
│       ├── logger.ts
│       ├── fileUtils.ts
│       └── messageQueue.ts
├── web-ui/                      # 管理Web UI
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── hooks/
│   └── dist/
├── config/
│   ├── default.yaml
│   ├── development.yaml
│   └── production.yaml
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── docs/
│   ├── api.md
│   ├── client-examples/
│   └── deployment.md
├── scripts/
│   ├── build.js
│   └── start.js
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## 設定ファイル例

### config/default.yaml
```yaml
server:
  port: 3000
  host: "127.0.0.1"  # ローカルのみ
  cors:
    enabled: false     # ローカル環境のためCORS無効

vrchat:
  logDirectory: null  # 自動検出
  groupPeriod: 30     # 秒
  filePattern: "^output_log_(\\d+)-(\\d+)-(\\d+)_(\\d+)-(\\d+)-(\\d+)\\.txt$"
  processMonitoring:
    enabled: true     # VRChatプロセス監視
    interval: 5000    # 5秒間隔
    processName: "VRChat.exe"  # Windows

websocket:
  port: 8080
  host: "127.0.0.1"   # ローカルのみ
  pingInterval: 30000  # 30秒
  maxClients: 50      # ローカル用途のため削減
  compression: false  # ローカル通信のため無効
  statusBroadcast: true  # 状態変更の自動配信

logging:
  level: "info"
  file: "logs/server.log"
  maxSize: "10mb"
  maxFiles: 3

features:
  webUI: true
  healthCheck: true
  metrics: true
  authentication: false  # 認証無効
  rateLimit: false       # レート制限無効
  vrchatMonitoring: true # VRChat監視機能
```

## パフォーマンス要件

### 1. レスポンス時間
- ログ検出からWebSocket配信まで: < 100ms
- WebSocket接続確立: < 500ms
- 管理UI応答時間: < 1秒

### 2. スループット
- 同時WebSocket接続数: 50接続（ローカル用途）
- ログメッセージ処理能力: 500メッセージ/秒
- ファイル監視遅延: < 50ms

### 3. リソース使用量
- メモリ使用量: < 128MB（通常運用時）
- CPU使用率: < 5%（通常時）
- ディスク容量: < 50MB（ログファイル除く）

## セキュリティ考慮事項

### ローカル環境での使用前提
このサーバーはローカル環境内でのアプリケーション間通信を目的としており、以下の方針でセキュリティを簡素化します：

### 1. 認証・認可
- **認証機能なし**: ローカル環境での使用のため認証は不要
- **接続制限**: localhost (127.0.0.1) からの接続のみ許可
- **基本的なレート制限**: 意図しない負荷を防ぐための軽微な制限のみ

### 2. データ保護
- **ログデータそのまま配信**: VRChatログの内容をそのまま配信
- **フィルタリング**: 必要に応じてクライアント側でフィルタリング実装
- **一時的なメモリ保持**: ログデータの永続化は行わない

### 3. ネットワーク設定
- **HTTP/WS使用**: ローカル通信のためHTTPS/WSSは不要
- **CORS無効化**: 同一マシン内通信のため制限なし
- **ファイアウォール**: 外部アクセス不要のためローカルバインド

## 運用・監視

### 1. ヘルスチェック
```typescript
GET /health
{
  "status": "healthy",
  "timestamp": 1719734400000,
  "services": {
    "logWatcher": "running",
    "websocket": "running",
    "database": "n/a"
  },
  "metrics": {
    "uptime": 86400,
    "connectedClients": 5,
    "messagesProcessed": 1520
  }
}
```

### 2. ログ・メトリクス
- Winston によるログ管理
- Prometheus メトリクス対応
- 管理UI でのリアルタイム監視

### 3. エラーハンドリング
- 自動復旧機能
- ログファイル切り替え時の継続監視
- グレースフルシャットダウン
- 接続切れクライアントの自動クリーンアップ

## デプロイメント・使用方法

### 1. 開発環境での起動
```bash
# 依存関係インストール
npm install

# 開発モードで起動
npm run dev

# ビルドして起動
npm run build
npm start
```

### 2. Windows での実行ファイル化
```bash
# PKG を使用してWindows実行ファイル作成
npm run build-exe

# 実行ファイルでの起動
./vrchat-log-relay-server.exe
```

### 3. クライアントアプリケーションからの接続例
```javascript
// WebSocket接続
const ws = new WebSocket('ws://127.0.0.1:8080');

ws.onopen = () => {
  // 接続時の挨拶
  ws.send(JSON.stringify({
    type: 'hello',
    data: {
      clientName: 'MyVRCApp',
      version: '1.0.0'
    }
  }));
  
  // 現在のVRChat状態を要求
  ws.send(JSON.stringify({
    type: 'get_status'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'welcome':
      console.log('Connected to VRChat Log Relay Server');
      console.log('Server version:', message.data.serverVersion);
      break;
      
    case 'status':
      const status = message.data.vrchatStatus;
      if (!status.isRunning) {
        console.log('⚠️ VRChat is not running');
        showVRChatNotRunningMessage();
      } else if (!status.logDirectoryExists) {
        console.log('⚠️ VRChat log directory not found');
      } else if (status.activeLogFiles === 0) {
        console.log('⚠️ No active VRChat log files');
      } else {
        console.log('✅ VRChat monitoring active');
      }
      break;
      
    case 'vrchat_status_change':
      handleVRChatStatusChange(message.data);
      break;
      
    case 'log_message':
      const logData = message.data;
      console.log('VRChat Log:', logData.raw);
      
      // Udonイベントの処理
      if (logData.source === 'udon') {
        handleUdonEvent(logData.parsed);
      }
      break;
  }
};

function handleVRChatStatusChange(statusChange) {
  switch (statusChange.changeType) {
    case 'vrchat_process':
      if (statusChange.data.isRunning) {
        console.log('✅ VRChat started');
        hideVRChatNotRunningMessage();
      } else {
        console.log('❌ VRChat stopped');
        showVRChatNotRunningMessage();
      }
      break;
      
    case 'log_directory':
      if (statusChange.data.exists) {
        console.log('✅ VRChat log directory created');
      } else {
        console.log('❌ VRChat log directory removed');
      }
      break;
      
    case 'log_monitoring':
      if (statusChange.data.active) {
        console.log(`✅ Log monitoring started (${statusChange.data.fileCount} files)`);
      } else {
        console.log('⏹️ Log monitoring stopped');
      }
      break;
  }
}

function showVRChatNotRunningMessage() {
  // UIにVRChat未起動の警告を表示
  const warningElement = document.getElementById('vrchat-warning');
  if (warningElement) {
    warningElement.style.display = 'block';
    warningElement.textContent = 'VRChatが起動していません。VRChatを起動してください。';
  }
}

function hideVRChatNotRunningMessage() {
  // UIからVRChat未起動の警告を非表示
  const warningElement = document.getElementById('vrchat-warning');
  if (warningElement) {
    warningElement.style.display = 'none';
  }
}
```

## 今後の拡張予定

### Phase 2
- HTTP REST API対応
- Server-Sent Events (SSE) 対応
- データベース永続化

### Phase 3
- クラスタリング対応
- Redis による状態共有
- 負荷分散機能

### Phase 4
- プラグインシステム
- カスタムパーサー対応
- 高度なフィルタリング

---

**更新日**: 2025年6月30日  
**バージョン**: 1.0.0  
**作成者**: AI Assistant

## VRChat起動状態監視の運用シナリオ

### シナリオ1: サーバー起動 → VRChat起動
```
1. ログ中継サーバー起動
   ├─ VRChatプロセス監視開始
   ├─ ログディレクトリ監視開始
   └─ クライアントに状態通知: isRunning: false

2. VRChat起動
   ├─ プロセス検知
   ├─ ログディレクトリ作成確認
   ├─ ログファイル監視開始
   └─ クライアントに状態変更通知

3. ログ配信開始
```

### シナリオ2: VRChat起動中 → サーバー起動
```
1. VRChat既に実行中
2. ログ中継サーバー起動
   ├─ VRChatプロセス検知
   ├─ 既存ログファイル検索
   ├─ 最新ログファイルからtail開始
   └─ クライアントに状態通知: isRunning: true

3. 即座にログ配信開始
```

### シナリオ3: VRChat終了 → 再起動
```
1. VRChat終了検知
   ├─ ログファイル監視停止
   └─ クライアントに状態通知: isRunning: false

2. VRChat再起動検知
   ├─ 新しいログファイル検出
   ├─ 監視再開
   └─ クライアントに状態通知: isRunning: true
```

### 状態管理の実装ポイント

#### 1. プロセス監視の信頼性確保
```typescript
// Windows環境での確実なプロセス検知
private async checkVRChatProcess(): Promise<boolean> {
  try {
    const commands = [
      // メインの検出方法
      'wmic process where "name=\'VRChat.exe\'" get ProcessId /format:value',
      // フォールバック方法
      'tasklist /FI "IMAGENAME eq VRChat.exe" /NH',
      // Steam経由の起動も検出
      'wmic process where "commandline like \'%VRChat%\'" get ProcessId /format:value'
    ];
    
    for (const command of commands) {
      const result = await this.execCommand(command);
      if (this.hasValidProcessOutput(result)) {
        return true;
      }
    }
    return false;
  } catch (error) {
    console.warn('VRChat process check failed:', error);
    return false;
  }
}
```

#### 2. ログディレクトリの状態監視
```typescript
// ディレクトリ階層の監視
private setupDirectoryWatching(): void {
  const vrchatRoot = path.join(process.env.LOCALAPPDATA, 'Low', 'VRChat');
  const logDirectory = path.join(vrchatRoot, 'VRChat');
  
  // VRChatルートディレクトリの監視
  this.rootWatcher = chokidar.watch(vrchatRoot, {
    depth: 1,
    ignoreInitial: false
  });
  
  // ログディレクトリの作成・削除監視
  this.rootWatcher.on('addDir', (dirPath) => {
    if (path.basename(dirPath) === 'VRChat') {
      this.onLogDirectoryCreated(dirPath);
    }
  });
  
  this.rootWatcher.on('unlinkDir', (dirPath) => {
    if (path.basename(dirPath) === 'VRChat') {
      this.onLogDirectoryRemoved(dirPath);
    }
  });
}
```

#### 3. 段階的な状態通知
```typescript
// 段階的な状態変更の通知
private emitProgressiveStatus(): void {
  const notifications = [];
  
  // Stage 1: プロセス検知
  if (this.status.isRunning) {
    notifications.push({
      stage: 'process_detected',
      message: 'VRChat process detected',
      progress: 25
    });
  }
  
  // Stage 2: ディレクトリ確認
  if (this.status.logDirectoryExists) {
    notifications.push({
      stage: 'directory_found',
      message: 'Log directory found',
      progress: 50
    });
  }
  
  // Stage 3: ログファイル検出
  if (this.status.activeLogFiles > 0) {
    notifications.push({
      stage: 'logs_active',
      message: `${this.status.activeLogFiles} log files active`,
      progress: 75
    });
  }
  
  // Stage 4: 監視開始
  if (this.isMonitoringActive) {
    notifications.push({
      stage: 'monitoring_active',
      message: 'Log monitoring active',
      progress: 100
    });
  }
  
  // 段階的通知の送信
  notifications.forEach(notification => {
    this.emit('initialization_progress', notification);
  });
}
```
