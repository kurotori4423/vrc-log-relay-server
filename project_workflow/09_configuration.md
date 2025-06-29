# VRChat Log Relay Server - 設定ファイル仕様

## 📋 設定システム概要

VRChat Log Relay Server は、柔軟性と保守性を重視した階層化設定システムを採用しています。

### 設定ファイル優先順位
1. **環境変数** (最優先)
2. **コマンドライン引数**
3. **ローカル設定ファイル** (`config/local.yaml`)
4. **環境別設定ファイル** (`config/development.yaml`, `config/production.yaml`)
5. **デフォルト設定ファイル** (`config/default.yaml`) (最低優先)

### ファイル構成
```
config/
├── default.yaml           # デフォルト設定
├── development.yaml       # 開発環境設定
├── production.yaml        # 本番環境設定
├── local.yaml            # ローカル固有設定（Git除外）
└── schema.json           # 設定スキーマ（検証用）
```

## 📄 default.yaml - デフォルト設定

```yaml
# VRChat Log Relay Server - デフォルト設定
# すべての設定項目のベースライン値を定義

# サーバー基本設定
server:
  port: 3000                    # HTTP サーバーポート
  host: "127.0.0.1"            # バインドアドレス（ローカルのみ）
  name: "VRChat Log Relay Server"
  version: "1.0.0"
  
  # CORS設定（ローカル環境のため基本無効）
  cors:
    enabled: false
    origin: ["http://localhost:3000"]
    credentials: false
  
  # セキュリティ設定
  security:
    rateLimitEnabled: false     # レート制限無効
    maxRequestsPerMinute: 0     # 制限なし
    trustProxy: false           # プロキシ信頼無効

# VRChat関連設定
vrchat:
  # ログディレクトリ（null = 自動検出）
  logDirectory: null
  
  # ファイル監視設定
  monitoring:
    groupPeriod: 30             # ファイルグループ期間（秒）
    maxFiles: 4                 # 最大同時監視ファイル数
    filePattern: "^output_log_(\\d{4})-(\\d{2})-(\\d{2})_(\\d{2})-(\\d{2})-(\\d{2})\\.txt$"
    encoding: "utf8"            # ファイルエンコーディング
  
  # プロセス監視設定
  processMonitoring:
    enabled: true               # VRChatプロセス監視有効
    interval: 5000              # 監視間隔（ミリ秒）
    processName: "VRChat.exe"   # 監視対象プロセス名
    retryLimit: 3               # 検出失敗時のリトライ数
    detectionTimeout: 10000     # 検出タイムアウト（ミリ秒）
  
  # ディレクトリ監視設定
  directoryMonitoring:
    enabled: true               # ディレクトリ監視有効
    depth: 1                    # 監視階層
    usePolling: false           # ポーリング使用（通常false）
    pollInterval: 1000          # ポーリング間隔（usePolling=true時）

# WebSocket設定
websocket:
  port: 8080                    # WebSocketサーバーポート
  host: "127.0.0.1"            # バインドアドレス（ローカルのみ）
  
  # 接続管理
  maxClients: 50                # 最大同時接続数
  pingInterval: 30000           # Ping間隔（ミリ秒）
  pongTimeout: 10000            # Pong応答タイムアウト
  
  # パフォーマンス設定
  compression: false            # 圧縮無効（ローカル通信）
  perMessageDeflate: false      # メッセージ単位圧縮無効
  maxPayload: 1048576           # 最大ペイロードサイズ（1MB）
  
  # 配信設定
  distributionBatch:
    enabled: true               # バッチ配信有効
    batchSize: 10               # バッチサイズ
    batchTimeout: 50            # バッチタイムアウト（ミリ秒）
  
  # ステータス配信
  statusBroadcast:
    enabled: true               # 状態変更自動配信
    debounceInterval: 1000      # 状態変更のデバウンス間隔

# ログ設定
logging:
  # 基本設定
  level: "info"                 # ログレベル: debug, info, warn, error
  format: "json"                # フォーマット: json, text
  timestamp: true               # タイムスタンプ付与
  
  # 出力先設定
  console:
    enabled: true               # コンソール出力有効
    colorize: true              # 色付け有効
    format: "text"              # コンソール用フォーマット
  
  file:
    enabled: true               # ファイル出力有効
    filename: "logs/server.log" # ログファイルパス
    maxSize: "10mb"             # 最大ファイルサイズ
    maxFiles: 5                 # 保持ファイル数
    datePattern: "YYYY-MM-DD"   # 日付パターン
    zippedArchive: true         # 古いファイルの圧縮
  
  # エラーログ分離
  errorFile:
    enabled: true               # エラーログ分離有効
    filename: "logs/error.log"  # エラーログファイル
    level: "error"              # エラーレベル以上
  
  # 詳細ログ設定
  categories:
    server: "info"              # サーバー関連
    vrchat: "info"              # VRChat監視関連
    websocket: "info"           # WebSocket関連
    messages: "debug"           # メッセージ処理関連

# 機能有効/無効設定
features:
  webUI: true                   # Web管理UI有効
  healthCheck: true             # ヘルスチェック有効
  metrics: true                 # メトリクス収集有効
  authentication: false         # 認証機能（無効）
  rateLimit: false              # レート制限（無効）
  
  # VRChat監視機能詳細
  vrchatMonitoring:
    processDetection: true      # プロセス検知
    directoryWatching: true     # ディレクトリ監視
    fileWatching: true          # ファイル監視
    statusNotification: true    # 状態通知

# パフォーマンス設定
performance:
  # メモリ制限
  memory:
    maxHeapSize: "128m"         # 最大ヒープサイズ
    gcThreshold: 0.8            # GC実行閾値
  
  # 処理制限
  processing:
    maxConcurrentTasks: 10      # 最大同時タスク数
    taskTimeout: 30000          # タスクタイムアウト
    messageQueueSize: 1000      # メッセージキューサイズ
  
  # ファイル監視最適化
  fileWatching:
    stabilityThreshold: 100     # ファイル安定判定時間
    pollInterval: 100           # ポーリング間隔
    useNativeEvents: true       # ネイティブイベント使用

# ヘルスチェック設定
healthCheck:
  enabled: true                 # ヘルスチェック有効
  endpoint: "/health"           # エンドポイントパス
  interval: 30000               # チェック間隔
  timeout: 5000                 # チェックタイムアウト
  
  # チェック項目
  checks:
    memoryUsage: true           # メモリ使用量チェック
    vrchatProcess: true         # VRChatプロセスチェック
    logDirectory: true          # ログディレクトリチェック
    websocketServer: true       # WebSocketサーバーチェック
  
  # しきい値
  thresholds:
    memoryUsagePercent: 90      # メモリ使用率警告値
    responseTimeMs: 1000        # 応答時間警告値

# Web UI設定
webUI:
  enabled: true                 # Web UI有効
  path: "/admin"               # アクセスパス
  staticFiles: "web-ui/dist"   # 静的ファイルパス
  
  # 開発モード設定
  development:
    hotReload: false            # ホットリロード（通常無効）
    devServer: false            # 開発サーバー併用

# API設定
api:
  enabled: true                 # REST API有効
  basePath: "/api"             # APIベースパス
  version: "v1"                # APIバージョン
  
  # レスポンス設定
  response:
    includeTimestamp: true      # タイムスタンプ含む
    includeVersion: true        # バージョン情報含む
    prettyJson: false           # 整形JSON（無効）

# 開発・デバッグ設定
debug:
  enabled: false                # デバッグモード無効
  verboseLogging: false         # 詳細ログ無効
  showStackTrace: false         # スタックトレース表示無効
  
  # 開発用機能
  development:
    mockVRChat: false           # VRChatモック機能
    simulateLogFiles: false     # ログファイルシミュレート
    debugWebSocket: false       # WebSocketデバッグ

# メトリクス・統計設定
metrics:
  enabled: true                 # メトリクス収集有効
  collectInterval: 60000        # 収集間隔（1分）
  retentionPeriod: 86400000     # 保持期間（1日）
  
  # 収集項目
  collect:
    systemMetrics: true         # システムメトリクス
    applicationMetrics: true    # アプリケーションメトリクス
    vrchatMetrics: true         # VRChat関連メトリクス
    clientMetrics: true         # クライアント関連メトリクス
  
  # エクスポート設定
  export:
    prometheus: false           # Prometheus形式エクスポート
    json: true                  # JSON形式エクスポート
    endpoint: "/metrics"        # メトリクスエンドポイント
```

