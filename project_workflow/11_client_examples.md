# VRChat Log Relay Server - クライアント実装例

## 🎯 クライアント実装概要

VRChat Log Relay Server は WebSocket を通じて様々なクライアントアプリケーションと連携できます。このドキュメントでは、主要なプラットフォームでの実装例を提供します。

### 対応クライアント
1. **JavaScript/TypeScript** - Web アプリケーション
2. **C# (Unity)** - Unity アプリケーション・ゲーム
3. **Python** - デスクトップアプリ・自動化スクリプト
4. **C# (.NET)** - Windows アプリケーション
5. **React** - Web ダッシュボード

## 🌐 JavaScript/TypeScript クライアント

### 基本クライアント実装

```typescript
// VRChatLogClient.ts
interface VRChatLogClientOptions {
  serverUrl?: string;
  clientName: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  debug?: boolean;
}

interface LogMessage {
  id: string;
  timestamp: number;
  source: 'vrchat' | 'udon' | 'system';
  level: 'debug' | 'info' | 'warning' | 'error' | 'exception';
  raw: string;
  parsed?: any;
  metadata: any;
}

interface VRChatStatus {
  isRunning: boolean;
  processId?: number;
  logDirectoryExists: boolean;
  activeLogFiles: number;
  lastLogActivity?: number;
  detectedAt: number;
}

class VRChatLogClient extends EventTarget {
  private ws: WebSocket | null = null;
  private options: Required<VRChatLogClientOptions>;
  private clientId: string | null = null;
  private reconnectTimer: number | null = null;
  private isConnecting = false;
  private currentStatus: VRChatStatus | null = null;

  constructor(options: VRChatLogClientOptions) {
    super();
    
    this.options = {
      serverUrl: 'ws://127.0.0.1:8080',
      autoReconnect: true,
      reconnectInterval: 5000,
      debug: false,
      ...options
    };
  }

  // 接続管理
  async connect(): Promise<void> {
    if (this.isConnecting || this.isConnected()) {
      return;
    }

    this.isConnecting = true;
    this.log('Connecting to VRChat Log Relay Server...');

    try {
      this.ws = new WebSocket(this.options.serverUrl);
      this.setupEventHandlers();
      
      await this.waitForConnection();
      this.log('Connected successfully');
    } catch (error) {
      this.isConnecting = false;
      this.log('Connection failed:', error);
      
      if (this.options.autoReconnect) {
        this.scheduleReconnect();
      }
      throw error;
    }
  }

  disconnect(): void {
    this.clearReconnectTimer();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.clientId = null;
    this.isConnecting = false;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // メッセージ送信
  private send(message: any): void {
    if (!this.isConnected()) {
      throw new Error('Not connected to server');
    }

    this.ws!.send(JSON.stringify(message));
    this.log('Sent:', message);
  }

  // フィルター管理
  addLevelFilter(levels: string[]): void {
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

  addUdonFilter(): void {
    this.send({
      type: 'add_filter',
      data: {
        id: `udon-filter-${Date.now()}`,
        type: 'source',
        condition: {
          operator: 'equals',
          value: 'udon'
        }
      }
    });
  }

  addContentFilter(content: string, caseSensitive = false): void {
    this.send({
      type: 'add_filter',
      data: {
        id: `content-filter-${Date.now()}`,
        type: 'content',
        condition: {
          operator: 'contains',
          value: content,
          caseSensitive
        }
      }
    });
  }

  removeFilter(filterId: string): void {
    this.send({
      type: 'remove_filter',
      data: { id: filterId }
    });
  }

  // 状態取得
  requestStatus(): void {
    this.send({ type: 'get_status' });
  }

  requestMetrics(): void {
    this.send({ type: 'get_metrics' });
  }

  getCurrentStatus(): VRChatStatus | null {
    return this.currentStatus;
  }

  // 内部実装
  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.isConnecting = false;
      this.sendHello();
      this.dispatchEvent(new CustomEvent('connected'));
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        this.log('Failed to parse message:', error);
      }
    };

    this.ws.onclose = (event) => {
      this.isConnecting = false;
      this.log('Connection closed:', event.code, event.reason);
      
      this.dispatchEvent(new CustomEvent('disconnected', {
        detail: { code: event.code, reason: event.reason }
      }));

      if (this.options.autoReconnect && event.code !== 1000) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      this.log('WebSocket error:', error);
      this.dispatchEvent(new CustomEvent('error', { detail: error }));
    };
  }

  private sendHello(): void {
    this.send({
      type: 'hello',
      data: {
        clientName: this.options.clientName,
        version: '1.0.0',
        capabilities: ['filtering']
      }
    });
  }

  private handleMessage(message: any): void {
    this.log('Received:', message);

    switch (message.type) {
      case 'welcome':
        this.clientId = message.data.clientId;
        this.requestStatus(); // 接続時に状態を取得
        break;

      case 'log_message':
        this.handleLogMessage(message.data);
        break;

      case 'vrchat_status_change':
        this.handleStatusChange(message.data);
        break;

      case 'status':
        this.currentStatus = message.data.vrchatStatus;
        this.dispatchEvent(new CustomEvent('status', { detail: message.data }));
        break;

      case 'ping':
        this.send({ type: 'pong', data: message.data });
        break;

      case 'error':
        this.dispatchEvent(new CustomEvent('server_error', { detail: message.data }));
        break;
    }
  }

  private handleLogMessage(logData: LogMessage): void {
    this.dispatchEvent(new CustomEvent('log_message', { detail: logData }));

    // 特定イベントの発火
    if (logData.source === 'udon') {
      this.dispatchEvent(new CustomEvent('udon_event', { detail: logData }));
    }

    if (logData.level === 'error' || logData.level === 'exception') {
      this.dispatchEvent(new CustomEvent('error_log', { detail: logData }));
    }
  }

  private handleStatusChange(statusChange: any): void {
    this.dispatchEvent(new CustomEvent('vrchat_status_change', { detail: statusChange }));

    // VRChat状態更新
    if (statusChange.currentStatus) {
      this.currentStatus = statusChange.currentStatus;
    }

    // 特定状態変更の発火
    switch (statusChange.changeType) {
      case 'vrchat_process':
        this.dispatchEvent(new CustomEvent('vrchat_process_change', { 
          detail: statusChange.data 
        }));
        break;

      case 'log_monitoring':
        this.dispatchEvent(new CustomEvent('log_monitoring_change', { 
          detail: statusChange.data 
        }));
        break;
    }
  }

  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not initialized'));
        return;
      }

      if (this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const onOpen = () => {
        cleanup();
        resolve();
      };

      const onError = (error: Event) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        this.ws?.removeEventListener('open', onOpen);
        this.ws?.removeEventListener('error', onError);
      };

      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('error', onError);
    });
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    
    this.log(`Reconnecting in ${this.options.reconnectInterval}ms...`);
    
    this.reconnectTimer = window.setTimeout(() => {
      this.connect().catch(() => {
        // 再接続失敗時は次の再接続をスケジュール
      });
    }, this.options.reconnectInterval);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log('[VRChatLogClient]', ...args);
    }
  }
}

export { VRChatLogClient, LogMessage, VRChatStatus };
```

