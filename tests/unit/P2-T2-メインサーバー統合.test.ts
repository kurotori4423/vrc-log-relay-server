/**
 * P2-T2: メインサーバー統合 - 統合テスト
 * 
 * LogRelayServerクラスの基本的な統合動作をテスト
 * 
 * @created 2025-06-30
 */

import { LogRelayServer, ServerState } from '../../src/server/LogRelayServer';
import { FullServerConfig } from '../../src/types/config';

// テスト用設定
const testConfig: FullServerConfig = {
  server: {
    port: 13000, // テスト用ポート
    host: '127.0.0.1',
    name: 'Test Server',
    version: '1.0.0-test'
  },
  websocket: {
    port: 18080, // テスト用ポート
    host: '127.0.0.1',
    maxClients: 10,
    pingInterval: 30000,
    pongTimeout: 10000,
    compression: false,
    perMessageDeflate: false,
    maxPayload: 1048576,
    distributionBatch: {
      enabled: false,
      batchSize: 100,
      batchTimeout: 100
    },
    statusBroadcast: {
      enabled: true,
      debounceInterval: 1000
    }
  },
  vrchat: {
    logDirectory: undefined, // 自動検出
    monitoring: {
      groupPeriod: 30,
      maxFiles: 4,
      filePattern: 'output_log_*.txt',
      encoding: 'utf8'
    },
    processMonitoring: {
      enabled: true,
      interval: 5000,
      processName: 'VRChat.exe',
      retryLimit: 3,
      detectionTimeout: 30000
    },
    directoryMonitoring: {
      enabled: true,
      depth: 1,
      usePolling: false,
      pollInterval: 1000
    }
  },
  logging: {
    level: 'debug',
    format: 'simple',
    timestamp: true,
    console: {
      enabled: true,
      colorize: true,
      format: 'simple'
    },
    file: {
      enabled: false,
      filename: 'logs/test.log',
      maxSize: '10m',
      maxFiles: 5,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: false
    },
    errorFile: {
      enabled: false,
      filename: 'logs/test-error.log',
      level: 'error'
    },
    categories: {
      server: 'info',
      vrchat: 'debug',
      websocket: 'info',
      messages: 'debug'
    }
  },
  features: {
    webUI: false,
    healthCheck: true,
    metrics: true,
    authentication: false,
    rateLimit: false,
    vrchatMonitoring: {
      processDetection: true,
      directoryWatching: true,
      fileWatching: true,
      statusNotification: true
    }
  },
  performance: {
    memory: {
      maxHeapSize: '128m',
      gcThreshold: 80
    },
    processing: {
      maxConcurrentTasks: 10,
      taskTimeout: 30000,
      messageQueueSize: 1000
    },
    fileWatching: {
      stabilityThreshold: 100,
      pollInterval: 100,
      useNativeEvents: true
    }
  },
  healthCheck: {
    enabled: true,
    endpoint: '/health',
    interval: 30000,
    timeout: 5000,
    checks: {
      memoryUsage: true,
      vrchatProcess: true,
      logDirectory: true,
      websocketServer: true
    },
    thresholds: {
      memoryUsagePercent: 90,
      responseTimeMs: 1000
    }
  },
  webUI: {
    enabled: false,
    path: '/ui',
    staticFiles: './web-ui/dist',
    development: {
      hotReload: false,
      devServer: false
    }
  }
};

