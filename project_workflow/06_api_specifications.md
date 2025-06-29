# VRChat Log Relay Server - WebSocketプロトコル仕様

## 📡 WebSocketプロトコル概要

VRChat Log Relay Server の WebSocket API は、リアルタイムでログ情報を配信し、クライアントからの制御指示を受け付ける双方向通信プロトコルです。

### 接続情報
- **URL**: `ws://127.0.0.1:8080`
- **プロトコル**: WebSocket (RFC 6455)
- **データ形式**: JSON
- **エンコーディング**: UTF-8

### メッセージ基本形式
```typescript
interface BaseMessage {
  type: string;                    // メッセージタイプ
  data: Record<string, any>;       // ペイロードデータ
  timestamp?: number;              // タイムスタンプ（省略可）
  id?: string;                     // メッセージID（省略可）
}
```

## 🤝 接続・認証フロー

### 1. 接続確立後の挨拶 (Hello)

#### クライアント → サーバー
```json
{
  "type": "hello",
  "data": {
    "clientName": "MyVRCApp",        // クライアント識別名
    "version": "1.0.0",             // クライアントバージョン
    "capabilities": ["filtering"],   // サポート機能（省略可）
    "description": "VRC連携アプリ"   // 説明（省略可）
  }
}
```

#### サーバー → クライアント
```json
{
  "type": "welcome",
  "data": {
    "clientId": "client-12345-uuid", // サーバー発行クライアントID
    "serverVersion": "1.0.0",        // サーバーバージョン
    "connectedAt": 1719734400000,    // 接続時刻
    "capabilities": [                // サーバー機能
      "filtering",
      "status_monitoring", 
      "metrics"
    ]
  }
}
```

### 2. 接続エラー時の応答

```json
{
  "type": "error",
  "data": {
    "code": "CONNECTION_LIMIT",
    "message": "Maximum client connections reached",
    "details": {
      "maxClients": 50,
      "currentClients": 50
    }
  }
}
```

## 📊 サーバー状態・メトリクス

### 1. 現在状態の取得

#### クライアント → サーバー
```json
{
  "type": "get_status"
}
```

#### サーバー → クライアント
```json
{
  "type": "status",
  "data": {
    "uptime": 86400000,              // 稼働時間（ミリ秒）
    "connectedClients": 5,           // 接続クライアント数
    "monitoredFiles": 2,             // 監視中ログファイル数
    "messagesProcessed": 1520,       // 処理済みメッセージ数
    "messagesDistributed": 7600,     // 配信済みメッセージ数
    "lastLogTime": 1719734400000,    // 最終ログ時刻
    "memoryUsage": {
      "rss": 67108864,               // RSS メモリ（バイト）
      "heapUsed": 33554432,          // 使用ヒープ（バイト）
      "heapTotal": 50331648          // 総ヒープ（バイト）
    },
    "vrchatStatus": {
      "isRunning": true,             // VRChat実行中
      "processId": 12345,            // プロセスID
      "logDirectoryExists": true,    // ログディレクトリ存在
      "activeLogFiles": 2,           // アクティブファイル数
      "lastLogActivity": 1719734395000, // 最終ログ活動
      "detectedAt": 1719734300000    // 検知時刻
    }
  }
}
```

### 2. メトリクス取得

#### クライアント → サーバー
```json
{
  "type": "get_metrics",
  "data": {
    "timeRange": 3600000,            // 取得期間（ミリ秒、省略可）
    "includeHistory": true           // 履歴含む（省略可）
  }
}
```

#### サーバー → クライアント
```json
{
  "type": "metrics",
  "data": {
    "current": {
      "messagesPerSecond": 5.2,      // 秒間メッセージ数
      "clientConnections": 5,        // 現在接続数
      "memoryUsageMB": 64,           // メモリ使用量（MB）
      "cpuUsage": 2.1                // CPU使用率（%）
    },
    "history": [                     // 履歴データ（省略可）
      {
        "timestamp": 1719734300000,
        "messagesPerSecond": 4.8,
        "memoryUsageMB": 62
      }
    ]
  }
}
```