### 使用例 - Web アプリケーション

```typescript
// app.ts
import { VRChatLogClient } from './VRChatLogClient';

class VRChatLogApp {
  private client: VRChatLogClient;
  private logContainer: HTMLElement;
  private statusElement: HTMLElement;

  constructor() {
    this.client = new VRChatLogClient({
      clientName: 'VRChat Web Monitor',
      debug: true
    });

    this.logContainer = document.getElementById('log-container')!;
    this.statusElement = document.getElementById('status')!;

    this.setupEventHandlers();
    this.setupUI();
  }

  private setupEventHandlers(): void {
    // 接続イベント
    this.client.addEventListener('connected', () => {
      this.updateStatus('Connected', 'success');
      this.addUdonFilter(); // Udonログのみ表示
    });

    this.client.addEventListener('disconnected', () => {
      this.updateStatus('Disconnected', 'error');
    });

    // ログメッセージ
    this.client.addEventListener('log_message', (event: any) => {
      const logData = event.detail;
      this.displayLogMessage(logData);
    });

    // VRChat状態変更
    this.client.addEventListener('vrchat_status_change', (event: any) => {
      const change = event.detail;
      this.displayStatusChange(change);
    });

    // VRChatプロセス状態変更
    this.client.addEventListener('vrchat_process_change', (event: any) => {
      const data = event.detail;
      if (data.isRunning) {
        this.updateStatus('VRChat Running', 'success');
      } else {
        this.updateStatus('VRChat Not Running', 'warning');
      }
    });
  }

  private setupUI(): void {
    // 接続ボタン
    document.getElementById('connect-btn')?.addEventListener('click', () => {
      this.client.connect();
    });

    // 切断ボタン
    document.getElementById('disconnect-btn')?.addEventListener('click', () => {
      this.client.disconnect();
    });

    // フィルター設定
    document.getElementById('filter-errors')?.addEventListener('click', () => {
      this.client.addLevelFilter(['error', 'exception']);
    });

    // ログクリア
    document.getElementById('clear-logs')?.addEventListener('click', () => {
      this.logContainer.innerHTML = '';
    });
  }

  private displayLogMessage(logData: any): void {
    const logElement = document.createElement('div');
    logElement.className = `log-entry log-${logData.level}`;
    
    const timestamp = new Date(logData.timestamp).toLocaleTimeString();
    const source = logData.source.toUpperCase();
    
    logElement.innerHTML = `
      <div class="log-header">
        <span class="timestamp">${timestamp}</span>
        <span class="source">${source}</span>
        <span class="level">${logData.level.toUpperCase()}</span>
      </div>
      <div class="log-content">${this.escapeHtml(logData.raw)}</div>
      ${logData.parsed ? `<div class="log-parsed">${JSON.stringify(logData.parsed, null, 2)}</div>` : ''}
    `;

    this.logContainer.appendChild(logElement);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;

    // ログ数制限
    if (this.logContainer.children.length > 1000) {
      this.logContainer.removeChild(this.logContainer.firstChild!);
    }
  }

  private displayStatusChange(change: any): void {
    const statusElement = document.createElement('div');
    statusElement.className = 'status-change';
    statusElement.textContent = `${change.changeType}: ${JSON.stringify(change.data)}`;
    
    document.getElementById('status-log')?.appendChild(statusElement);
  }

  private updateStatus(message: string, type: 'success' | 'warning' | 'error'): void {
    this.statusElement.textContent = message;
    this.statusElement.className = `status status-${type}`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private addUdonFilter(): void {
    this.client.addUdonFilter();
  }

  // 公開メソッド
  async start(): Promise<void> {
    await this.client.connect();
  }

  stop(): void {
    this.client.disconnect();
  }
}

// アプリケーション起動
const app = new VRChatLogApp();

document.addEventListener('DOMContentLoaded', () => {
  app.start().catch(console.error);
});

// ページ離脱時のクリーンアップ
window.addEventListener('beforeunload', () => {
  app.stop();
});
```

