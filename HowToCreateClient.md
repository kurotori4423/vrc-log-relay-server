# VRChat Log Relay Server - WebSocketクライアントの作り方

このドキュメントは、VRChat Log Relay ServerからWebSocket経由でデータを受信するクライアントアプリケーションを作成する方法について説明します。

**最終更新**: 2025年6月30日（データ構造仕様変更に対応）

## 1. 接続情報

- **エンドポイントURL**: `ws://127.0.0.1:8080`
  - サーバーの設定ファイル (`config/default.yaml`) で変更可能です。
  - デフォルトでは、サーバーはローカルホスト (`127.0.0.1`) からの接続のみを許可します。

## 2. 通信のライフサイクル

クライアントとサーバーの通信は、以下の流れで行われます。

1.  **接続**: クライアントはサーバーのWebSocketエンドポイントに接続します。
2.  **ハンドシェイク**:
    - クライアントは、接続が確立したら自己紹介のために `hello` メッセージを送信します。
    - サーバーは、`hello` を受け取ると `welcome` メッセージを返信します。これでハンドシェイクは完了です。
3.  **データ受信**: サーバーはVRChatのログを監視し、新しいログが書き込まれるたびに `log_message` をクライアントに送信します。また、VRChatの起動・終了などの状態変化があった場合は `vrchat_status_change` を送信します。
4.  **任意のアクション**:
    - クライアントは `get_status` や `get_metrics` を送信して、サーバーの状態やパフォーマンス情報をいつでも取得できます。
    - `set_filter` を送信することで、受信したいログの種類を絞り込むことができます。
5.  **接続維持**: クライアントは定期的に `ping` を送信し、サーバーからの `pong` を確認することで接続を維持できます。
6.  **切断**: クライアントまたはサーバーが接続を閉じます。

## 3. データ形式

送受信されるデータは、すべて **JSON形式の文字列** です。
すべてのメッセージには、その種類を識別するための `type` プロパティが含まれています。

### サーバーから受信する主要なメッセージ

#### ログメッセージ (`log_message`)

これがクライアントが受け取るメインのデータです。VRChatのログ1行に相当します。

```json
{
  "type": "log_message",
  "data": {
    "id": "msg-1725012345-abc123def",
    "raw": {
      "timestamp": "2025-06-30T15:00:00.000Z",
      "level": "info",
      "content": "OnPlayerJoined VRCUser (usr_12345678-1234-1234-1234-123456789abc)",
      "fileName": "output_log_2025-06-30_14-30-00.txt",
      "lineNumber": 1234
    },
    "parsed": {
      "type": "user_join",
      "data": {
        "userName": "VRCUser",
        "userId": "usr_12345678-1234-1234-1234-123456789abc",
        "timestamp": 1725012345000
      }
    },
    "tags": ["level:info", "type:user_join"],
    "processedAt": "2025-06-30T15:00:00.123Z"
  },
  "timestamp": 1725012345123
}
```

- `data.id`: メッセージの一意識別子
- `data.raw`: 解析前の生ログ情報
  - `timestamp`: ログファイルに記録されたタイムスタンプ
  - `level`: ログレベル (`info`, `warning`, `error`, `debug`)
  - `content`: VRChatが出力した実際のログ内容
  - `fileName`: ログファイル名
  - `lineNumber`: ファイル内の行番号
- `data.parsed`: サーバーがログの内容を解析した結果（VRChatの特定イベントのみ）
  - `type`: イベントタイプ (`user_join`, `user_leave`, `world_change`, `other`)
  - `data`: 解析されたデータ（イベントタイプによって内容が異なる）
- `data.tags`: フィルタリング用のタグ配列
- `data.processedAt`: サーバーでの処理完了時刻

##### 解析済みデータの詳細

VRChatの特定イベントが検出された場合、`parsed` フィールドに以下の構造でデータが格納されます。

**ユーザー参加 (`user_join`)**
```json
{
  "type": "user_join",
  "data": {
    "userName": "VRCUser",
    "userId": "usr_12345678-1234-1234-1234-123456789abc",
    "timestamp": 1725012345000
  }
}
```

**ユーザー退出 (`user_leave`)**
```json
{
  "type": "user_leave",
  "data": {
    "userName": "VRCUser",
    "userId": "usr_12345678-1234-1234-1234-123456789abc",
    "timestamp": 1725012345000
  }
}
```

**ワールド変更 (`world_change`)**
```json
{
  "type": "world_change",
  "data": {
    "worldId": "wrld_12345678-1234-1234-1234-123456789abc",
    "userId": "usr_12345678-1234-1234-1234-123456789abc",
    "region": "jp",
    "instance": 12345,
    "timestamp": 1725012345000
  }
}
```

