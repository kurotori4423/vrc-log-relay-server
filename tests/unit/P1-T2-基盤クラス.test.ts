/**
 * P1-T2: 基盤クラス実装 - 単体テスト
 * 
 * types/index.ts と utils/logger.ts の動作テストを実行します
 * 
 * @created 2025-06-30
 * @phase Phase 1 - 基盤実装
 */

import { 
  VRChatStatus, 
  LogLevel, 
  LogSource, 
  MessageType,
  type RawLogMessage,
  type ProcessedMessage 
} from '../../src/types';
import { 
  initializeLogger, 
  debug, 
  info, 
  warn, 
  error,
  logVRChatProcess,
  startPerformanceLog,
  logMemoryUsage,
  getLogger
} from '../../src/utils/logger';
import fs from 'fs';
import path from 'path';

describe('P1-T2: 基盤クラス実装テスト', () => {
  const testLogDir = path.join(__dirname, '../fixtures/test-logs');
  
  beforeAll(() => {
    // テスト用ログディレクトリを作成
    if (!fs.existsSync(testLogDir)) {
      fs.mkdirSync(testLogDir, { recursive: true });
    }
  });
  
  afterAll(async () => {
    // ログ処理の完了を待機
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // テスト用ログファイルをクリーンアップ
    if (fs.existsSync(testLogDir)) {
      try {
        fs.rmSync(testLogDir, { recursive: true, force: true });
      } catch (error) {
        // クリーンアップエラーは無視（テスト結果に影響しない）
        console.warn('Test cleanup warning:', error);
      }
    }
  });

  describe('型定義テスト', () => {
    test('VRChatStatus列挙型の値が正しい', () => {
      expect(VRChatStatus.NOT_RUNNING).toBe('not_running');
      expect(VRChatStatus.STARTING).toBe('starting');
      expect(VRChatStatus.RUNNING).toBe('running');
      expect(VRChatStatus.STOPPING).toBe('stopping');
    });

    test('LogLevel列挙型の値が正しい', () => {
      expect(LogLevel.DEBUG).toBe('debug');
      expect(LogLevel.INFO).toBe('info');
      expect(LogLevel.WARNING).toBe('warning');
      expect(LogLevel.ERROR).toBe('error');
      expect(LogLevel.FATAL).toBe('fatal');
    });

    test('LogSource列挙型の値が正しい', () => {
      expect(LogSource.VRCHAT).toBe('vrchat');
      expect(LogSource.UDON).toBe('udon');
      expect(LogSource.NETWORK).toBe('network');
      expect(LogSource.OTHER).toBe('other');
    });

    test('MessageType列挙型の値が正しい', () => {
      expect(MessageType.LOG_MESSAGE).toBe('log_message');
      expect(MessageType.VRCHAT_STATUS_CHANGE).toBe('vrchat_status_change');
      expect(MessageType.CLIENT_AUTH).toBe('client_auth');
      expect(MessageType.SERVER_STATUS).toBe('server_status');
      expect(MessageType.FILTER_CONFIG).toBe('filter_config');
      expect(MessageType.ERROR).toBe('error');
    });
  });

  describe('ロガー基本機能テスト', () => {
    test('ロガーが正常に初期化される', () => {
      const logger = initializeLogger({
        level: 'debug',
        console: false, // テスト時はコンソール出力無効
        file: path.join(testLogDir, 'test-basic.log')
      });
      
      expect(logger).toBeDefined();
      expect(logger.level).toBe('debug');
    });

    test('ログレベル別出力が動作する', async () => {
      const testLogFile = path.join(testLogDir, 'test-levels.log');
      
      initializeLogger({
        level: 'debug',
        console: false,
        file: testLogFile
      });

      // 各レベルのログ出力をテスト
      debug('Debug message test');
      info('Info message test');
      warn('Warning message test');
      
      // ログ出力の完了を待機
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // ファイルが作成されることを確認
      expect(fs.existsSync(testLogFile)).toBe(true);
    });

    test('VRChat専用ログ関数が動作する', async () => {
      const testLogFile = path.join(testLogDir, 'test-vrchat.log');
      
      initializeLogger({
        level: 'debug',
        console: false,
        file: testLogFile
      });

      // VRChat専用ログ関数のテスト
      logVRChatProcess('Test process detection', { processId: 12345 });
      
      // ログ出力の完了を待機
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // ファイルが作成されることを確認
      expect(fs.existsSync(testLogFile)).toBe(true);
    });
  });

  describe('データ構造テスト', () => {
    test('RawLogMessage構造が正しく作成される', () => {
      const rawMessage: RawLogMessage = {
        timestamp: new Date(),
        level: LogLevel.INFO,
        content: 'Test log message',
        fileName: 'output_log_test.txt'
      };

      expect(rawMessage.timestamp).toBeInstanceOf(Date);
      expect(rawMessage.level).toBe(LogLevel.INFO);
      expect(rawMessage.content).toBe('Test log message');
      expect(rawMessage.fileName).toBe('output_log_test.txt');
    });

    test('ProcessedMessage構造が正しく作成される', () => {
      const rawMessage: RawLogMessage = {
        timestamp: new Date(),
        level: LogLevel.INFO,
        content: 'Test log message',
        fileName: 'output_log_test.txt'
      };

      const processedMessage: ProcessedMessage = {
        id: 'test-msg-001',
        raw: rawMessage,
        source: LogSource.VRCHAT,
        tags: ['test', 'unit'],
        processedAt: new Date()
      };

      expect(processedMessage.id).toBe('test-msg-001');
      expect(processedMessage.raw).toBe(rawMessage);
      expect(processedMessage.source).toBe(LogSource.VRCHAT);
      expect(processedMessage.tags).toEqual(['test', 'unit']);
      expect(processedMessage.processedAt).toBeInstanceOf(Date);
    });
  });

  describe('パフォーマンス測定機能テスト', () => {
    test('パフォーマンス測定が正常に動作する', (done) => {
      initializeLogger({
        level: 'debug',
        console: false,
        file: path.join(testLogDir, 'test-perf.log')
      });

      const endPerf = startPerformanceLog('Test Performance');
      
      setTimeout(() => {
        endPerf();
        done();
      }, 50);
    });

    test('メモリ使用量ログが動作する', () => {
      initializeLogger({
        level: 'debug',
        console: false,
        file: path.join(testLogDir, 'test-memory.log')
      });

      expect(() => {
        logMemoryUsage('Test Memory Usage');
      }).not.toThrow();
    });
  });

  describe('エラーハンドリングテスト', () => {
    test('エラーログが正常に出力される', async () => {
      const testLogFile = path.join(testLogDir, 'test-error.log');
      
      initializeLogger({
        level: 'debug',
        console: false,
        file: testLogFile
      });

      const testError = new Error('Test error message');
      error('Test error logging', testError);
      
      // ログ出力の完了を待機
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // エラーログファイルが作成されることを確認
      const errorLogFile = testLogFile.replace('.log', '.error.log');
      expect(fs.existsSync(errorLogFile)).toBe(true);
    });
  });
});