## 🎮 Unity C# クライアント

### Unity WebSocket クライアント

```csharp
// VRChatLogUnityClient.cs
using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using Newtonsoft.Json;
using WebSocketSharp;

[Serializable]
public class LogMessage
{
    public string id;
    public long timestamp;
    public string source;
    public string level;
    public string raw;
    public object parsed;
    public object metadata;
}

[Serializable]
public class VRChatStatus
{
    public bool isRunning;
    public int? processId;
    public bool logDirectoryExists;
    public int activeLogFiles;
    public long? lastLogActivity;
    public long detectedAt;
}

public class VRChatLogUnityClient : MonoBehaviour
{
    [Header("Connection Settings")]
    public string serverUrl = "ws://127.0.0.1:8080";
    public string clientName = "Unity VRChat Client";
    public bool autoConnect = true;
    public bool autoReconnect = true;
    public float reconnectInterval = 5f;

    [Header("Debug")]
    public bool debugLogging = true;

    // Events
    public event Action OnConnected;
    public event Action<string> OnDisconnected;
    public event Action<LogMessage> OnLogMessage;
    public event Action<object> OnVRChatStatusChange;
    public event Action<VRChatStatus> OnStatusUpdate;

    private WebSocket ws;
    private string clientId;
    private bool isConnecting = false;
    private VRChatStatus currentStatus;
    private Queue<string> messageQueue = new Queue<string>();
    private bool isProcessingQueue = false;

    void Start()
    {
        if (autoConnect)
        {
            Connect();
        }
    }

    void Update()
    {
        ProcessMessageQueue();
    }

    void OnDestroy()
    {
        Disconnect();
    }

    // 接続管理
    public void Connect()
    {
        if (isConnecting || IsConnected())
        {
            return;
        }

        isConnecting = true;
        Log("Connecting to VRChat Log Relay Server...");

        try
        {
            ws = new WebSocket(serverUrl);
            
            ws.OnOpen += OnWebSocketOpen;
            ws.OnMessage += OnWebSocketMessage;
            ws.OnClose += OnWebSocketClose;
            ws.OnError += OnWebSocketError;

            ws.Connect();
        }
        catch (Exception e)
        {
            isConnecting = false;
            LogError($"Connection failed: {e.Message}");
            
            if (autoReconnect)
            {
                StartCoroutine(ReconnectCoroutine());
            }
        }
    }

    public void Disconnect()
    {
        if (ws != null)
        {
            ws.Close();
            ws = null;
        }
        
        clientId = null;
        isConnecting = false;
    }

    public bool IsConnected()
    {
        return ws?.ReadyState == WebSocketState.Open;
    }

    // メッセージ送信
    private void Send(object message)
    {
        if (!IsConnected())
        {
            LogError("Not connected to server");
            return;
        }

        try
        {
            string json = JsonConvert.SerializeObject(message);
            ws.Send(json);
            Log($"Sent: {json}");
        }
        catch (Exception e)
        {
            LogError($"Failed to send message: {e.Message}");
        }
    }

    // フィルター管理
    public void AddLevelFilter(string[] levels)
    {
        Send(new
        {
            type = "add_filter",
            data = new
            {
                id = $"level-filter-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                type = "level",
                condition = new
                {
                    @operator = "in",
                    value = levels
                }
            }
        });
    }

    public void AddUdonFilter()
    {
        Send(new
        {
            type = "add_filter",
            data = new
            {
                id = $"udon-filter-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                type = "source",
                condition = new
                {
                    @operator = "equals",
                    value = "udon"
                }
            }
        });
    }

    public void RequestStatus()
    {
        Send(new { type = "get_status" });
    }

    public VRChatStatus GetCurrentStatus()
    {
        return currentStatus;
    }

    // WebSocket イベントハンドラー
    private void OnWebSocketOpen(object sender, EventArgs e)
    {
        isConnecting = false;
        Log("Connected successfully");
        
        // メインスレッドで実行
        QueueMessage("connected");
        
        SendHello();
    }

    private void OnWebSocketMessage(object sender, MessageEventArgs e)
    {
        Log($"Received: {e.Data}");
        QueueMessage(e.Data);
    }

    private void OnWebSocketClose(object sender, CloseEventArgs e)
    {
        isConnecting = false;
        Log($"Connection closed: {e.Code} - {e.Reason}");
        
        QueueMessage($"disconnected:{e.Reason}");

        if (autoReconnect && e.Code != 1000)
        {
            StartCoroutine(ReconnectCoroutine());
        }
    }

    private void OnWebSocketError(object sender, ErrorEventArgs e)
    {
        LogError($"WebSocket error: {e.Message}");
    }

    private void SendHello()
    {
        Send(new
        {
            type = "hello",
            data = new
            {
                clientName = clientName,
                version = "1.0.0",
                capabilities = new[] { "filtering" }
            }
        });
    }

    // メッセージキュー処理
    private void QueueMessage(string message)
    {
        lock (messageQueue)
        {
            messageQueue.Enqueue(message);
        }
    }

    private void ProcessMessageQueue()
    {
        if (isProcessingQueue) return;

        lock (messageQueue)
        {
            if (messageQueue.Count == 0) return;

            isProcessingQueue = true;
            
            while (messageQueue.Count > 0)
            {
                string message = messageQueue.Dequeue();
                ProcessMessage(message);
            }
            
            isProcessingQueue = false;
        }
    }

    private void ProcessMessage(string message)
    {
        try
        {
            if (message == "connected")
            {
                OnConnected?.Invoke();
                return;
            }

            if (message.StartsWith("disconnected:"))
            {
                string reason = message.Substring("disconnected:".Length);
                OnDisconnected?.Invoke(reason);
                return;
            }

            // JSON メッセージ処理
            var messageObject = JsonConvert.DeserializeObject<dynamic>(message);
            HandleMessage(messageObject);
        }
        catch (Exception e)
        {
            LogError($"Failed to process message: {e.Message}");
        }
    }

    private void HandleMessage(dynamic message)
    {
        string type = message.type;

        switch (type)
        {
            case "welcome":
                clientId = message.data.clientId;
                RequestStatus();
                break;

            case "log_message":
                var logData = JsonConvert.DeserializeObject<LogMessage>(message.data.ToString());
                OnLogMessage?.Invoke(logData);
                break;

            case "vrchat_status_change":
                OnVRChatStatusChange?.Invoke(message.data);
                
                if (message.data.currentStatus != null)
                {
                    currentStatus = JsonConvert.DeserializeObject<VRChatStatus>(
                        message.data.currentStatus.ToString());
                }
                break;

            case "status":
                if (message.data.vrchatStatus != null)
                {
                    currentStatus = JsonConvert.DeserializeObject<VRChatStatus>(
                        message.data.vrchatStatus.ToString());
                    OnStatusUpdate?.Invoke(currentStatus);
                }
                break;

            case "ping":
                Send(new { type = "pong", data = message.data });
                break;
        }
    }

    // 再接続
    private IEnumerator ReconnectCoroutine()
    {
        Log($"Reconnecting in {reconnectInterval} seconds...");
        yield return new WaitForSeconds(reconnectInterval);
        Connect();
    }

    // ログ出力
    private void Log(string message)
    {
        if (debugLogging)
        {
            Debug.Log($"[VRChatLogClient] {message}");
        }
    }

    private void LogError(string message)
    {
        Debug.LogError($"[VRChatLogClient] {message}");
    }
}
```