**その他のログ (`other`)**
```json
{
  "type": "other",
  "data": {
    "content": "その他のVRChatログ内容"
  }
}
```

#### VRChat状態変更通知 (`vrchat_status_change`)

VRChat.exeプロセスの起動や終了、ログディレクトリの状態変化などを通知します。

```json
{
  "type": "vrchat_status_change",
  "data": {
    "changeType": "vrchat_process",
    "timestamp": 1678886405000,
    "data": { "status": "started", "pid": 12345 },
    "currentStatus": {
      "isRunning": true,
      "processId": 12345,
      "logDirectoryExists": true,
      "activeLogFiles": 1,
      "detectedAt": 1678886405000
    }
  }
}
```

### クライアントから送信する主要なメッセージ

#### Hello (`hello`)

接続後に必ず送信します。

```json
{
  "type": "hello",
  "data": {
    "clientName": "My Awesome App",
    "version": "1.0.0",
    "description": "A simple client to display VRChat logs."
  }
}
```

#### フィルター設定 (`set_filter`)

受信するログを絞り込みたい場合に使用します。複数の条件を組み合わせてフィルタリングできます。

```json
{
  "type": "set_filter",
  "data": {
    "messageTypes": ["user_join", "user_leave"],
    "logLevel": ["info", "warning"],
    "sources": ["VRChatLog"],
    "keywords": ["VRCUser", "MyFriend"],
    "exclude": {
      "messageTypes": ["other"],
      "keywords": ["spam"]
    }
  }
}
```

主なフィルター条件：
- `messageTypes`: 解析済みメッセージタイプでフィルタ
- `logLevel`: ログレベルでフィルタ
- `sources`: ログソースでフィルタ
- `keywords`: ログ内容にキーワードが含まれるものをフィルタ
- `exclude`: 除外条件（上記と同じ形式）

## 4. 実装サンプル (JavaScript)

以下は、Node.js環境で動作するシンプルなWebSocketクライアントの実装例です。

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:8080');

ws.on('open', function open() {
  console.log('Connected to server.');

  // 1. Helloメッセージを送信
  const helloMessage = {
    type: 'hello',
    data: {
      clientName: 'SampleClient',
      version: '1.0.0'
    }
  };
  ws.send(JSON.stringify(helloMessage));
});

ws.on('message', function incoming(data) {
  try {
    const message = JSON.parse(data);
    // console.log('Received message:', message);

    // 2. メッセージタイプに応じて処理を分岐
    switch (message.type) {
      case 'welcome':
        console.log(`Server welcomed us! Client ID: ${message.data.clientId}`);
        break;

      case 'log_message':
        const logData = message.data;
        const logTime = new Date(logData.raw.timestamp).toLocaleTimeString();
        console.log(`[${logTime}] ${logData.raw.content}`);
        
        // 解析済みデータがあれば利用
        if (logData.parsed) {
          handleParsedLog(logData.parsed);
        }
        break;

      case 'vrchat_status_change':
        console.log('VRChat status changed:', message.data);
        break;
        
      case 'pong':
        // console.log('Pong received.');
        break;

      default:
        console.log(`Received unhandled message type: ${message.type}`);
    }
  } catch (error) {
    console.error('Failed to parse message or process it:', error);
  }
});

function handleParsedLog(parsed) {
    switch(parsed.type) {
        case 'user_join':
            console.log(`==> ${parsed.data.userName} joined! (${parsed.data.userId})`);
            break;
        case 'user_leave':
            console.log(`==> ${parsed.data.userName} left! (${parsed.data.userId})`);
            break;
        case 'world_change':
            console.log(`==> World changed to ${parsed.data.worldId} in region ${parsed.data.region}`);
            if (parsed.data.instance) {
                console.log(`    Instance: ${parsed.data.instance}`);
            }
            break;
        case 'other':
            console.log(`==> Other event: ${parsed.data.content}`);
            break;
    }
}

ws.on('close', function close() {
  console.log('Disconnected from server.');
});

ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
});

// 3. 30秒ごとにpingを送信して接続を維持
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    const pingMessage = { type: 'ping', data: { timestamp: Date.now() } };
    ws.send(JSON.stringify(pingMessage));
    // console.log('Ping sent.');
  }
}, 30000);
```

### 実行方法
1.  `ws` パッケージをインストールします: `npm install ws`
2.  上記のコードを `client.js` として保存します。
3.  VRChat Log Relay Serverを実行した状態で、別のターミナルで `node client.js` を実行します。
