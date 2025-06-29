# VRChat Log Relay Server - 主要機能設計仕様

## 🎯 機能概要

このサーバーは4つの主要機能を提供します：

1. **VRChatログ監視システム** - プロセス・ディレクトリ・ファイル監視
2. **メッセージ解析エンジン** - ログを構造化データに変換
3. **WebSocket配信プラットフォーム** - リアルタイム配信
4. **管理・監視機能** - 運用支援とメトリクス

## 🔍 機能1: VRChatログ監視システム

### 概要
VRChatの実行状態を監視し、ログファイルをリアルタイムで追跡する機能。

### 主要コンポーネント
- **VRChatプロセス監視**: Windows タスクマネージャーレベルでのプロセス検知
- **ログディレクトリ監視**: ディレクトリ作成・削除の検知
- **ログファイル監視**: 複数ファイルの同時監視とローテーション対応

### 詳細仕様

#### プロセス監視機能
```typescript
interface VRChatProcessMonitor {
  // 監視設定
  monitoring: {
    interval: 5000;           // 5秒間隔でチェック
    processName: "VRChat.exe";
    retryLimit: 3;            // 検出失敗時のリトライ回数
  };
  
  // 検出方法（優先順位付き）
  detectionMethods: [
    "wmic process where \"name='VRChat.exe'\" get ProcessId",
    "tasklist /FI \"IMAGENAME eq VRChat.exe\" /NH",
    "wmic process where \"commandline like '%VRChat%'\" get ProcessId"
  ];
}
```

**プロセス検知の実装ポイント:**
- Steam経由起動も確実に検知
- 管理者権限不要な検出方法を複数用意
- プロセス終了時の即座な検知

#### ディレクトリ監視機能
```typescript
interface DirectoryMonitoring {
  // 監視対象
  targetPaths: {
    vrchatRoot: "%LOCALAPPDATA%\\Low\\VRChat";
    logDirectory: "%LOCALAPPDATA%\\Low\\VRChat\\VRChat";
  };
  
  // 監視設定
  watcherConfig: {
    depth: 1;                 // 1階層のみ
    ignoreInitial: false;     // 初期状態も検知
    usePolling: false;        // ネイティブイベント使用
  };
}
```

**ディレクトリ監視のシナリオ:**
1. **VRChat初回起動**: ディレクトリ作成を検知してログ監視開始
2. **VRChat終了**: ディレクトリ削除は稀だが、存在確認は継続
3. **手動ディレクトリ削除**: 監視停止とクライアント通知

#### ログファイル監視機能 (vrc-tail準拠)
```typescript
interface LogFileMonitoring {
  // ファイル選択アルゴリズム
  fileSelection: {
    pattern: /^output_log_(\d+)-(\d+)-(\d+)_(\d+)-(\d+)-(\d+)\.txt$/;
    groupPeriod: 30;          // 30秒以内のファイルをグループ化
    maxFiles: 4;              // 最大4ファイル同時監視
  };
  
  // Tail設定
  tailConfig: {
    fromBeginning: false;     // 新しい行のみ
    follow: true;             // ファイル継続監視
    useWatchFile: true;       // ファイル監視使用
  };
}
```

**vrc-tail アルゴリズムの実装:**
```typescript
class VRCLogFileSelector {
  selectTargetFiles(files: FileInfo[]): FileInfo[] {
    // 1. 時刻でソート（新しい順）
    const sorted = files.sort((a, b) => b.timestamp - a.timestamp);
    
    // 2. グループ期間に基づく選択
    const result: FileInfo[] = [];
    let lastTimestamp = 0;
    
    for (const file of sorted) {
      if (result.length === 0) {
        result.push(file);
        lastTimestamp = file.timestamp;
        continue;
      }
      
      // グループ期間内のファイルを追加
      if (lastTimestamp - file.timestamp <= this.groupPeriod * 1000) {
        result.unshift(file);
      } else {
        // 新しいグループ開始 - 古いファイルは破棄
        result.length = 0;
        result.push(file);
        lastTimestamp = file.timestamp;
      }
      
      if (result.length >= this.maxFiles) break;
    }
    
    return result;
  }
}
```

### 状態管理

#### VRChat状態オブジェクト
```typescript
interface VRChatStatus {
  isRunning: boolean;              // プロセス実行状態
  processId?: number;              // プロセスID
  logDirectoryExists: boolean;     // ログディレクトリ存在
  activeLogFiles: number;          // 監視中ファイル数
  lastLogActivity?: number;        // 最終ログ活動時刻
  detectedAt: number;              // 状態検知時刻
}
```

#### 状態変更通知
```typescript
interface StatusChangeEvent {
  type: 'vrchat_process' | 'log_directory' | 'log_monitoring';
  timestamp: number;
  data: Record<string, any>;
  currentStatus: VRChatStatus;
}
```

## 🔧 機能2: メッセージ解析エンジン

### 概要
VRChatの生ログを構造化されたデータに変換し、クライアントが使いやすい形式で提供。