### Unity 使用例 - ゲーム内UI

```csharp
// VRChatLogUI.cs
using UnityEngine;
using UnityEngine.UI;
using System.Collections.Generic;

public class VRChatLogUI : MonoBehaviour
{
    [Header("UI References")]
    public Text statusText;
    public Text vrchatStatusText;
    public ScrollRect logScrollRect;
    public Transform logContent;
    public GameObject logEntryPrefab;
    
    [Header("Controls")]
    public Button connectButton;
    public Button disconnectButton;
    public Button udonFilterButton;
    public Button clearLogsButton;

    private VRChatLogUnityClient client;
    private List<GameObject> logEntries = new List<GameObject>();

    void Start()
    {
        client = GetComponent<VRChatLogUnityClient>();
        
        // イベント購読
        client.OnConnected += OnConnected;
        client.OnDisconnected += OnDisconnected;
        client.OnLogMessage += OnLogMessage;
        client.OnStatusUpdate += OnStatusUpdate;

        // UI イベント設定
        connectButton.onClick.AddListener(() => client.Connect());
        disconnectButton.onClick.AddListener(() => client.Disconnect());
        udonFilterButton.onClick.AddListener(() => client.AddUdonFilter());
        clearLogsButton.onClick.AddListener(ClearLogs);

        UpdateUI();
    }

    private void OnConnected()
    {
        statusText.text = "Connected";
        statusText.color = Color.green;
        UpdateUI();
    }

    private void OnDisconnected(string reason)
    {
        statusText.text = $"Disconnected: {reason}";
        statusText.color = Color.red;
        UpdateUI();
    }

    private void OnLogMessage(LogMessage logData)
    {
        CreateLogEntry(logData);
    }

    private void OnStatusUpdate(VRChatStatus status)
    {
        string statusString = status.isRunning ? "Running" : "Not Running";
        vrchatStatusText.text = $"VRChat: {statusString}";
        vrchatStatusText.color = status.isRunning ? Color.green : Color.red;
    }

    private void CreateLogEntry(LogMessage logData)
    {
        if (logEntries.Count > 100)
        {
            // 古いエントリを削除
            var oldEntry = logEntries[0];
            logEntries.RemoveAt(0);
            Destroy(oldEntry);
        }

        GameObject entry = Instantiate(logEntryPrefab, logContent);
        var entryScript = entry.GetComponent<LogEntry>();
        entryScript.SetLogData(logData);
        
        logEntries.Add(entry);

        // スクロールを最下部に
        Canvas.ForceUpdateCanvases();
        logScrollRect.verticalNormalizedPosition = 0f;
    }

    private void ClearLogs()
    {
        foreach (var entry in logEntries)
        {
            Destroy(entry);
        }
        logEntries.Clear();
    }

    private void UpdateUI()
    {
        bool connected = client.IsConnected();
        connectButton.interactable = !connected;
        disconnectButton.interactable = connected;
        udonFilterButton.interactable = connected;
    }
}

// LogEntry.cs - ログエントリ表示コンポーネント
public class LogEntry : MonoBehaviour
{
    public Text timestampText;
    public Text sourceText;
    public Text levelText;
    public Text contentText;

    public void SetLogData(LogMessage logData)
    {
        var timestamp = System.DateTimeOffset.FromUnixTimeMilliseconds(logData.timestamp);
        timestampText.text = timestamp.ToString("HH:mm:ss");
        sourceText.text = logData.source.ToUpper();
        levelText.text = logData.level.ToUpper();
        contentText.text = logData.raw;

        // レベルに応じた色設定
        Color levelColor = GetLevelColor(logData.level);
        levelText.color = levelColor;
    }

    private Color GetLevelColor(string level)
    {
        switch (level.ToLower())
        {
            case "error": return Color.red;
            case "warning": return Color.yellow;
            case "info": return Color.white;
            case "debug": return Color.gray;
            default: return Color.white;
        }
    }
}
```