describe('P2-T2: LogRelayServer 統合テスト', () => {
  let server: LogRelayServer;

  beforeEach(() => {
    server = new LogRelayServer(testConfig);
  });

  afterEach(async () => {
    if (server && server.getStatus().state !== 'stopped') {
      await server.stop();
    }
  });

  describe('サーバー初期化', () => {
    test('サーバーインスタンスが正常に作成される', () => {
      expect(server).toBeDefined();
      expect(server.getStatus().state).toBe('stopped');
    });

    test('初期メトリクスが正しく設定される', () => {
      const metrics = server.getMetrics();
      expect(metrics.totalConnections).toBe(0);
      expect(metrics.connectedClients).toBe(0);
      expect(metrics.logMessagesProcessed).toBe(0);
      expect(metrics.errors).toBe(0);
    });
  });

  describe('サーバーライフサイクル', () => {
    test('サーバーが正常に起動される', async () => {
      const startPromise = server.start();
      
      // 起動中の状態確認
      expect(server.getStatus().state).toBe('starting');
      
      // 起動完了を待機
      await expect(startPromise).resolves.toBeUndefined();
      
      // 起動後の状態確認
      expect(server.getStatus().state).toBe('running');
      expect(server.getStatus().startTime).toBeDefined();
      expect(server.getStatus().uptime).toBeGreaterThan(0);
    }, 10000);

    test('サーバーが正常に停止される', async () => {
      await server.start();
      expect(server.getStatus().state).toBe('running');
      
      const stopPromise = server.stop();
      
      // 停止中の状態確認
      expect(server.getStatus().state).toBe('stopping');
      
      // 停止完了を待機
      await expect(stopPromise).resolves.toBeUndefined();
      
      // 停止後の状態確認
      expect(server.getStatus().state).toBe('stopped');
    }, 10000);

    test('既に起動中のサーバーの再起動は失敗する', async () => {
      await server.start();
      expect(server.getStatus().state).toBe('running');
      
      await expect(server.start()).rejects.toThrow('Cannot start server in state: running');
    }, 10000);
  });

  describe('イベント処理', () => {
    test('server_started イベントが発火される', async () => {
      const eventPromise = new Promise((resolve) => {
        server.once('server_started', resolve);
      });
      
      await server.start();
      await expect(eventPromise).resolves.toBeUndefined();
    }, 10000);

    test('server_stopped イベントが発火される', async () => {
      await server.start();
      
      const eventPromise = new Promise((resolve) => {
        server.once('server_stopped', resolve);
      });
      
      await server.stop();
      await expect(eventPromise).resolves.toBeUndefined();
    }, 10000);

    test('state_change イベントが正しく発火される', async () => {
      const stateChanges: Array<{ from: string; to: string }> = [];
      
      server.on('state_change', (change) => {
        stateChanges.push(change);
      });
      
      await server.start();
      await server.stop();
      
      expect(stateChanges).toHaveLength(4); // stopped->starting, starting->running, running->stopping, stopping->stopped
      expect(stateChanges[0].from).toBe('stopped');
      expect(stateChanges[0].to).toBe('starting');
      expect(stateChanges[3].from).toBe('stopping');
      expect(stateChanges[3].to).toBe('stopped');
    }, 10000);
  });

  describe('HTTP API', () => {
    test('ヘルスチェックエンドポイントが動作する', async () => {
      await server.start();
      
      const response = await fetch(`http://127.0.0.1:${testConfig.server.port}/health`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.server).toBeDefined();
    }, 10000);

    test('ステータスエンドポイントが動作する', async () => {
      await server.start();
      
      const response = await fetch(`http://127.0.0.1:${testConfig.server.port}/api/status`);
      expect(response.status).toBe(200);
      
      const status = await response.json();
      expect(status.state).toBe('running');
      expect(status.processId).toBe(process.pid);
    }, 10000);

    test('メトリクスエンドポイントが動作する', async () => {
      await server.start();
      
      const response = await fetch(`http://127.0.0.1:${testConfig.server.port}/api/metrics`);
      expect(response.status).toBe(200);
      
      const metrics = await response.json();
      expect(metrics.totalConnections).toBe(0);
      expect(metrics.startTime).toBeDefined();
    }, 10000);
  });

  describe('設定管理', () => {
    test('設定更新が正常に動作する', async () => {
      const newConfig = {
        logging: {
          ...testConfig.logging,
          level: 'info'
        }
      };
      
      await expect(server.updateConfig(newConfig)).resolves.toBeUndefined();
      
      // 設定更新イベントの確認
      const eventPromise = new Promise((resolve) => {
        server.once('config_updated', resolve);
      });
      
      await server.updateConfig(newConfig);
      await expect(eventPromise).resolves.toBeDefined();
    });

    test('無効な設定更新は失敗する', async () => {
      const invalidConfig = {
        server: {
          port: null // 無効なポート
        }
      };
      
      await expect(server.updateConfig(invalidConfig as any)).rejects.toThrow('Invalid configuration');
    });
  });

  describe('エラーハンドリング', () => {
    test('ポート競合エラーが適切に処理される', async () => {
      // 最初のサーバーを起動
      const server1 = new LogRelayServer(testConfig);
      await server1.start();
      
      try {
        // 同じポートで2つ目のサーバーを起動（失敗するはず）
        const server2 = new LogRelayServer(testConfig);
        
        await expect(server2.start()).rejects.toThrow();
        expect(server2.getStatus().state).toBe('error');
        
      } finally {
        await server1.stop();
      }
    }, 15000);
  });

  describe('WebSocket統合', () => {
    test('WebSocketサーバーが正しく統合される', async () => {
      await server.start();
      
      // WebSocketクライアント接続テスト（HTTPサーバーポートを使用）
      const ws = new (require('ws'))(`ws://127.0.0.1:${testConfig.server.port}`);
      
      const connectionPromise = new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });
      
      await expect(connectionPromise).resolves.toBeUndefined();
      
      ws.close();
    }, 10000);
  });
});

// テスト実行時のログレベル調整
beforeAll(() => {
  // テスト実行時はログレベルを下げる
  process.env.LOG_LEVEL = 'error';
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  // テスト後にログレベルを戻す
  delete process.env.LOG_LEVEL;
  delete process.env.NODE_ENV;
});