## 🔄 VRChat状態変更通知

### 1. VRChatプロセス状態変更

#### VRChat起動検知
```json
{
  "type": "vrchat_status_change",
  "data": {
    "changeType": "vrchat_process",
    "timestamp": 1719734400000,
    "data": {
      "isRunning": true,
      "processId": 12345,
      "previousState": false
    },
    "currentStatus": {
      "isRunning": true,
      "processId": 12345,
      "logDirectoryExists": false,
      "activeLogFiles": 0,
      "detectedAt": 1719734400000
    }
  }
}
```

#### VRChat終了検知
```json
{
  "type": "vrchat_status_change", 
  "data": {
    "changeType": "vrchat_process",
    "timestamp": 1719734400000,
    "data": {
      "isRunning": false,
      "previousState": true,
      "lastProcessId": 12345
    },
    "currentStatus": {
      "isRunning": false,
      "logDirectoryExists": true,
      "activeLogFiles": 0,
      "detectedAt": 1719734400000
    }
  }
}
```

### 2. ログディレクトリ状態変更

#### ディレクトリ作成検知
```json
{
  "type": "vrchat_status_change",
  "data": {
    "changeType": "log_directory", 
    "timestamp": 1719734405000,
    "data": {
      "exists": true,
      "path": "C:\\Users\\...\\VRChat\\VRChat",
      "previousState": false
    },
    "currentStatus": {
      "isRunning": true,
      "logDirectoryExists": true,
      "activeLogFiles": 0
    }
  }
}
```

### 3. ログファイル監視状態変更

#### 監視開始
```json
{
  "type": "vrchat_status_change",
  "data": {
    "changeType": "log_monitoring",
    "timestamp": 1719734410000,
    "data": {
      "active": true,
      "fileCount": 1,
      "files": ["output_log_2025-06-30_15-30-10.txt"],
      "previousFileCount": 0
    },
    "currentStatus": {
      "isRunning": true,
      "logDirectoryExists": true,
      "activeLogFiles": 1
    }
  }
}
```

#### ファイル追加（ローテーション）
```json
{
  "type": "vrchat_status_change",
  "data": {
    "changeType": "log_monitoring",
    "timestamp": 1719734500000,
    "data": {
      "active": true,
      "fileCount": 2,
      "files": [
        "output_log_2025-06-30_15-30-10.txt",
        "output_log_2025-06-30_15-31-45.txt"
      ],
      "addedFiles": ["output_log_2025-06-30_15-31-45.txt"]
    }
  }
}
```

## 📝 ログメッセージ配信

### 1. ログメッセージ形式

#### 基本メッセージ
```json
{
  "type": "log_message",
  "data": {
    "id": "msg-12345-uuid",          // メッセージID
    "timestamp": 1719734400000,      // 処理時刻
    "source": "vrchat",              // ソース: vrchat | udon | system
    "level": "info",                 // レベル: debug | info | warning | error | exception
    "raw": "2025.6.30 15:30:15 Log - [Network] Attempting to connect to instance",
    "parsed": {                      // 解析済みデータ（省略可）
      "type": "world_change",
      "data": {
        "action": "connecting",
        "target": "instance"
      }
    },
    "metadata": {
      "filePath": "C:\\...\\output_log_2025-06-30_15-30-10.txt",
      "fileIndex": 0,
      "lineNumber": 1234,
      "originalTimestamp": "2025.6.30 15:30:15"
    }
  }
}
```

### 2. Udonログの例

#### プレイヤー参加イベント
```json
{
  "type": "log_message",
  "data": {
    "id": "msg-udon-001",
    "timestamp": 1719734400000,
    "source": "udon",
    "level": "info",
    "raw": "[UdonBehaviour] PlayerTracker: Player joined - Alice",
    "parsed": {
      "type": "udon_event",
      "data": {
        "objectName": "PlayerTracker",
        "eventType": "player_joined",
        "playerName": "Alice",
        "customData": {}
      }
    },
    "metadata": {
      "filePath": "C:\\...\\output_log_2025-06-30_15-30-10.txt",
      "fileIndex": 0,
      "lineNumber": 1235
    }
  }
}
```