## 🐍 Python クライアント

### Python WebSocket クライアント

```python
# vrchat_log_client.py
import asyncio
import json
import logging
import websockets
from typing import Optional, Callable, Dict, Any
from dataclasses import dataclass
from datetime import datetime

@dataclass
class LogMessage:
    id: str
    timestamp: int
    source: str
    level: str
    raw: str
    parsed: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None

@dataclass
class VRChatStatus:
    is_running: bool
    process_id: Optional[int] = None
    log_directory_exists: bool = False
    active_log_files: int = 0
    last_log_activity: Optional[int] = None
    detected_at: int = 0

class VRChatLogClient:
    def __init__(self, 
                 server_url: str = "ws://127.0.0.1:8080",
                 client_name: str = "Python VRChat Client",
                 auto_reconnect: bool = True,
                 reconnect_interval: float = 5.0,
                 debug: bool = False):
        
        self.server_url = server_url
        self.client_name = client_name
        self.auto_reconnect = auto_reconnect
        self.reconnect_interval = reconnect_interval
        self.debug = debug
        
        self.websocket: Optional[websockets.WebSocketServerProtocol] = None
        self.client_id: Optional[str] = None
        self.current_status: Optional[VRChatStatus] = None
        self.is_connecting = False
        
        # イベントハンドラー
        self.on_connected: Optional[Callable] = None
        self.on_disconnected: Optional[Callable[[str], None]] = None
        self.on_log_message: Optional[Callable[[LogMessage], None]] = None
        self.on_vrchat_status_change: Optional[Callable[[Dict], None]] = None
        self.on_status_update: Optional[Callable[[VRChatStatus], None]] = None
        self.on_error: Optional[Callable[[Exception], None]] = None
        
        # ログ設定
        self.logger = logging.getLogger(__name__)
        if debug:
            self.logger.setLevel(logging.DEBUG)
        else:
            self.logger.setLevel(logging.INFO)

    async def connect(self) -> None:
        """サーバーに接続"""
        if self.is_connecting or self.is_connected():
            return
            
        self.is_connecting = True
        self.logger.info("Connecting to VRChat Log Relay Server...")
        
        try:
            self.websocket = await websockets.connect(self.server_url)
            self.is_connecting = False
            
            self.logger.info("Connected successfully")
            if self.on_connected:
                self.on_connected()
            
            await self.send_hello()
            await self.listen()
            
        except Exception as e:
            self.is_connecting = False
            self.logger.error(f"Connection failed: {e}")
            
            if self.on_error:
                self.on_error(e)
                
            if self.auto_reconnect:
                await self.schedule_reconnect()
            raise

    async def disconnect(self) -> None:
        """接続を切断"""
        if self.websocket:
            await self.websocket.close()
            self.websocket = None
        
        self.client_id = None
        self.is_connecting = False

    def is_connected(self) -> bool:
        """接続状態を確認"""
        return self.websocket is not None and not self.websocket.closed

    async def send(self, message: Dict[str, Any]) -> None:
        """メッセージを送信"""
        if not self.is_connected():
            raise Exception("Not connected to server")
        
        json_message = json.dumps(message)
        await self.websocket.send(json_message)
        self.logger.debug(f"Sent: {json_message}")

    # フィルター管理
    async def add_level_filter(self, levels: list[str]) -> None:
        """ログレベルフィルターを追加"""
        await self.send({
            "type": "add_filter",
            "data": {
                "id": f"level-filter-{int(datetime.now().timestamp() * 1000)}",
                "type": "level",
                "condition": {
                    "operator": "in",
                    "value": levels
                }
            }
        })

    async def add_udon_filter(self) -> None:
        """Udonログフィルターを追加"""
        await self.send({
            "type": "add_filter",
            "data": {
                "id": f"udon-filter-{int(datetime.now().timestamp() * 1000)}",
                "type": "source",
                "condition": {
                    "operator": "equals",
                    "value": "udon"
                }
            }
        })

    async def add_content_filter(self, content: str, case_sensitive: bool = False) -> None:
        """内容フィルターを追加"""
        await self.send({
            "type": "add_filter",
            "data": {
                "id": f"content-filter-{int(datetime.now().timestamp() * 1000)}",
                "type": "content",
                "condition": {
                    "operator": "contains",
                    "value": content,
                    "caseSensitive": case_sensitive
                }
            }
        })

    async def remove_filter(self, filter_id: str) -> None:
        """フィルターを削除"""
        await self.send({
            "type": "remove_filter",
            "data": {"id": filter_id}
        })

    async def request_status(self) -> None:
        """サーバー状態を要求"""
        await self.send({"type": "get_status"})

    def get_current_status(self) -> Optional[VRChatStatus]:
        """現在のVRChat状態を取得"""
        return self.current_status

    # 内部実装
    async def send_hello(self) -> None:
        """接続時の挨拶を送信"""
        await self.send({
            "type": "hello",
            "data": {
                "clientName": self.client_name,
                "version": "1.0.0",
                "capabilities": ["filtering"]
            }
        })

    async def listen(self) -> None:
        """メッセージ受信ループ"""
        try:
            async for message in self.websocket:
                await self.handle_message(json.loads(message))
        except websockets.exceptions.ConnectionClosed as e:
            self.logger.info(f"Connection closed: {e}")
            if self.on_disconnected:
                self.on_disconnected(str(e))
                
            if self.auto_reconnect:
                await self.schedule_reconnect()
        except Exception as e:
            self.logger.error(f"Listen error: {e}")
            if self.on_error:
                self.on_error(e)

    async def handle_message(self, message: Dict[str, Any]) -> None:
        """メッセージ処理"""
        self.logger.debug(f"Received: {message}")
        
        msg_type = message.get("type")
        
        if msg_type == "welcome":
            self.client_id = message["data"]["clientId"]
            await self.request_status()
            
        elif msg_type == "log_message":
            log_data = LogMessage(**message["data"])
            if self.on_log_message:
                self.on_log_message(log_data)
                
        elif msg_type == "vrchat_status_change":
            if self.on_vrchat_status_change:
                self.on_vrchat_status_change(message["data"])
                
            # ステータス更新
            if "currentStatus" in message["data"]:
                self.current_status = VRChatStatus(**message["data"]["currentStatus"])
                
        elif msg_type == "status":
            if "vrchatStatus" in message["data"]:
                self.current_status = VRChatStatus(**message["data"]["vrchatStatus"])
                if self.on_status_update:
                    self.on_status_update(self.current_status)
                    
        elif msg_type == "ping":
            await self.send({"type": "pong", "data": message["data"]})
            
        elif msg_type == "error":
            error_data = message["data"]
            self.logger.error(f"Server error: {error_data}")

    async def schedule_reconnect(self) -> None:
        """再接続をスケジュール"""
        self.logger.info(f"Reconnecting in {self.reconnect_interval} seconds...")
        await asyncio.sleep(self.reconnect_interval)
        
        try:
            await self.connect()
        except Exception as e:
            self.logger.error(f"Reconnect failed: {e}")
            if self.auto_reconnect:
                await self.schedule_reconnect()

# 使用例
async def main():
    client = VRChatLogClient(debug=True)
    
    # イベントハンドラー設定
    def on_connected():
        print("Connected to VRChat Log Relay Server!")
    
    def on_log_message(log_data: LogMessage):
        timestamp = datetime.fromtimestamp(log_data.timestamp / 1000)
        print(f"[{timestamp}] {log_data.source.upper()}/{log_data.level.upper()}: {log_data.raw}")
    
    def on_status_update(status: VRChatStatus):
        vrchat_status = "Running" if status.is_running else "Not Running"
        print(f"VRChat Status: {vrchat_status}")
    
    client.on_connected = on_connected
    client.on_log_message = on_log_message
    client.on_status_update = on_status_update
    
    try:
        await client.connect()
        
        # Udonログのみ表示
        await client.add_udon_filter()
        
        # 接続を維持
        while True:
            await asyncio.sleep(1)
            
    except KeyboardInterrupt:
        print("Disconnecting...")
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
```

