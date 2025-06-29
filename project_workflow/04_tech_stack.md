# VRChat Log Relay Server - 技術スタック

## 🛠️ 技術選択一覧

### バックエンド技術

#### Runtime & Language
| 技術 | バージョン | 用途 | 選択理由 |
|------|-----------|------|----------|
| **Node.js** | 22.x | JavaScript実行環境 | 非同期I/O、ファイル監視に最適 |
| **TypeScript** | 5.x | 開発言語 | 型安全性、開発効率、保守性 |

#### Core Framework & Libraries
| 技術 | バージョン | 用途 | 選択理由 |
|------|-----------|------|----------|
| **Express.js** | 4.x | HTTPサーバーフレームワーク | 軽量、成熟、豊富なミドルウェア |
| **ws** | 8.x | WebSocket実装 | 軽量、高性能、標準的 |

#### ファイル監視・ログ処理
| 技術 | バージョン | 用途 | 選択理由 |
|------|-----------|------|----------|
| **chokidar** | 4.x | ファイル・ディレクトリ監視 | クロスプラットフォーム、高性能 |
| **tail** | 2.x | ログファイル追従 | ファイルローテーション対応 |

#### 設定・ログ管理
| 技術 | バージョン | 用途 | 選択理由 |
|------|-----------|------|----------|
| **dotenv** | 16.x | 環境変数管理 | 設定の外部化 |
| **js-yaml** | 4.x | YAML設定ファイル | 人間が読みやすい設定形式 |
| **winston** | 3.x | ログ管理 | 豊富な出力先、ログレベル管理 |

#### テスト・品質管理
| 技術 | バージョン | 用途 | 選択理由 |
|------|-----------|------|----------|
| **Jest** | 29.x | テストフレームワーク | TypeScript対応、豊富な機能 |
| **ESLint** | 8.x | コード品質チェック | TypeScript対応、カスタマイズ可能 |
| **Prettier** | 3.x | コードフォーマッター | 一貫したコードスタイル |

### フロントエンド技術 (管理UI)

#### Framework & Build Tools
| 技術 | バージョン | 用途 | 選択理由 |
|------|-----------|------|----------|
| **React** | 18.x | UIフレームワーク | コンポーネント指向、豊富なエコシステム |
| **TypeScript** | 5.x | 開発言語 | バックエンドとの型共有 |
| **Vite** | 5.x | ビルドツール | 高速ビルド、HMR |

#### UI & スタイリング
| 技術 | バージョン | 用途 | 選択理由 |
|------|-----------|------|----------|
| **Material-UI** または **Tailwind CSS** | 最新 | UIコンポーネント | 迅速なUI構築 |

### 運用・開発ツール

#### 開発ツール
| 技術 | バージョン | 用途 | 選択理由 |
|------|-----------|------|----------|
| **npm** | 最新 | パッケージ管理 | Node.js標準、依存関係管理 |
| **ts-jest** | 最新 | TypeScriptテスト | Jest + TypeScript統合 |

#### 運用ツール
| 技術 | バージョン | 用途 | 選択理由 |
|------|-----------|------|----------|
| **PM2** | 最新 | プロセス管理 | 自動再起動、ログ管理 |
| **pkg** | 最新 | 実行ファイル化 | Node.jsアプリの配布 |

## 🎯 技術選択の詳細理由

### Node.js 選択理由

#### ✅ メリット
- **非同期I/O**: ファイル監視とWebSocket配信の並行処理に最適
- **イベント駆動**: VRChatプロセス監視、ファイル変更検知に適している
- **豊富なライブラリ**: ファイル監視 (chokidar)、WebSocket (ws) の成熟したライブラリ
- **クロスプラットフォーム**: Windows、Mac、Linux対応
- **軽量**: メモリ使用量が少ない
- **開発効率**: JavaScriptの開発しやすさ

#### ⚠️ 注意点
- **CPU集約的処理**: 大量のログ解析には向かない（本プロジェクトは問題なし）
- **シングルスレッド**: ブロッキング処理の影響（適切な非同期化で回避）

### TypeScript 選択理由

#### ✅ メリット
```typescript
// 型安全な設定管理
interface ServerConfig {
  server: {
    port: number;
    host: string;
  };
  vrchat: {
    logDirectory?: string;
    groupPeriod: number;
  };
}

// コンパイル時エラー検出
const config: ServerConfig = {
  server: {
    port: "3000", // ❌ Type 'string' is not assignable to type 'number'
    host: "127.0.0.1"
  }
};
```

- **開発時エラー検出**: コンパイル時に型エラーを検出
- **IntelliSense**: IDEでの補完、リファクタリング支援
- **保守性**: 大規模なコードベースでも安全な変更
- **ドキュメント効果**: 型定義自体がドキュメントとして機能

### WebSocket (ws) 選択理由

#### ✅ リアルタイム通信の要件
```javascript
// 従来のHTTPポーリング (非効率)
setInterval(() => {
  fetch('/api/logs/latest')
    .then(response => response.json())
    .then(logs => updateUI(logs));
}, 1000); // 1秒間隔のポーリング

// WebSocketでのリアルタイム配信 (効率的)
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'log_message') {
    updateUI(message.data); // 即座に更新
  }
};
```

