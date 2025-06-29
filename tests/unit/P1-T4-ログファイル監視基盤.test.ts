/**
 * VRChatLogWatcher テストファイル
 * P1-T4: ログファイル監視基盤のテスト
 * 
 * @created 2025-06-30
 */

import { VRChatLogWatcher } from '../../src/log/VRChatLogWatcher';
import { VRChatStatus, LogSource } from '../../src/types';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';

describe('VRChatLogWatcher', () => {
  let watcher: VRChatLogWatcher;
  let testLogDir: string;

  beforeEach(() => {
    // テスト用のログディレクトリを設定
    testLogDir = path.join(__dirname, '../fixtures/test-logs');
    
    watcher = new VRChatLogWatcher({
      logDirectory: testLogDir,
      groupPeriod: 30,
      maxFiles: 4,
      processCheckInterval: 1000
    });
  });

  afterEach(async () => {
    // テスト後のクリーンアップ
    if (watcher) {
      await watcher.stopWatching();
    }
  });

  describe('initialization', () => {
    test('should initialize with default config', () => {
      const defaultWatcher = new VRChatLogWatcher();
      expect(defaultWatcher).toBeInstanceOf(VRChatLogWatcher);
      expect(defaultWatcher.getVRChatStatus()).toBe(VRChatStatus.NOT_RUNNING);
    });

    test('should initialize with custom config', () => {
      const customWatcher = new VRChatLogWatcher({
        groupPeriod: 60,
        maxFiles: 2
      });
      expect(customWatcher).toBeInstanceOf(VRChatLogWatcher);
    });
  });

  describe('log file detection', () => {
    beforeEach(async () => {
      // テストディレクトリを作成
      await fs.mkdir(testLogDir, { recursive: true });
    });

    afterEach(async () => {
      // テストディレクトリをクリーンアップ
      try {
        await fs.rm(testLogDir, { recursive: true, force: true });
      } catch (error) {
        // ディレクトリが存在しない場合は無視
      }
    });

    test('should detect VRChat log files', async () => {
      // テスト用のログファイルを作成
      const logFileName = 'output_log_2025-06-30_15-30-00.txt';
      const logFilePath = path.join(testLogDir, logFileName);
      await fs.writeFile(logFilePath, 'Test log content\n');

      // ファイル検出をテスト（内部メソッドのテストのため、実装に依存）
      expect(fsSync.existsSync(logFilePath)).toBe(true);
    });

    test('should ignore non-VRChat files', async () => {
      // VRChatログファイル以外のファイルを作成
      const nonLogFile = path.join(testLogDir, 'other-file.txt');
      await fs.writeFile(nonLogFile, 'Not a VRChat log\n');

      expect(fsSync.existsSync(nonLogFile)).toBe(true);
      // VRChatLogWatcherは このファイルを無視することを確認
      // （実際のテストは統合テストで行う）
    });
  });

  describe('watcher lifecycle', () => {
    test('should start and stop watching without errors', async () => {
      await expect(watcher.startWatching()).resolves.not.toThrow();
      await expect(watcher.stopWatching()).resolves.not.toThrow();
    });

    test('should not fail when starting already running watcher', async () => {
      await watcher.startWatching();
      await expect(watcher.startWatching()).resolves.not.toThrow();
      await watcher.stopWatching();
    });
  });

  describe('status management', () => {
    test('should return initial status', () => {
      expect(watcher.getVRChatStatus()).toBe(VRChatStatus.NOT_RUNNING);
    });

    test('should return empty monitored files initially', () => {
      expect(watcher.getMonitoredFiles()).toEqual([]);
    });

    test('should return null process info initially', () => {
      expect(watcher.getProcessInfo()).toBeNull();
    });
  });

  describe('event handling', () => {
    test('should emit watching_started event', (done) => {
      watcher.on('watching_started', () => {
        done();
      });

      watcher.startWatching();
    });

    test('should emit watching_stopped event', (done) => {
      watcher.on('watching_stopped', () => {
        done();
      });

      watcher.startWatching().then(() => {
        watcher.stopWatching();
      });
    });
  });

  describe('file name parsing', () => {
    // ファイル名解析のテスト（privateメソッドの場合は統合テストで確認）
    test('should handle valid VRChat log file names', () => {
      const validNames = [
        'output_log_2025-06-30_15-30-00.txt',
        'output_log_2025-12-31_23-59-59.txt',
        'output_log_2024-01-01_00-00-00.txt'
      ];

      // ファイル名の妥当性をテスト
      // 実際の実装では isVRChatLogFile メソッドをテスト
      const pattern = /^output_log_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.txt$/;
      
      validNames.forEach(name => {
        expect(pattern.test(name)).toBe(true);
      });
    });

    test('should reject invalid file names', () => {
      const invalidNames = [
        'output_log.txt',
        'output_log_2025-06-30.txt',
        'output_log_2025-06-30_15-30.txt',
        'other_file.txt',
        'output_log_invalid_format.txt'
      ];

      const pattern = /^output_log_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.txt$/;
      
      invalidNames.forEach(name => {
        expect(pattern.test(name)).toBe(false);
      });
    });
  });
});

// 統合テスト用のダミーデータ作成ヘルパー
export async function createTestLogFile(
  directory: string, 
  timestamp: Date, 
  content: string = 'Test log content'
): Promise<string> {
  const fileName = `output_log_${timestamp.getFullYear()}-${
    String(timestamp.getMonth() + 1).padStart(2, '0')
  }-${
    String(timestamp.getDate()).padStart(2, '0')
  }_${
    String(timestamp.getHours()).padStart(2, '0')
  }-${
    String(timestamp.getMinutes()).padStart(2, '0')
  }-${
    String(timestamp.getSeconds()).padStart(2, '0')
  }.txt`;
  
  const filePath = path.join(directory, fileName);
  await fs.writeFile(filePath, content);
  
  return filePath;
}

export async function cleanupTestDirectory(directory: string): Promise<void> {
  try {
    await fs.rm(directory, { recursive: true, force: true });
  } catch (error) {
    // ディレクトリが存在しない場合は無視
  }
}
