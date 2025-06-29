# VRChat Log Relay Server

VRChatのログファイルをリアルタイムで監視し、WebSocketを通じて外部アプリケーションにログ情報を中継するサーバーシステムです。

## 🎯 概要

VRChat Log Relay Serverは、VRChatワールドから外部アプリケーションへの間接的なデータ連携を可能にする中継サーバーです。VRChatのログファイルを監視し、リアルタイムでWebSocketクライアントに配信します。

## ✨ 主要機能

- **VRChatログ監視**: プロセス・ディレクトリ・ファイルの統合監視
- **リアルタイム配信**: WebSocketによる低遅延配信
- **メッセージ解析**: ログの構造化とフィルタリング
- **管理UI**: ブラウザベースの管理画面
- **複数クライアント対応**: 最大50の同時接続

## 🚀 クイックスタート

### 前提条件

- Node.js 20.x 以上
- Windows 10/11 (VRChat環境)

### インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd vrc-log-relay-server

# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev
```

### ビルドと実行

```bash
# TypeScriptをビルド
npm run build

# プロダクションで実行
npm start
```

## 📁 プロジェクト構造

```
src/
├── server/          # サーバーコア
├── log/             # ログ監視・解析
├── websocket/       # WebSocket通信
├── types/           # TypeScript型定義
└── utils/           # ユーティリティ
config/              # 設定ファイル
tests/               # テストファイル
project_workflow/    # プロジェクト管理ドキュメント
```

## 🛠️ 開発

```bash
# 開発モード（ホットリロード）
npm run dev

# テスト実行
npm test

# テスト（ウォッチモード）
npm run test:watch

# コードフォーマット
npm run format

# リント
npm run lint
```

## 📖 ドキュメント

詳細なドキュメントは `project_workflow/` ディレクトリを参照してください：

- [01_workflow.md](./project_workflow/01_workflow.md) - 開発ワークフロー
- [02_project_overview.md](./project_workflow/02_project_overview.md) - プロジェクト概要
- [06_api_specifications.md](./project_workflow/06_api_specifications.md) - API仕様

## 🔧 設定

設定ファイルは `config/` ディレクトリにあります：

- `default.yaml` - デフォルト設定
- `development.yaml` - 開発環境設定
- `production.yaml` - 本番環境設定

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📄 ライセンス

このプロジェクトはISCライセンスの下で公開されています。

## 🚧 開発状況

現在Phase 1（基盤実装）を進行中です。進捗は [12_task_todo.md](./project_workflow/12_task_todo.md) で確認できます。

---

**注意**: このソフトウェアはローカル環境専用です。外部ネットワークからの接続は受け付けません。
