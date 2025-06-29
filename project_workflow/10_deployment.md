# VRChat Log Relay Server - デプロイメント・運用ガイド

## 🚀 デプロイメント概要

VRChat Log Relay Server は主にローカル環境での使用を想定していますが、複数の配布・運用方法を提供しています。

### デプロイメント方式
1. **開発環境** - npm スクリプトによる直接実行
2. **ローカル配布** - PKG による実行ファイル化
3. **サービス化** - PM2 によるバックグラウンド実行
4. **Docker化** - コンテナによる配布（オプション）

## 🔧 開発環境でのセットアップ

### 前提条件
- **Node.js**: 22.x 以上
- **npm**: 10.x 以上
- **Windows**: 10/11 (VRChat対応OS)
- **メモリ**: 最低 512MB 空き容量
- **ストレージ**: 100MB 空き容量

### 初期セットアップ

```bash
# 1. リポジトリクローン
git clone <repository-url>
cd vrchat-log-relay-server

# 2. 依存関係インストール
npm install

# 3. TypeScript設定確認
npx tsc --noEmit

# 4. 設定ファイル準備
cp config/default.yaml config/local.yaml
# config/local.yaml を環境に合わせて編集

# 5. ログディレクトリ作成
mkdir -p logs

# 6. 開発サーバー起動
npm run dev
```

### 開発コマンド

```bash
# 開発モード（ホットリロード）
npm run dev

# ビルド
npm run build

# 本番モード実行
npm start

# テスト実行
npm test
npm run test:watch

# コード品質チェック
npm run lint
npm run format

# 型チェック
npm run type-check
```

### 開発環境の設定

**package.json scripts**
```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc && npm run build:web-ui",
    "build:web-ui": "cd web-ui && npm run build",
    "start": "node dist/index.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "format": "prettier --write src/**/*.ts",
    "type-check": "tsc --noEmit",
    "clean": "rimraf dist logs/*"
  }
}
```

## 📦 実行ファイル化（PKG）

### PKG設定

**pkg.config.json**
```json
{
  "name": "vrchat-log-relay-server",
  "version": "1.0.0",
  "main": "dist/index.js",
  "bin": "dist/index.js",
  "pkg": {
    "targets": [
      "node18-win-x64"
    ],
    "outputPath": "release",
    "assets": [
      "config/**/*",
      "web-ui/dist/**/*",
      "node_modules/tail/lib/**/*"
    ],
    "scripts": [
      "dist/**/*.js"
    ]
  }
}
```

### ビルド・パッケージング手順

```bash
# 1. プロジェクトビルド
npm run build

# 2. Web UI ビルド
cd web-ui
npm install
npm run build
cd ..

# 3. 実行ファイル作成
npx pkg . --targets node18-win-x64 --output release/vrchat-log-relay-server.exe

# 4. 配布パッケージ作成
mkdir release/vrchat-log-relay-server
cp release/vrchat-log-relay-server.exe release/vrchat-log-relay-server/
cp -r config release/vrchat-log-relay-server/
cp README.md release/vrchat-log-relay-server/
cp LICENSE release/vrchat-log-relay-server/

# 5. ZIP圧縮
cd release
zip -r vrchat-log-relay-server-v1.0.0.zip vrchat-log-relay-server/
```

### 配布パッケージ構成

```
vrchat-log-relay-server-v1.0.0.zip
├── vrchat-log-relay-server.exe    # メイン実行ファイル
├── config/
│   ├── default.yaml               # デフォルト設定
│   └── local.yaml.example         # 設定例
├── README.md                      # 使用説明書
├── LICENSE                        # ライセンス
└── start.bat                      # 起動バッチファイル
```

### 起動バッチファイル

**start.bat**
```batch
@echo off
title VRChat Log Relay Server

echo Starting VRChat Log Relay Server...
echo.

REM 設定ファイル確認
if not exist "config\local.yaml" (
    echo Creating local configuration...
    copy "config\default.yaml" "config\local.yaml"
    echo Please edit config\local.yaml if needed.
    echo.
)

REM ログディレクトリ作成
if not exist "logs" mkdir logs

REM サーバー起動
echo Server starting on http://127.0.0.1:3000
echo WebSocket server on ws://127.0.0.1:8080
echo Admin UI: http://127.0.0.1:3000/admin
echo.
echo Press Ctrl+C to stop the server.
echo.

vrchat-log-relay-server.exe

echo.
echo Server stopped.
pause
```

## 🔄 PM2によるサービス化

### PM2設定

