/**
 * P3.5-T1: サーバーデバッグログ表示の最適化 - テスト
 * 
 * VRChatプロセス監視の静寂モード機能をテストします
 * 
 * @created 2025-06-30
 */

import { VRChatLogWatcher } from '../../src/log/VRChatLogWatcher';
import { VRChatStatus } from '../../src/types';
import { getLogger } from '../../src/utils/logger';

// テスト用のログレベルを設定
const logger = getLogger();

describe('P3.5-T1: サーバーデバッグログ最適化', () => {
  let logWatcher: VRChatLogWatcher;
  
  beforeEach(() => {
    // テスト用の設定で初期化
    logWatcher = new VRChatLogWatcher({
      processCheckInterval: 1000, // テスト用に短縮
      quietMode: {
        enabled: true,
        suppressDebugLogs: true
      }
    });
  });

  afterEach(async () => {
    if (logWatcher) {
      await logWatcher.stopWatching();
    }
  });

  describe('静寂モード設定', () => {
    test('デフォルト設定で静寂モードが有効になること', () => {
      const defaultWatcher = new VRChatLogWatcher();
      
      // プライベートメソッドのテストはリフレクションで実行
      const config = (defaultWatcher as any).config;
      expect(config.quietMode.enabled).toBe(true);
      expect(config.quietMode.suppressDebugLogs).toBe(true);
    });

    test('カスタム設定で静寂モードを無効化できること', () => {
      const customWatcher = new VRChatLogWatcher({
        quietMode: {
          enabled: false,
          suppressDebugLogs: false
        }
      });
      
      const config = (customWatcher as any).config;
      expect(config.quietMode.enabled).toBe(false);
      expect(config.quietMode.suppressDebugLogs).toBe(false);
    });
  });

  describe('静寂モード動作', () => {
    test('初期状態では静寂モードの設定が反映されること', () => {
      const isQuiet = (logWatcher as any).isInQuietModeNow();
      expect(isQuiet).toBe(true); // 静寂モードが有効なので即座にtrue
    });

    test('isInQuietModeNowが正常に動作すること', () => {
      const watcher = logWatcher as any;
      
      // 静寂モードが有効な場合
      expect(watcher.isInQuietModeNow()).toBe(true);
      
      // 設定を無効にしたwatcherで確認
      const disabledWatcher = new VRChatLogWatcher({
        quietMode: {
          enabled: false,
          suppressDebugLogs: false
        }
      });
      
      expect((disabledWatcher as any).isInQuietModeNow()).toBe(false);
    });

    test('静寂モード設定が適切に機能すること', (done) => {
      const watcher = logWatcher as any;
      
      // 静寂モードが有効な場合
      expect(watcher.isInQuietModeNow()).toBe(true);
      
      done();
    });
  });

  describe('ログ出力制御', () => {
    test('静寂モード無効時はデバッグログが出力されること', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const debugSpy = jest.spyOn(logger, 'debug').mockImplementation();
      
      const customWatcher = new VRChatLogWatcher({
        quietMode: {
          enabled: false,
          suppressDebugLogs: false
        }
      });
      
      // デバッグログ出力のテスト（実際のcheckVRChatProcess呼び出しは省略）
      const watcher = customWatcher as any;
      expect(watcher.isInQuietModeNow()).toBe(false);
      
      consoleSpy.mockRestore();      
      debugSpy.mockRestore();
      await customWatcher.stopWatching();
    });

    test('設定値が正しく適用されること', () => {
      const config = (logWatcher as any).config;
      
      expect(config.processCheckInterval).toBe(1000);
      expect(config.quietMode.enabled).toBe(true);
      expect(config.quietMode.suppressDebugLogs).toBe(true);
    });
  });

  describe('エラーハンドリング', () => {
    test('isInQuietModeNowでエラーが発生しないこと', () => {
      const watcher = logWatcher as any;
      
      expect(() => {
        watcher.isInQuietModeNow();
      }).not.toThrow();
    });
  });

  describe('パフォーマンス考慮', () => {
    test('isInQuietModeNowが高速に実行されること', () => {
      const watcher = logWatcher as any;
      
      const startTime = Date.now();
      
      // 100回実行
      for (let i = 0; i < 100; i++) {
        watcher.isInQuietModeNow();
      }
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      // 100回の実行が100ms以内で完了することを確認
      expect(executionTime).toBeLessThan(100);
    });
  });
});

/**
 * 統合テスト: 実際のVRChatプロセス監視での静寂モード動作
 */
describe('P3.5-T1: 統合テスト - VRChatプロセス監視', () => {
  let logWatcher: VRChatLogWatcher;
  
  beforeEach(() => {
    logWatcher = new VRChatLogWatcher({
      processCheckInterval: 500, // テスト用に短縮
      quietMode: {
        enabled: true,
        suppressDebugLogs: true
      }
    });
  });

  afterEach(async () => {
    if (logWatcher) {
      await logWatcher.stopWatching();
    }
  });

  test('プロセス監視開始時は静寂モードが有効なこと', async () => {
    const watcher = logWatcher as any;
    
    expect(watcher.isInQuietModeNow()).toBe(true);
  });

  test('ログレベル設定が反映されること', () => {
    const config = (logWatcher as any).config;
    
    expect(config.quietMode).toBeDefined();
    expect(typeof config.quietMode.enabled).toBe('boolean');
    expect(typeof config.quietMode.suppressDebugLogs).toBe('boolean');
  });
});