## 🔧 development.yaml - 開発環境設定

```yaml
# 開発環境特有の設定オーバーライド

# ログレベルを詳細に
logging:
  level: "debug"
  console:
    colorize: true
    format: "text"
  categories:
    server: "debug"
    vrchat: "debug" 
    websocket: "debug"
    messages: "debug"

# デバッグ機能有効
debug:
  enabled: true
  verboseLogging: true
  showStackTrace: true
  development:
    mockVRChat: false           # 必要時に有効化
    simulateLogFiles: false     # 必要時に有効化
    debugWebSocket: true

# パフォーマンス制限緩和
performance:
  processing:
    maxConcurrentTasks: 5       # 開発環境では制限
    taskTimeout: 60000          # タイムアウト延長

# ヘルスチェック頻度増加
healthCheck:
  interval: 15000               # 15秒間隔
  
# Web UI開発設定
webUI:
  development:
    hotReload: true             # 開発時有効
    devServer: false

# メトリクス設定調整
metrics:
  collectInterval: 30000        # 30秒間隔（開発時）
  retentionPeriod: 3600000      # 1時間保持
```

## 🚀 production.yaml - 本番環境設定

```yaml
# 本番環境特有の設定オーバーライド

# ログレベルを最適化
logging:
  level: "info"
  console:
    enabled: false              # コンソール出力無効
  file:
    maxSize: "50mb"             # ログファイルサイズ増加
    maxFiles: 10                # 保持ファイル数増加
  categories:
    messages: "info"            # メッセージログ軽減

# パフォーマンス最適化
performance:
  memory:
    maxHeapSize: "256m"         # ヒープサイズ増加
  processing:
    maxConcurrentTasks: 20      # 同時タスク数増加
    messageQueueSize: 2000      # キューサイズ増加

# WebSocket最適化
websocket:
  maxClients: 100               # 接続数増加
  distributionBatch:
    batchSize: 20               # バッチサイズ増加
    batchTimeout: 25            # タイムアウト短縮

# メトリクス設定
metrics:
  collectInterval: 300000       # 5分間隔
  retentionPeriod: 604800000    # 1週間保持
  export:
    prometheus: true            # Prometheus有効

# ヘルスチェック設定
healthCheck:
  interval: 60000               # 1分間隔
  thresholds:
    memoryUsagePercent: 85      # メモリ使用率閾値下げ

# デバッグ機能無効
debug:
  enabled: false
  verboseLogging: false
  showStackTrace: false
```

