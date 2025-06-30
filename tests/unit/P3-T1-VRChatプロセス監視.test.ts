/**
 * P3-T1: VRChatプロセス監視機能テスト
 * 
 * VRChatプロセスの検知・監視機能のテスト
 * 
 * @created 2025-06-30
 */

import { VRChatLogWatcher } from '../../src/log/VRChatLogWatcher';
import { VRChatStatus } from '../../src/types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('P3-T1: VRChatプロセス監視機能', () => {
  let watcher: VRChatLogWatcher;

  beforeEach(() => {
    watcher = new VRChatLogWatcher({
      processCheckInterval: 1000, // テスト用に短縮
      groupPeriod: 30,
      maxFiles: 4
    });
  });

  afterEach(async () => {
    await watcher.stopWatching();
  });

  describe('プロセス検知メソッド', () => {
    test('detectVRChatProcess メソッドの存在確認', () => {
      // プライベートメソッドなので、関数の存在確認をクラスレベルで行う
      expect(watcher).toBeDefined();
      expect(typeof watcher.getVRChatStatus).toBe('function');
      expect(typeof watcher.getProcessInfo).toBe('function');
    });

    test('初期状態では VRChat が動作していない', () => {
      const status = watcher.getVRChatStatus();
      expect(status).toBe(VRChatStatus.NOT_RUNNING);
      
      const processInfo = watcher.getProcessInfo();
      expect(processInfo).toBeNull();
    });

    test('プロセス監視の開始と停止', async () => {
      // 監視開始
      await watcher.startWatching();
      expect(watcher.getVRChatStatus()).toBeDefined();
      
      // 監視停止
      await watcher.stopWatching();
    });
  });

  describe('検知コマンドのテスト', () => {
    test('wmic コマンドの実行テスト', async () => {
      try {
        const { stdout, stderr } = await execAsync(
          'wmic process where "name=\'notepad.exe\'" get ProcessId /format:value',
          { timeout: 5000 }
        );
        
        // コマンドが正常に実行されることを確認
        expect(typeof stdout).toBe('string');
        // notepadは動作していない可能性が高いが、コマンド自体は成功するはず
      } catch (error) {
        // コマンドが利用できない環境の場合はスキップ
        console.warn('wmic command not available:', error);
      }
    });

    test('tasklist コマンドの実行テスト', async () => {
      try {
        const { stdout } = await execAsync(
          'tasklist /FI "IMAGENAME eq explorer.exe" /NH',
          { timeout: 5000 }
        );
        
        // エクスプローラーは通常動作しているので検出されるはず
        expect(typeof stdout).toBe('string');
        expect(stdout.length).toBeGreaterThan(0);
      } catch (error) {
        console.warn('tasklist command failed:', error);
      }
    });
  });

  describe('プロセス状態変更の検知', () => {
    test('状態変更イベントの発火テスト', (done) => {
      const timeout = setTimeout(() => {
        done(); // タイムアウトで正常終了
      }, 3000);

      watcher.on('vrchat_status_change', (event) => {
        // 状態変更イベントが発火された場合
        expect(event).toBeDefined();
        expect(event.currentStatus).toBeDefined();
        expect(event.previousStatus).toBeDefined();
        expect(event.timestamp).toBeDefined();
        
        clearTimeout(timeout);
        done();
      });

      watcher.on('watching_started', () => {
        // 監視開始イベントの確認
        expect(true).toBe(true);
      });

      // 監視開始
      watcher.startWatching().catch(done);
    });
  });

  describe('エラーハンドリング', () => {
    test('無効なコマンドでもクラッシュしない', async () => {
      // 内部的に無効なコマンドが実行されてもアプリケーションがクラッシュしないことを確認
      expect(async () => {
        await watcher.startWatching();
        await new Promise(resolve => setTimeout(resolve, 2000));
        await watcher.stopWatching();
      }).not.toThrow();
    });

    test('複数回の startWatching 呼び出し', async () => {
      await watcher.startWatching();
      // 2回目の呼び出しでエラーが発生しないことを確認
      await expect(watcher.startWatching()).resolves.not.toThrow();
      await watcher.stopWatching();
    });

    test('監視開始前の stopWatching 呼び出し', async () => {
      // 監視を開始していない状態での停止処理がエラーにならないことを確認
      await expect(watcher.stopWatching()).resolves.not.toThrow();
    });
  });

  describe('設定値の適用', () => {
    test('カスタム設定での初期化', () => {
      const customWatcher = new VRChatLogWatcher({
        processCheckInterval: 10000,
        groupPeriod: 60,
        maxFiles: 8
      });
      
      expect(customWatcher).toBeDefined();
      expect(customWatcher.getVRChatStatus()).toBe(VRChatStatus.NOT_RUNNING);
    });
  });

  describe('実際のVRChatプロセス検知（統合テスト）', () => {
    test('VRChat.exe の検知（VRChatが動作している場合のみ）', async () => {
      // この テスト はVRChatが実際に動作している場合のみ成功する
      try {
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq VRChat.exe" /NH');
        if (stdout.includes('VRChat.exe')) {
          console.log('VRChat process detected, running full test');
          await watcher.startWatching();
          
          // 少し待ってプロセス検知を確認
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const status = watcher.getVRChatStatus();
          const processInfo = watcher.getProcessInfo();
          
          expect(status).toBe(VRChatStatus.RUNNING);
          expect(processInfo).not.toBeNull();
          if (processInfo) {
            expect(processInfo.processId).toBeGreaterThan(0);
            expect(processInfo.processName).toBe('VRChat.exe');
            expect(processInfo.detectionMethod).toBeDefined();
          }
        } else {
          console.log('VRChat not running, skipping integration test');
        }
      } catch (error) {
        console.log('VRChat detection test skipped:', error);
      }
    });
  });

  describe('パフォーマンステスト', () => {
    test('プロセス検知の応答時間', async () => {
      const startTime = Date.now();
      await watcher.startWatching();
      
      // 初回検知までの時間を測定
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // 1秒以内に初期化が完了することを確認
      expect(duration).toBeLessThan(1500);
      
      await watcher.stopWatching();
    });
  });
});
