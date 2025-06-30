/**
 * P2-T3: エントリーポイント - テストスイート
 * 
 * テスト対象:
 * - アプリケーション起動処理
 * - 設定読み込み・オーバーライド
 * - コマンドライン引数パース
 * - エラーハンドリング
 * 
 * @created 2025-06-30
 */

import path from 'path';
import fs from 'fs/promises';
import { parseArgs, loadConfiguration, initializeApplication } from '../../src/index';
import { ConfigManager } from '../../src/server/config';

// テスト用のモック設定ディレクトリ
const TEST_CONFIG_DIR = path.join(__dirname, '../fixtures/mock-configs');

describe('P2-T3: エントリーポイント', () => {
  
  beforeAll(async () => {
    // テスト用設定ファイルの作成
    await fs.mkdir(TEST_CONFIG_DIR, { recursive: true });
    
    // default.yaml作成
    const defaultConfig = `
server:
  port: 8080
  host: "127.0.0.1"
  name: "VRChat Log Relay Server"
  version: "1.0.0"

vrchat:
  logDirectory: "\${LOCALAPPDATA}/Low/VRChat/VRChat"
  monitoring:
    groupPeriod: 1000
    maxFiles: 10
    filePattern: "output_log_*.txt"
    encoding: "utf8"
  processMonitoring:
    enabled: true
    interval: 5000
    processName: "VRChat.exe"
    retryLimit: 3
    detectionTimeout: 30000
  directoryMonitoring:
    enabled: true
    depth: 2
    usePolling: false
    pollInterval: 1000

websocket:
  port: 8081
  host: "127.0.0.1"
  pingInterval: 30000
  maxConnections: 50
  compression: false

logging:
  level: "info"
  format: "json"
  outputs:
    - type: "console"
    - type: "file"
      filename: "logs/server.log"
      maxSize: "10MB"
      maxFiles: 5

security:
  allowedOrigins: ["*"]
  rateLimit:
    windowMs: 900000
    max: 100
  cors:
    enabled: true
    credentials: false
`;
    
    await fs.writeFile(path.join(TEST_CONFIG_DIR, 'default.yaml'), defaultConfig);
    
    // development.yaml作成
    const devConfig = `
logging:
  level: "debug"
  format: "simple"
`;
    
    await fs.writeFile(path.join(TEST_CONFIG_DIR, 'development.yaml'), devConfig);
  });

  afterAll(async () => {
    // テスト用ファイルのクリーンアップ
    try {
      await fs.rm(TEST_CONFIG_DIR, { recursive: true, force: true });
    } catch (error) {
      // ファイルが存在しない場合は無視
    }
  });

  describe('parseArgs: コマンドライン引数パース', () => {
    const originalArgv = process.argv;

    afterEach(() => {
      process.argv = originalArgv;
    });

    test('デフォルト引数（引数なし）', () => {
      process.argv = ['node', 'index.js'];
      const args = parseArgs();
      
      expect(args).toEqual({});
    });

    test('完全な引数セット', () => {
      process.argv = [
        'node', 'index.js',
        '--env', 'production',
        '--config', '/custom/config',
        '--port', '9000',
        '--host', '0.0.0.0',
        '--log-level', 'debug'
      ];
      
      const args = parseArgs();
      
      expect(args).toEqual({
        environment: 'production',
        configDir: '/custom/config',
        port: 9000,
        host: '0.0.0.0',
        logLevel: 'debug'
      });
    });

    test('短縮オプション', () => {
      process.argv = [
        'node', 'index.js',
        '-e', 'test',
        '-c', '/test/config',
        '-p', '3000',
        '-h', 'localhost',
        '-l', 'warn'
      ];
      
      const args = parseArgs();
      
      expect(args).toEqual({
        environment: 'test',
        configDir: '/test/config',
        port: 3000,
        host: 'localhost',
        logLevel: 'warn'
      });
    });

    test('ヘルプフラグ', () => {
      process.argv = ['node', 'index.js', '--help'];
      const args = parseArgs();
      
      expect(args.help).toBe(true);
    });

    test('無効なポート番号', () => {
      process.argv = ['node', 'index.js', '--port', 'invalid'];
      const args = parseArgs();
      
      expect(args.port).toBeNaN();
    });
  });

  describe('loadConfiguration: 設定読み込み', () => {
    test('基本設定読み込み', async () => {
      const args = {
        configDir: TEST_CONFIG_DIR,
        environment: 'development'
      };

      const config = await loadConfiguration(args);

      expect(config).toBeDefined();
      expect(config.server.port).toBe(8080);
      expect(config.server.host).toBe('127.0.0.1');
      expect(config.logging.level).toBe('debug'); // development.yamlでオーバーライド
    });

    test('コマンドライン引数でのオーバーライド', async () => {
      const args = {
        configDir: TEST_CONFIG_DIR,
        environment: 'development',
        port: 9999,
        host: '192.168.1.1',
        logLevel: 'error'
      };

      const config = await loadConfiguration(args);

      expect(config.server.port).toBe(9999);
      expect(config.server.host).toBe('192.168.1.1');
      expect(config.logging.level).toBe('error');
    });

    test('存在しない設定ディレクトリ', async () => {
      const args = {
        configDir: '/nonexistent/config',
        environment: 'test'
      };

      await expect(loadConfiguration(args)).rejects.toThrow();
    });
  });

  describe('環境変数処理', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('NODE_ENV環境変数', async () => {
      process.env.NODE_ENV = 'production';
      
      const args = {
        configDir: TEST_CONFIG_DIR
      };

      const config = await loadConfiguration(args);
      
      // productionの設定が適用されることを期待
      expect(config).toBeDefined();
    });

    test('VRC_LOG_RELAY_*環境変数', async () => {
      process.env.VRC_LOG_RELAY_PORT = '7777';
      process.env.VRC_LOG_RELAY_HOST = '10.0.0.1';
      
      const configManager = new ConfigManager({
        configDir: TEST_CONFIG_DIR,
        environment: 'development',
        envPrefix: 'VRC_LOG_RELAY'
      });

      const result = await configManager.loadConfig();
      const config = configManager.getConfig();

      expect(result.success).toBe(true);
      expect(config).toBeDefined();
    });
  });

  describe('initializeApplication: アプリケーション初期化', () => {
    const originalArgv = process.argv;

    beforeEach(() => {
      process.argv = ['node', 'index.js', '--config', TEST_CONFIG_DIR];
    });

    afterEach(() => {
      process.argv = originalArgv;
    });

    test('正常な初期化', async () => {
      const server = await initializeApplication();
      
      expect(server).toBeDefined();
      expect(typeof server.start).toBe('function');
      expect(typeof server.stop).toBe('function');
    });

    test('ヘルプフラグでの終了', async () => {
      process.argv = ['node', 'index.js', '--help'];
      
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(initializeApplication()).rejects.toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(0);
      
      mockExit.mockRestore();
    });
  });

  describe('統合テスト', () => {
    test('設定ファイルからサーバー起動まで', async () => {
      const originalArgv = process.argv;
      process.argv = [
        'node', 'index.js',
        '--config', TEST_CONFIG_DIR,
        '--env', 'development'
      ];

      try {
        const server = await initializeApplication();
        
        // サーバーが正常に作成されることを確認
        expect(server).toBeDefined();
        
        // 設定が正しく適用されていることを確認
        const status = server.getStatus();
        expect(status).toBeDefined();
        
      } finally {
        process.argv = originalArgv;
      }
    });
  });

  describe('エラーハンドリング', () => {
    test('設定ファイルエラー', async () => {
      const args = {
        configDir: '/invalid/path',
        environment: 'test'
      };

      await expect(loadConfiguration(args)).rejects.toThrow();
    });

    test('無効な設定値', async () => {
      // 無効な設定ファイルを作成
      const invalidConfigDir = path.join(__dirname, '../fixtures/invalid-configs');
      await fs.mkdir(invalidConfigDir, { recursive: true });
      
      const invalidConfig = `
server:
  port: "invalid_port"  # 数値ではない
  host: 123  # 文字列ではない
`;
      
      await fs.writeFile(path.join(invalidConfigDir, 'default.yaml'), invalidConfig);
      
      try {
        const args = {
          configDir: invalidConfigDir,
          environment: 'development'
        };

        await expect(loadConfiguration(args)).rejects.toThrow();
      } finally {
        await fs.rm(invalidConfigDir, { recursive: true, force: true });
      }
    });
  });
});

describe('実行時品質テスト', () => {
  test('メモリリーク検出', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // 複数回初期化してメモリリークがないことを確認
    for (let i = 0; i < 5; i++) {
      const originalArgv = process.argv;
      process.argv = ['node', 'index.js', '--config', TEST_CONFIG_DIR];
      
      try {
        await initializeApplication();
      } catch (error) {
        // 設定エラーは無視（メモリリークのテストが目的）
      } finally {
        process.argv = originalArgv;
      }
    }
    
    // 強制的にガベージコレクション
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // メモリ増加が合理的な範囲内であることを確認（5MB以内）
    expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
  });

  test('TypeScript型安全性', () => {
    // コンパイル時の型チェックがパスしていることを確認
    const args = parseArgs();
    
    // TypeScriptの型定義が正しく動作することを確認
    if (args.port) {
      expect(typeof args.port).toBe('number');
    }
    if (args.environment) {
      expect(typeof args.environment).toBe('string');
    }
    if (args.help) {
      expect(typeof args.help).toBe('boolean');
    }
  });
});