### 解析対象ログタイプ

#### 1. Udonログ
```typescript
// 入力例
"[UdonBehaviour] PlayerTracker: Player joined - Alice"

// 出力例
{
  source: "udon",
  parsed: {
    type: "udon_event",
    data: {
      objectName: "PlayerTracker",
      eventType: "player_joined",
      playerName: "Alice"
    }
  }
}
```

#### 2. VRChatシステムログ
```typescript
// 入力例  
"2025.6.30 15:30:15 Log        -  [Network] Attempting to connect to instance"

// 出力例
{
  source: "vrchat",
  parsed: {
    type: "world_change",
    data: {
      action: "connecting",
      target: "instance"
    }
  }
}
```

#### 3. ユーザーアクションログ
```typescript
// プレイヤー参加
"OnPlayerJoined: Alice"

// プレイヤー離脱  
"OnPlayerLeft: Bob"
```

### 解析パイプライン

#### メッセージ処理フロー
```typescript
class MessageProcessor {
  processLogLine(line: string, metadata: LogMetadata): ProcessedMessage | null {
    // 1. 基本ログ形式の解析
    const basicParsed = this.parseBasicLogFormat(line);
    if (!basicParsed) return null;
    
    // 2. ログタイプ別の詳細解析
    const detailedParsed = this.parseSpecificFormat(basicParsed);
    
    // 3. 構造化メッセージの構築
    return this.buildProcessedMessage(basicParsed, detailedParsed, metadata);
  }
  
  private parseBasicLogFormat(line: string) {
    // VRChatログの基本形式解析
    const patterns = [
      // 標準形式: "2025.6.30 15:30:15 Log - Content"
      /^(\d{4}\.\d{1,2}\.\d{1,2} \d{2}:\d{2}:\d{2}) (Log|Warning|Error|Exception)\s*-\s*(.+)$/,
      // Udon形式: "[UdonBehaviour] Content"
      /^\[UdonBehaviour\]\s*(.+)$/,
      // その他の形式
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) return this.extractMatchedData(match);
    }
    
    return null;
  }
}
```

#### Udon専用パーサー
```typescript
class UdonLogParser {
  parse(content: string): UdonLogData | null {
    const patterns = [
      {
        // "ObjectName: EventType - Data"
        regex: /^(.+?):\s*(.+?)\s*-\s*(.+)$/,
        handler: this.parseObjectEvent
      },
      {
        // "ObjectName.MethodName(params)"  
        regex: /^(.+?)\.(.+?)\((.+?)\)$/,
        handler: this.parseMethodCall
      },
      {
        // カスタムパターン
        regex: /^(.+?):\s*(.+)$/,
        handler: this.parseSimpleEvent
      }
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern.regex);
      if (match) {
        return pattern.handler(match);
      }
    }
    
    return null;
  }
}
```

### データ変換仕様

#### ProcessedMessage 形式
```typescript
interface ProcessedMessage {
  id: string;                    // ユニークID (UUID)
  timestamp: number;             // Unix timestamp
  source: 'vrchat' | 'udon' | 'system';
  level: LogLevel;               // debug, info, warning, error, exception
  raw: string;                   // 元の生ログ
  parsed?: ParsedData;           // 解析済みデータ（オプション）
  metadata: LogMetadata;         // ファイル情報など
}

interface ParsedData {
  type: string;                  // イベントタイプ
  data: Record<string, any>;     // 実際のデータ
}

interface LogMetadata {
  filePath: string;              // ソースファイルパス
  fileIndex: number;             // ファイル番号
  lineNumber: number;            // 行番号
  originalTimestamp?: string;    // 元のタイムスタンプ文字列
}
```

## 📡 機能3: WebSocket配信プラットフォーム

### 概要
解析済みメッセージを複数のクライアントにリアルタイム配信する機能。

### WebSocketサーバー仕様

#### サーバー設定
```typescript
interface WebSocketConfig {
  port: 8080;
  host: "127.0.0.1";            // ローカルのみ
  maxClients: 50;               // 最大接続数
  pingInterval: 30000;          // 30秒間隔のping
  compression: false;           // ローカル通信のため無効
}
```

#### 接続管理
```typescript
class ClientConnection {
  public readonly id: string;           // UUID
  public readonly ws: WebSocket;        // WebSocket接続
  public readonly connectedAt: Date;    // 接続時刻
  public filters: MessageFilter[];     // フィルター設定
  public isAlive: boolean;             // 生存状態
  public lastSeen: Date;               // 最終通信時刻
  public messagesSent: number;         // 送信メッセージ数
  public clientName?: string;          // クライアント識別名
  
  constructor(ws: WebSocket) {
    this.id = generateUUID();
    this.ws = ws;
    this.connectedAt = new Date();
    this.filters = [];
    this.isAlive = true;
    this.lastSeen = new Date();
    this.messagesSent = 0;
  }
}
```

### フィルタリングシステム