### Python GUI アプリケーション例 (tkinter)

```python
# vrchat_log_gui.py
import tkinter as tk
from tkinter import ttk, scrolledtext
import asyncio
import threading
from datetime import datetime
from vrchat_log_client import VRChatLogClient, LogMessage, VRChatStatus

class VRChatLogGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("VRChat Log Monitor")
        self.root.geometry("800x600")
        
        self.client = VRChatLogClient(debug=True)
        self.setup_ui()
        self.setup_client_events()
        
        # 非同期ループ用
        self.loop = None
        self.thread = None

    def setup_ui(self):
        # メインフレーム
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # 接続状態表示
        status_frame = ttk.LabelFrame(main_frame, text="Connection Status", padding="5")
        status_frame.grid(row=0, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(0, 10))
        
        self.status_label = ttk.Label(status_frame, text="Disconnected", foreground="red")
        self.status_label.grid(row=0, column=0, sticky=tk.W)
        
        self.vrchat_status_label = ttk.Label(status_frame, text="VRChat: Unknown", foreground="gray")
        self.vrchat_status_label.grid(row=0, column=1, sticky=tk.E)
        
        # 接続ボタン
        button_frame = ttk.Frame(main_frame)
        button_frame.grid(row=1, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(0, 10))
        
        self.connect_button = ttk.Button(button_frame, text="Connect", command=self.connect)
        self.connect_button.grid(row=0, column=0, padx=(0, 5))
        
        self.disconnect_button = ttk.Button(button_frame, text="Disconnect", command=self.disconnect, state="disabled")
        self.disconnect_button.grid(row=0, column=1, padx=(0, 5))
        
        self.udon_filter_button = ttk.Button(button_frame, text="Udon Filter", command=self.add_udon_filter, state="disabled")
        self.udon_filter_button.grid(row=0, column=2, padx=(0, 5))
        
        self.clear_button = ttk.Button(button_frame, text="Clear Logs", command=self.clear_logs)
        self.clear_button.grid(row=0, column=3)
        
        # ログ表示エリア
        log_frame = ttk.LabelFrame(main_frame, text="Logs", padding="5")
        log_frame.grid(row=2, column=0, columnspan=2, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        self.log_text = scrolledtext.ScrolledText(log_frame, height=20, state="disabled")
        self.log_text.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # グリッド設定
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)
        main_frame.rowconfigure(2, weight=1)
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)

    def setup_client_events(self):
        self.client.on_connected = self.on_connected
        self.client.on_disconnected = self.on_disconnected
        self.client.on_log_message = self.on_log_message
        self.client.on_status_update = self.on_status_update

    def connect(self):
        def run_async():
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)
            self.loop.run_until_complete(self.client.connect())
        
        self.thread = threading.Thread(target=run_async, daemon=True)
        self.thread.start()
        
        self.connect_button.config(state="disabled")

    def disconnect(self):
        if self.loop and self.client.is_connected():
            asyncio.run_coroutine_threadsafe(self.client.disconnect(), self.loop)

    def add_udon_filter(self):
        if self.loop and self.client.is_connected():
            asyncio.run_coroutine_threadsafe(self.client.add_udon_filter(), self.loop)

    def clear_logs(self):
        self.log_text.config(state="normal")
        self.log_text.delete(1.0, tk.END)
        self.log_text.config(state="disabled")

    # イベントハンドラー（メインスレッドで実行される必要がある）
    def on_connected(self):
        self.root.after(0, self._on_connected_ui)

    def _on_connected_ui(self):
        self.status_label.config(text="Connected", foreground="green")
        self.connect_button.config(state="disabled")
        self.disconnect_button.config(state="normal")
        self.udon_filter_button.config(state="normal")

    def on_disconnected(self, reason):
        self.root.after(0, lambda: self._on_disconnected_ui(reason))

    def _on_disconnected_ui(self, reason):
        self.status_label.config(text=f"Disconnected: {reason}", foreground="red")
        self.connect_button.config(state="normal")
        self.disconnect_button.config(state="disabled")
        self.udon_filter_button.config(state="disabled")

    def on_log_message(self, log_data: LogMessage):
        self.root.after(0, lambda: self._on_log_message_ui(log_data))

    def _on_log_message_ui(self, log_data: LogMessage):
        timestamp = datetime.fromtimestamp(log_data.timestamp / 1000)
        log_line = f"[{timestamp.strftime('%H:%M:%S')}] {log_data.source.upper()}/{log_data.level.upper()}: {log_data.raw}\n"
        
        self.log_text.config(state="normal")
        self.log_text.insert(tk.END, log_line)
        self.log_text.see(tk.END)
        self.log_text.config(state="disabled")

    def on_status_update(self, status: VRChatStatus):
        self.root.after(0, lambda: self._on_status_update_ui(status))

    def _on_status_update_ui(self, status: VRChatStatus):
        vrchat_status = "Running" if status.is_running else "Not Running"
        color = "green" if status.is_running else "red"
        self.vrchat_status_label.config(text=f"VRChat: {vrchat_status}", foreground=color)

def main():
    root = tk.Tk()
    app = VRChatLogGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()
```