#### カスタムUdonイベント
```json
{
  "type": "log_message", 
  "data": {
    "id": "msg-udon-002",
    "timestamp": 1719734405000,
    "source": "udon",
    "level": "info", 
    "raw": "[UdonBehaviour] GameManager.OnGameStart({\"players\": 4, \"mode\": \"battle\"})",
    "parsed": {
      "type": "udon_event",
      "data": {
        "objectName": "GameManager",
        "methodName": "OnGameStart",
        "parameters": [
          {
            "players": 4,
            "mode": "battle"
          }
        ]
      }
    }
  }
}
```

### 3. VRChatシステムログの例

#### ワールド変更
```json
{
  "type": "log_message",
  "data": {
    "source": "vrchat",
    "level": "info",
    "raw": "2025.6.30 15:32:10 Log - [Network] Successfully joined instance wrld_xxx",
    "parsed": {
      "type": "world_change", 
      "data": {
        "action": "joined",
        "worldId": "wrld_xxx",
        "instanceId": "inst_yyy"
      }
    }
  }
}
```

## 🔍 フィルタリング機能

### 1. フィルター追加

#### レベルフィルター
```json
{
  "type": "add_filter",
  "data": {
    "id": "level-filter-errors",     // ユニークID
    "type": "level",                 // フィルタータイプ
    "condition": {
      "operator": "in",              // 条件演算子
      "value": ["error", "warning"]  // 対象値
    },
    "description": "エラーと警告のみ"  // 説明（省略可）
  }
}
```

#### ソースフィルター
```json
{
  "type": "add_filter",
  "data": {
    "id": "source-filter-udon",
    "type": "source", 
    "condition": {
      "operator": "equals",
      "value": "udon"
    }
  }
}
```

#### 内容フィルター
```json
{
  "type": "add_filter",
  "data": {
    "id": "content-filter-player",
    "type": "content",
    "condition": {
      "operator": "contains",
      "value": "Player",
      "caseSensitive": false
    }
  }
}
```

#### 正規表現フィルター
```json
{
  "type": "add_filter",
  "data": {
    "id": "regex-filter-events",
    "type": "regex",
    "condition": {
      "operator": "regex", 
      "value": "Player\\s+(joined|left)",
      "caseSensitive": false
    }
  }
}
```

### 2. フィルター削除

```json
{
  "type": "remove_filter",
  "data": {
    "id": "level-filter-errors"      // 削除対象フィルターID
  }
}
```

### 3. フィルター一覧取得

#### クライアント → サーバー
```json
{
  "type": "get_filters"
}
```

#### サーバー → クライアント
```json
{
  "type": "filters",
  "data": {
    "filters": [
      {
        "id": "level-filter-errors",
        "type": "level",
        "condition": {
          "operator": "in",
          "value": ["error", "warning"]
        },
        "createdAt": 1719734400000
      }
    ]
  }
}
```

### 4. フィルター応答

#### 成功
```json
{
  "type": "filter_response",
  "data": {
    "action": "add",                 // add | remove | get
    "success": true,
    "filterId": "level-filter-errors"
  }
}
```

#### エラー
```json
{
  "type": "filter_response",
  "data": {
    "action": "add",
    "success": false,
    "error": {
      "code": "INVALID_FILTER",
      "message": "Invalid filter condition",
      "details": {
        "field": "condition.value",
        "reason": "must be an array for 'in' operator"
      }
    }
  }
}
```

## 🎛️ 接続管理・制御

### 1. 接続クライアント一覧取得

#### クライアント → サーバー
```json
{
  "type": "get_clients"
}
```