#### フィルター定義
```typescript
interface MessageFilter {
  id: string;                          // フィルターID
  type: 'level' | 'source' | 'content' | 'regex';
  condition: FilterCondition;
}

interface FilterCondition {
  operator: 'equals' | 'contains' | 'regex' | 'in';
  value: string | string[] | RegExp;
  caseSensitive?: boolean;
}
```

#### フィルター適用例
```typescript
// ログレベルフィルター
{
  id: "level-filter-1",
  type: "level",
  condition: {
    operator: "in",
    value: ["error", "warning"]
  }
}

// Udonログのみフィルター
{
  id: "source-filter-1", 
  type: "source",
  condition: {
    operator: "equals",
    value: "udon"
  }
}

// 正規表現フィルター
{
  id: "regex-filter-1",
  type: "regex",
  condition: {
    operator: "regex",
    value: /Player\s+(joined|left)/i
  }
}
```

### メッセージ配信アルゴリズム

#### 配信フロー
```typescript
class MessageDistributor {
  async distributeMessage(message: ProcessedMessage): Promise<void> {
    // 1. 配信対象クライアントの選定
    const eligibleClients = this.findEligibleClients(message);
    
    // 2. 並列配信でパフォーマンス向上
    const distributionTasks = eligibleClients.map(async (client) => {
      try {
        await this.sendToClient(client, message);
        this.updateClientMetrics(client.id, 'sent');
      } catch (error) {
        this.handleDeliveryError(client, error);
      }
    });
    
    // 3. 全配信完了待機
    await Promise.allSettled(distributionTasks);
    
    // 4. 配信統計更新
    this.updateDistributionMetrics(message, eligibleClients.length);
  }
  
  private findEligibleClients(message: ProcessedMessage): ClientConnection[] {
    return Array.from(this.clients.values()).filter(client => {
      return client.isAlive && this.matchesClientFilters(client, message);
    });
  }
}
```

## 🎛️ 機能4: 管理・監視機能

### 概要
サーバーの運用状態を監視し、管理操作を提供する機能。

### 管理Web UI

#### ダッシュボード機能
- **サーバー状態**: 稼働時間、メモリ使用量、CPU使用率
- **VRChat状態**: プロセス状態、ログ監視状態
- **接続状況**: アクティブクライアント数、接続一覧
- **メッセージ統計**: 処理数、配信数、エラー数

#### リアルタイム監視
```typescript
interface ServerMetrics {
  uptime: number;                    // 稼働時間（ミリ秒）
  connectedClients: number;          // 接続クライアント数
  monitoredFiles: number;           // 監視中ログファイル数
  messagesProcessed: number;        // 処理済みメッセージ数
  messagesDistributed: number;      // 配信済みメッセージ数
  lastLogTime?: number;             // 最終ログ時刻
  memoryUsage: {                    // メモリ使用量
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  vrchatStatus: VRChatStatus;       // VRChat状態
}
```

### ヘルスチェック機能

#### エンドポイント仕様
```typescript
GET /health
{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": 1719734400000,
  "services": {
    "logWatcher": "running" | "stopped" | "error",
    "websocket": "running" | "stopped" | "error",
    "httpServer": "running" | "stopped" | "error"
  },
  "metrics": {
    "uptime": 86400000,
    "connectedClients": 5,
    "messagesProcessed": 1520,
    "memoryUsageMB": 64
  },
  "vrchat": {
    "isRunning": true,
    "logDirectoryExists": true,
    "activeLogFiles": 2
  }
}
```

#### 自動ヘルスチェック
```typescript
class HealthChecker {
  private checks = [
    this.checkVRChatProcess,
    this.checkLogDirectory,  
    this.checkLogFileWatchers,
    this.checkWebSocketServer,
    this.checkMemoryUsage
  ];
  
  async performHealthCheck(): Promise<HealthStatus> {
    const results = await Promise.allSettled(
      this.checks.map(check => check())
    );
    
    return this.aggregateResults(results);
  }
}
```

### ログ管理

#### ログ出力設定
```typescript
const loggerConfig = {
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // エラーログ
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    // 全ログ
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    }),
    // コンソール（開発時）
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
};
```

#### ログローテーション
```typescript
const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: 'logs/application-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '10m',
  maxFiles: '7d',
  zippedArchive: true
});
```

## ⚡ パフォーマンス要件

### レスポンス時間目標
- **ログ検出→配信**: < 100ms
- **WebSocket接続確立**: < 500ms  
- **管理UI応答**: < 1秒
- **ヘルスチェック**: < 100ms

### スループット目標
- **ログメッセージ処理**: 500メッセージ/秒
- **同時WebSocket接続**: 50接続
- **ファイル監視遅延**: < 50ms

### リソース使用量制限
- **メモリ使用量**: < 128MB
- **CPU使用率**: < 5% (通常時)
- **ディスク容量**: < 50MB (ログ除く)

---

これらの機能により、VRChatログの包括的な監視・配信システムを実現します。