**ecosystem.config.js**
```javascript
module.exports = {
  apps: [{
    name: 'vrchat-log-relay-server',
    script: 'dist/index.js',
    
    // 実行環境
    cwd: './vrchat-log-relay-server',
    node_args: '--max-old-space-size=256',
    
    // PM2設定
    instances: 1,                    // シングルインスタンス
    exec_mode: 'fork',               // フォークモード
    
    // 自動再起動設定
    watch: false,                    // ファイル監視無効
    autorestart: true,               // 自動再起動有効
    max_restarts: 10,                # 最大再起動回数
    min_uptime: '10s',               # 最小稼働時間
    restart_delay: 4000,             // 再起動遅延
    
    // ログ設定
    log_file: 'logs/pm2-combined.log',
    out_file: 'logs/pm2-out.log',
    error_file: 'logs/pm2-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // 環境変数
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      WS_PORT: 8080
    },
    
    // 開発環境
    env_development: {
      NODE_ENV: 'development',
      PORT: 3001,
      WS_PORT: 8081
    }
  }]
};
```

### PM2操作コマンド

```bash
# PM2インストール
npm install -g pm2

# アプリケーション起動
pm2 start ecosystem.config.js

# 状態確認
pm2 status
pm2 list

# ログ確認
pm2 logs vrchat-log-relay-server
pm2 logs --lines 100

# アプリケーション停止
pm2 stop vrchat-log-relay-server

# アプリケーション再起動
pm2 restart vrchat-log-relay-server

# アプリケーション削除
pm2 delete vrchat-log-relay-server

# PM2自動起動設定（Windows）
pm2 startup
pm2 save

# プロセス監視
pm2 monit
```

### Windows サービス化

**pm2-windows-service.xml**
```xml
<service>
  <id>VRChatLogRelayServer</id>
  <name>VRChat Log Relay Server</name>
  <description>VRChat ログ中継サーバー</description>
  
  <executable>node</executable>
  <arguments>C:\pm2\pm2.js start C:\vrchat-log-relay-server\ecosystem.config.js</arguments>
  
  <workingdirectory>C:\vrchat-log-relay-server</workingdirectory>
  
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="20 sec"/>
  <onfailure action="none"/>
  
  <resetfailure>1 hour</resetfailure>
</service>
```

## 🐳 Docker化（オプション）

### Dockerfile

```dockerfile
# マルチステージビルド
FROM node:18-alpine AS builder

WORKDIR /app

# パッケージファイルコピー
COPY package*.json ./
COPY web-ui/package*.json ./web-ui/

# 依存関係インストール
RUN npm ci --only=production
RUN cd web-ui && npm ci --only=production

# ソースコードコピー
COPY . .

# ビルド実行
RUN npm run build

# プロダクション イメージ
FROM node:18-alpine

# 必要パッケージインストール
RUN apk add --no-cache tini

WORKDIR /app

# ビルド結果コピー
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web-ui/dist ./web-ui/dist
COPY --from=builder /app/config ./config
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# 非rootユーザー作成
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# 権限設定
RUN chown -R nodejs:nodejs /app
USER nodejs

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/healthcheck.js

# ポート公開
EXPOSE 3000 8080

# 起動設定
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  vrchat-log-relay-server:
    build: .
    container_name: vrchat-log-relay-server
    
    ports:
      - "3000:3000"
      - "8080:8080"
    
    volumes:
      - ./config/local.yaml:/app/config/local.yaml:ro
      - ./logs:/app/logs
      - vrchat-logs:/vrchat-logs:ro    # VRChatログディレクトリ
    
    environment:
      - NODE_ENV=production
      - VRCHAT_LOG_DIRECTORY=/vrchat-logs
    
    restart: unless-stopped
    
    healthcheck:
      test: ["CMD", "node", "dist/healthcheck.js"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  vrchat-logs:
    driver: local
    driver_opts:
      type: bind
      o: bind
      device: "C:/Users/${USERNAME}/AppData/LocalLow/VRChat/VRChat"
```

## 📊 監視・ヘルスチェック

### ヘルスチェックスクリプト

**src/healthcheck.ts**
```typescript
import http from 'http';

async function healthCheck(): Promise<void> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: '/health',
      method: 'GET',
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve();
      } else {
        reject(new Error(`Health check failed: ${res.statusCode}`));
      }
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Health check timeout'));
    });
    
    req.end();
  });
}

// スクリプト実行時
if (require.main === module) {
  healthCheck()
    .then(() => {
      console.log('Health check passed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Health check failed:', error.message);
      process.exit(1);
    });
}
```

### 監視スクリプト