#### サーバー → クライアント
```json
{
  "type": "clients",
  "data": {
    "clients": [
      {
        "id": "client-12345",
        "name": "MyVRCApp",
        "connectedAt": 1719734400000,
        "lastSeen": 1719734500000,
        "messagesSent": 150,
        "filtersCount": 2,
        "isAlive": true
      }
    ],
    "totalCount": 5
  }
}
```

### 2. Ping/Pong (生存確認)

#### サーバー → クライアント (Ping)
```json
{
  "type": "ping",
  "data": {
    "timestamp": 1719734400000
  }
}
```

#### クライアント → サーバー (Pong)
```json
{
  "type": "pong",
  "data": {
    "timestamp": 1719734400000      // 受信したpingのタイムスタンプ
  }
}
```

### 3. 接続終了通知

#### サーバー → クライアント
```json
{
  "type": "disconnect",
  "data": {
    "reason": "SERVER_SHUTDOWN",    // 理由コード
    "message": "Server is shutting down",
    "gracePeriod": 5000            // 猶予時間（ミリ秒）
  }
}
```

## ❌ エラーハンドリング

### エラーメッセージ形式
```json
{
  "type": "error",
  "data": {
    "code": "ERROR_CODE",           // エラーコード
    "message": "Human readable message",
    "details": {                    // 詳細情報（省略可）
      "field": "invalid_field",
      "value": "invalid_value"
    },
    "timestamp": 1719734400000,
    "requestId": "req-123"          // 関連リクエストID（省略可）
  }
}
```

### 主要エラーコード

| コード | 説明 | 対処法 |
|--------|------|--------|
| `CONNECTION_LIMIT` | 最大接続数超過 | 接続数を確認し、再試行 |
| `INVALID_MESSAGE` | 不正なメッセージ形式 | JSON形式・必須フィールドを確認 |
| `INVALID_FILTER` | 不正なフィルター設定 | フィルター条件を修正 |
| `FILTER_NOT_FOUND` | フィルターが見つからない | フィルターIDを確認 |
| `SERVER_ERROR` | サーバー内部エラー | サーバーログを確認 |
| `VRCHAT_NOT_RUNNING` | VRChat未起動 | VRChatを起動 |
| `LOG_DIRECTORY_NOT_FOUND` | ログディレクトリなし | VRChatの再起動 |

## 🔄 実装例

### JavaScript/TypeScript クライアント例

```typescript
class VRChatLogClient {
  private ws: WebSocket;
  private clientName: string;
  
  constructor(clientName: string) {
    this.clientName = clientName;
    this.ws = new WebSocket('ws://127.0.0.1:8080');
    this.setupEventHandlers();
  }
  
  private setupEventHandlers() {
    this.ws.onopen = () => {
      // 接続時の挨拶
      this.send({
        type: 'hello',
        data: {
          clientName: this.clientName,
          version: '1.0.0'
        }
      });
    };
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    this.ws.onclose = () => {
      console.log('Connection closed');
    };
  }
  
  private handleMessage(message: any) {
    switch (message.type) {
      case 'welcome':
        console.log('Connected:', message.data.clientId);
        this.requestStatus();
        break;
        
      case 'log_message':
        this.handleLogMessage(message.data);
        break;
        
      case 'vrchat_status_change':
        this.handleStatusChange(message.data);
        break;
        
      case 'ping':
        this.send({ type: 'pong', data: message.data });
        break;
    }
  }
  
  private send(message: any) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
  
  // フィルター追加
  addLevelFilter(levels: string[]) {
    this.send({
      type: 'add_filter',
      data: {
        id: `level-filter-${Date.now()}`,
        type: 'level',
        condition: {
          operator: 'in',
          value: levels
        }
      }
    });
  }
  
  // ステータス取得
  requestStatus() {
    this.send({ type: 'get_status' });
  }
}

// 使用例
const client = new VRChatLogClient('MyVRCApp');
client.addLevelFilter(['error', 'warning']);
```

---

このWebSocketプロトコルにより、クライアントアプリケーションは VRChat の状態をリアルタイムで監視し、必要なログ情報のみを効率的に取得できます。