- **低遅延**: HTTPリクエスト/レスポンスサイクル不要
- **双方向通信**: クライアントからのフィルター設定、ステータス取得
- **効率性**: 継続的な接続でオーバーヘッド削減
- **標準仕様**: あらゆるクライアント環境から接続可能

### chokidar (ファイル監視) 選択理由

#### ✅ 高度なファイル監視機能
```typescript
import chokidar from 'chokidar';

// VRChatログディレクトリの監視
const watcher = chokidar.watch(logDirectory, {
  ignored: /[\/\\]\./,        // 隠しファイル無視
  persistent: true,           // プロセス終了まで監視継続
  ignoreInitial: false,       // 初期ファイルも検出
  followSymlinks: false,      // シンボリックリンク無視
  depth: 1                    // 1階層のみ監視
});

watcher
  .on('add', path => console.log(`ファイル追加: ${path}`))
  .on('change', path => console.log(`ファイル変更: ${path}`))
  .on('unlink', path => console.log(`ファイル削除: ${path}`));
```

- **クロスプラットフォーム**: Windows、Mac、Linux対応
- **高性能**: ネイティブファイルシステムイベント使用
- **豊富なオプション**: ignore パターン、監視深度設定
- **安定性**: ファイルロック、一時ファイルの適切な処理

### winston (ログ管理) 選択理由

#### ✅ プロダクション対応ログ管理
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // ファイル出力
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    }),
    // コンソール出力 (開発時)
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// 使用例
logger.info('VRChat process detected', { 
  processId: 12345, 
  timestamp: Date.now() 
});
```

- **多様な出力先**: ファイル、コンソール、外部サービス
- **ログレベル管理**: debug, info, warn, error, fatal
- **構造化ログ**: JSON形式での出力
- **回転・アーカイブ**: ログファイルサイズ制限、古いファイル削除

## 🔧 開発環境セットアップ

### 必要な開発ツール

#### 1. Node.js インストール
```bash
# Windows (公式サイトまたはnvm-windows)
# バージョン確認
node --version  # v22.x.x
npm --version   # 10.x.x
```

#### 2. プロジェクト初期化
```bash
# パッケージ管理ファイル作成
npm init -y

# TypeScript環境構築
npm install -D typescript @types/node ts-node nodemon
npx tsc --init

# メイン依存関係インストール
npm install express ws chokidar tail winston dotenv js-yaml

# 開発依存関係インストール
npm install -D @types/express @types/ws jest @types/jest ts-jest eslint prettier
```

#### 3. 設定ファイル準備

**tsconfig.json**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**package.json scripts**
```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts"
  }
}
```

#### 4. 推奨VSCode拡張機能
- **TypeScript Importer**: 自動import
- **ESLint**: リアルタイムエラーチェック
- **Prettier**: 自動フォーマット
- **TypeScript Hero**: 型定義サポート
- **REST Client**: API テスト

## 🚀 パフォーマンス考慮事項

### Node.js最適化設定

#### メモリ使用量最適化
```javascript
// メモリ使用量制限（128MB想定）
const options = {
  max_old_space_size: 128,  // V8ヒープサイズ制限
  max_semi_space_size: 16   // 新領域サイズ制限
};

// 起動時のメモリ設定
node --max-old-space-size=128 dist/index.js
```

#### ファイル監視最適化
```typescript
// chokidar設定最適化
const watcherOptions = {
  usePolling: false,        // ネイティブイベント使用
  ignoreInitial: true,      // 初期スキャン省略
  atomic: 100,              // 原子操作タイムアウト
  awaitWriteFinish: {       // 書き込み完了待機
    stabilityThreshold: 100,
    pollInterval: 10
  }
};
```

### WebSocket最適化

#### 接続管理最適化
```typescript
// WebSocketサーバー最適化設定
const wsOptions = {
  perMessageDeflate: false,    // 圧縮無効（ローカル通信）
  maxPayload: 1024 * 1024,    // 1MB制限
  clientTracking: true,        // クライアント追跡有効
  skipUTF8Validation: false   // UTF-8検証有効
};
```

## 🔒 セキュリティ考慮事項

### ローカル環境セキュリティ

#### 接続制限
```typescript
// localhost のみ許可
const server = app.listen(port, '127.0.0.1', () => {
  console.log('Server bound to localhost only');
});

// WebSocket接続元検証
wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  if (clientIP !== '127.0.0.1' && clientIP !== '::1') {
    ws.close(1008, 'Unauthorized');
    return;
  }
});
```

#### ファイルアクセス制限
```typescript
// VRChatログディレクトリのみアクセス許可
const allowedPath = path.join(
  process.env.LOCALAPPDATA, 
  'Low', 
  'VRChat', 
  'VRChat'
);

function validateLogPath(filePath: string): boolean {
  const resolvedPath = path.resolve(filePath);
  return resolvedPath.startsWith(allowedPath);
}
```

---

この技術スタックにより、高性能で保守しやすい VRChat Log Relay Server を構築します。