**scripts/monitor.ps1**
```powershell
# VRChat Log Relay Server 監視スクリプト

param(
    [string]$ServerUrl = "http://127.0.0.1:3000",
    [int]$CheckInterval = 60,
    [string]$LogFile = "logs/monitor.log"
)

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $LogFile -Value $logMessage
}

function Test-ServerHealth {
    try {
        $response = Invoke-RestMethod -Uri "$ServerUrl/health" -TimeoutSec 10
        if ($response.status -eq "healthy") {
            return $true
        } else {
            Write-Log "Server unhealthy: $($response.status)"
            return $false
        }
    } catch {
        Write-Log "Health check failed: $($_.Exception.Message)"
        return $false
    }
}

function Test-VRChatProcess {
    $process = Get-Process -Name "VRChat" -ErrorAction SilentlyContinue
    return $process -ne $null
}

Write-Log "Starting VRChat Log Relay Server monitoring"

while ($true) {
    $serverHealthy = Test-ServerHealth
    $vrchatRunning = Test-VRChatProcess
    
    $status = @{
        Server = if ($serverHealthy) { "Healthy" } else { "Unhealthy" }
        VRChat = if ($vrchatRunning) { "Running" } else { "Not Running" }
    }
    
    Write-Log "Status - Server: $($status.Server), VRChat: $($status.VRChat)"
    
    # 異常検知時のアクション
    if (-not $serverHealthy) {
        Write-Log "Server health check failed - attempting restart"
        # PM2再起動など
        # pm2 restart vrchat-log-relay-server
    }
    
    Start-Sleep -Seconds $CheckInterval
}
```

## 🔧 トラブルシューティング

### よくある問題と解決方法

#### 1. VRChat プロセス検知失敗

**症状**: ログに "VRChat process not detected" が表示される

**原因・解決方法**:
```bash
# 管理者権限で実行されているか確認
# VRChatが実際に起動しているか確認
tasklist | findstr VRChat

# 手動でプロセス検知テスト
wmic process where "name='VRChat.exe'" get ProcessId /format:value
```

#### 2. ログディレクトリが見つからない

**症状**: "Log directory not found" エラー

**解決方法**:
```bash
# VRChatログディレクトリの確認
echo %LOCALAPPDATA%\Low\VRChat\VRChat

# 手動でディレクトリ指定
# config/local.yaml に以下を追加
vrchat:
  logDirectory: "C:\\Users\\YourName\\AppData\\LocalLow\\VRChat\\VRChat"
```

#### 3. WebSocket接続エラー

**症状**: クライアントから接続できない

**解決方法**:
```bash
# ポート使用状況確認
netstat -an | findstr :8080

# ファイアウォール設定確認
# Windows Defender ファイアウォールで8080ポートを許可

# 手動接続テスト
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: test" -H "Sec-WebSocket-Version: 13" http://127.0.0.1:8080
```

#### 4. メモリ使用量が多い

**症状**: メモリ使用量が128MBを超える

**解決方法**:
```javascript
// Node.js起動時のメモリ制限
node --max-old-space-size=128 dist/index.js

// config/local.yaml で設定調整
performance:
  memory:
    maxHeapSize: "96m"
  processing:
    messageQueueSize: 500
```

### ログファイル確認

```bash
# サーバーログ確認
tail -f logs/server.log

# エラーログ確認
tail -f logs/error.log

# PM2ログ確認
pm2 logs vrchat-log-relay-server --lines 100
```

### デバッグモード

```bash
# デバッグモードで起動
NODE_ENV=development DEBUG=* npm run dev

# 詳細ログ有効
# config/local.yaml
debug:
  enabled: true
  verboseLogging: true
  showStackTrace: true
```

## 📈 パフォーマンス最適化

### 本番環境での推奨設定

```yaml
# config/production.yaml
performance:
  memory:
    maxHeapSize: "256m"
  processing:
    maxConcurrentTasks: 20
    messageQueueSize: 2000
  fileWatching:
    stabilityThreshold: 50
    pollInterval: 50

websocket:
  maxClients: 100
  distributionBatch:
    batchSize: 20
    batchTimeout: 25

logging:
  level: "info"
  file:
    maxSize: "50mb"
    maxFiles: 10
```

### システムリソース監視

```powershell
# リソース使用量監視スクリプト
Get-Process "node" | Select-Object ProcessName, Id, CPU, WorkingSet, VirtualMemorySize
```

---

このデプロイメントガイドにより、開発環境から本番運用まで、様々な環境でVRChat Log Relay Serverを適切に運用できます。