## 🎪 React ダッシュボード

### React コンポーネント

```tsx
// VRChatLogDashboard.tsx
import React, { useState, useEffect, useRef } from 'react';
import { VRChatLogClient, LogMessage, VRChatStatus } from './VRChatLogClient';

interface LogEntry extends LogMessage {
  key: string;
}

const VRChatLogDashboard: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [vrchatStatus, setVRChatStatus] = useState<VRChatStatus | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected');
  
  const clientRef = useRef<VRChatLogClient | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // クライアント初期化
    clientRef.current = new VRChatLogClient({
      clientName: 'React Dashboard',
      debug: true
    });

    const client = clientRef.current;

    // イベントハンドラー設定
    client.addEventListener('connected', () => {
      setIsConnected(true);
      setConnectionStatus('Connected');
    });

    client.addEventListener('disconnected', () => {
      setIsConnected(false);
      setConnectionStatus('Disconnected');
    });

    client.addEventListener('log_message', ((event: CustomEvent) => {
      const logData = event.detail as LogMessage;
      const logEntry: LogEntry = {
        ...logData,
        key: `${logData.id}-${Date.now()}`
      };
      
      setLogs(prevLogs => {
        const newLogs = [...prevLogs, logEntry];
        // 最大1000件まで保持
        return newLogs.length > 1000 ? newLogs.slice(-1000) : newLogs;
      });
    }) as EventListener);

    client.addEventListener('status', ((event: CustomEvent) => {
      const status = event.detail.vrchatStatus as VRChatStatus;
      setVRChatStatus(status);
    }) as EventListener);

    client.addEventListener('vrchat_status_change', ((event: CustomEvent) => {
      const change = event.detail;
      if (change.currentStatus) {
        setVRChatStatus(change.currentStatus);
      }
    }) as EventListener);

    // 自動接続
    client.connect().catch(console.error);

    // クリーンアップ
    return () => {
      client.disconnect();
    };
  }, []);

  // ログ自動スクロール
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleConnect = () => {
    clientRef.current?.connect();
  };

  const handleDisconnect = () => {
    clientRef.current?.disconnect();
  };

  const handleAddUdonFilter = () => {
    clientRef.current?.addUdonFilter();
  };

  const handleAddErrorFilter = () => {
    clientRef.current?.addLevelFilter(['error', 'exception']);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Connected': return 'text-green-600';
      case 'Disconnected': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'error':
      case 'exception':
        return 'text-red-600';
      case 'warning':
        return 'text-yellow-600';
      case 'info':
        return 'text-blue-600';
      case 'debug':
        return 'text-gray-600';
      default:
        return 'text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            VRChat Log Monitor
          </h1>
          
          {/* Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="flex items-center">
              <span className="font-semibold mr-2">Connection:</span>
              <span className={getStatusColor(connectionStatus)}>
                {connectionStatus}
              </span>
            </div>
            <div className="flex items-center">
              <span className="font-semibold mr-2">VRChat:</span>
              <span className={vrchatStatus?.isRunning ? 'text-green-600' : 'text-red-600'}>
                {vrchatStatus?.isRunning ? 'Running' : 'Not Running'}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleConnect}
              disabled={isConnected}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
            >
              Connect
            </button>
            <button
              onClick={handleDisconnect}
              disabled={!isConnected}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400"
            >
              Disconnect
            </button>
            <button
              onClick={handleAddUdonFilter}
              disabled={!isConnected}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
            >
              Udon Filter
            </button>
            <button
              onClick={handleAddErrorFilter}
              disabled={!isConnected}
              className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-400"
            >
              Error Filter
            </button>
            <button
              onClick={handleClearLogs}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Clear Logs
            </button>
          </div>
        </div>

        {/* Logs */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-4 border-b">
            <h2 className="text-xl font-semibold text-gray-800">
              Logs ({logs.length})
            </h2>
          </div>
          
          <div 
            ref={logContainerRef}
            className="h-96 overflow-y-auto p-4 font-mono text-sm"
          >
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                No logs to display. Connect to start receiving logs.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.key} className="mb-2 border-b pb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="px-2 py-1 bg-gray-200 rounded text-xs">
                      {log.source.toUpperCase()}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${getLogLevelColor(log.level)}`}>
                      {log.level.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-gray-800 break-words">
                    {log.raw}
                  </div>
                  {log.parsed && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-blue-600 text-xs">
                        Parsed Data
                      </summary>
                      <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-x-auto">
                        {JSON.stringify(log.parsed, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VRChatLogDashboard;
```

---

これらのクライアント実装例により、様々なプラットフォームでVRChat Log Relay Serverと連携するアプリケーションを構築できます。各実装は基本的な機能を提供しており、プロジェクトの要件に応じてカスタマイズして使用してください。