## 🏠 local.yaml - ローカル固有設定例

```yaml
# ローカル環境特有の設定
# このファイルは .gitignore に含める

# カスタムログディレクトリ（開発者固有）
vrchat:
  logDirectory: "C:\\Users\\Developer\\AppData\\LocalLow\\VRChat\\VRChat"

# カスタムポート（ポート競合回避）
server:
  port: 3001
websocket:
  port: 8081

# 開発用機能
debug:
  development:
    mockVRChat: true            # VRChat未起動時のテスト用
    simulateLogFiles: true      # ログファイルシミュレート

# テスト用ログレベル
logging:
  level: "debug"
  categories:
    vrchat: "debug"
    messages: "debug"
```

## 🔧 設定管理クラス実装

### ConfigManager クラス

```typescript
import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs-extra';

class ConfigManager {
  private config: ServerConfig;
  private configDir: string;
  private environment: string;
  
  constructor(configDir = './config', environment = process.env.NODE_ENV || 'development') {
    this.configDir = configDir;
    this.environment = environment;
    this.config = this.loadConfig();
  }
  
  private loadConfig(): ServerConfig {
    // 1. デフォルト設定読み込み
    const defaultConfig = this.loadYamlFile('default.yaml');
    
    // 2. 環境別設定読み込み
    const envConfig = this.loadYamlFile(`${this.environment}.yaml`);
    
    // 3. ローカル設定読み込み（存在する場合）
    const localConfig = this.loadYamlFile('local.yaml', true);
    
    // 4. 環境変数オーバーライド
    const envOverrides = this.loadEnvironmentOverrides();
    
    // 5. 設定マージ
    const merged = this.mergeConfigs([
      defaultConfig,
      envConfig,
      localConfig,
      envOverrides
    ]);
    
    // 6. 設定検証
    this.validateConfig(merged);
    
    return merged;
  }
  
  private loadYamlFile(filename: string, optional = false): Partial<ServerConfig> {
    const filePath = path.join(this.configDir, filename);
    
    try {
      if (!fs.existsSync(filePath)) {
        if (optional) {
          return {};
        }
        throw new Error(`Required config file not found: ${filePath}`);
      }
      
      const content = fs.readFileSync(filePath, 'utf8');
      return yaml.load(content) as Partial<ServerConfig>;
    } catch (error) {
      if (optional) {
        console.warn(`Optional config file failed to load: ${filename}`);
        return {};
      }
      throw new Error(`Failed to load config file ${filename}: ${error.message}`);
    }
  }
  
  private loadEnvironmentOverrides(): Partial<ServerConfig> {
    const overrides: any = {};
    
    // 環境変数のマッピング
    const envMappings = {
      'VRCHAT_LOG_SERVER_PORT': 'server.port',
      'VRCHAT_LOG_SERVER_HOST': 'server.host',
      'VRCHAT_LOG_WS_PORT': 'websocket.port',
      'VRCHAT_LOG_WS_HOST': 'websocket.host',
      'VRCHAT_LOG_DIRECTORY': 'vrchat.logDirectory',
      'VRCHAT_LOG_LEVEL': 'logging.level',
      'VRCHAT_LOG_MAX_CLIENTS': 'websocket.maxClients'
    };
    
    for (const [envVar, configPath] of Object.entries(envMappings)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        this.setNestedProperty(overrides, configPath, this.parseEnvValue(value));
      }
    }
    
    return overrides;
  }
  
  private parseEnvValue(value: string): any {
    // ブール値
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // 数値
    if (/^\d+$/.test(value)) return parseInt(value);
    if (/^\d*\.\d+$/.test(value)) return parseFloat(value);
    
    // 文字列
    return value;
  }
  
  private setNestedProperty(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
  }
  
  private mergeConfigs(configs: Partial<ServerConfig>[]): ServerConfig {
    let result = {};
    
    for (const config of configs) {
      if (config) {
        result = this.deepMerge(result, config);
      }
    }
    
    return result as ServerConfig;
  }
  
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
  
  private validateConfig(config: ServerConfig): void {
    const errors: string[] = [];
    
    // 必須フィールドチェック
    if (!config.server?.port) {
      errors.push('server.port is required');
    }
    
    if (!config.websocket?.port) {
      errors.push('websocket.port is required');
    }
    
    // 値範囲チェック
    if (config.server.port < 1024 || config.server.port > 65535) {
      errors.push('server.port must be between 1024 and 65535');
    }
    
    if (config.websocket.maxClients < 1) {
      errors.push('websocket.maxClients must be greater than 0');
    }
    
    // ログレベルチェック
    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLogLevels.includes(config.logging.level)) {
      errors.push(`logging.level must be one of: ${validLogLevels.join(', ')}`);
    }
    
    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }
  
  // 外部API
  getConfig(): ServerConfig {
    return { ...this.config };
  }
  
  get<T>(path: string): T {
    return this.getNestedProperty(this.config, path);
  }
  
  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  // 設定リロード
  async reloadConfig(): Promise<void> {
    const newConfig = this.loadConfig();
    this.config = newConfig;
  }
}

export { ConfigManager };
```

### 使用例

```typescript
// アプリケーション起動時
const configManager = new ConfigManager('./config', process.env.NODE_ENV);
const config = configManager.getConfig();

// 個別設定取得
const logLevel = configManager.get<string>('logging.level');
const maxClients = configManager.get<number>('websocket.maxClients');

// VRChatログディレクトリ自動検出
if (!config.vrchat.logDirectory) {
  config.vrchat.logDirectory = path.join(
    process.env.LOCALAPPDATA!,
    'Low',
    'VRChat',
    'VRChat'
  );
}
```

## 🔒 設定セキュリティ

### 機密情報の取り扱い

```yaml
# 機密情報は環境変数で管理
database:
  password: "${DB_PASSWORD}"     # 環境変数参照
  apiKey: "${API_KEY}"          # 環境変数参照

# .env ファイル例（Git除外）
# DB_PASSWORD=secret123
# API_KEY=key456
```

### 設定ファイル権限

```bash
# 設定ファイルの適切な権限設定
chmod 600 config/local.yaml      # 所有者のみ読み書き
chmod 644 config/default.yaml    # 所有者書き込み、その他読み取り
```

---

この設定システムにより、開発から本番まで一貫した設定管理を実現し、環境固有の調整を柔軟に行えます。
