/**
 * VRChatプロセス監視 - 実動テストスクリプト
 * 
 * VRChatの起動・終了をリアルタイムで監視し、
 * 状態変更を詳細にログ出力します。
 * 
 * 使用方法:
 * 1. このスクリプトを実行
 * 2. VRChatを起動/終了して動作確認
 * 3. Ctrl+C で監視停止
 * 
 * @created 2025-06-30
 */

import { VRChatLogWatcher } from './src/log/VRChatLogWatcher';
import { VRChatStatus } from './src/types';

class VRChatMonitorTest {
  private watcher: VRChatLogWatcher;
  private startTime: Date;

  constructor() {
    this.startTime = new Date();
    
    // テスト用の短い間隔設定
    this.watcher = new VRChatLogWatcher({
      processCheckInterval: 2000, // 2秒間隔（頻繁にチェック）
      groupPeriod: 30,
      maxFiles: 4
    });

    this.setupEventHandlers();
    this.setupSignalHandlers();
  }

  private setupEventHandlers(): void {
    // VRChat状態変更イベント
    this.watcher.on('vrchat_status_change', (event) => {
      const timestamp = new Date().toLocaleString('ja-JP');
      const elapsed = Date.now() - this.startTime.getTime();
      
      console.log('\n🔄 =================================');
      console.log(`📅 時刻: ${timestamp}`);
      console.log(`⏱️  監視開始からの経過時間: ${Math.floor(elapsed / 1000)}秒`);
      console.log(`📊 状態変更: ${event.previousStatus} → ${event.currentStatus}`);
      
      if (event.processInfo) {
        console.log(`🎯 プロセス情報:`);
        console.log(`   - PID: ${event.processInfo.processId}`);
        console.log(`   - プロセス名: ${event.processInfo.processName}`);
        console.log(`   - 検知方法: ${event.processInfo.detectionMethod}`);
        console.log(`   - 検知時刻: ${event.processInfo.startTime.toLocaleString('ja-JP')}`);
      } else {
        console.log(`⚠️  プロセス情報: なし（VRChat終了）`);
      }
      
      // VRChat起動時のメッセージ
      if (event.currentStatus === VRChatStatus.RUNNING) {
        console.log(`\n🎉 VRChatが起動されました！`);
        console.log(`🔍 ログディレクトリの監視を開始します...`);
      }
      
      // VRChat終了時のメッセージ
      if (event.currentStatus === VRChatStatus.NOT_RUNNING) {
        console.log(`\n👋 VRChatが終了されました。`);
        console.log(`⏹️  ログファイル監視を停止します。`);
      }
      
      console.log('=================================\n');
    });

    // 監視開始イベント
    this.watcher.on('watching_started', () => {
      console.log(`\n✅ VRChat監視を開始しました`);
      console.log(`🔍 プロセス監視間隔: 2秒`);
      console.log(`📁 ログディレクトリ: 自動検知`);
      console.log(`\n💡 VRChatを起動/終了して動作を確認してください`);
      console.log(`❌ 監視を停止するには Ctrl+C を押してください\n`);
    });

    // 監視停止イベント
    this.watcher.on('watching_stopped', () => {
      console.log(`\n🛑 VRChat監視を停止しました`);
    });

    // ログファイル検知イベント
    this.watcher.on('log_file_detected', (event) => {
      console.log(`📄 ログファイル検知: ${event.fileName}`);
    });

    // ログ行受信イベント
    this.watcher.on('log_line', (line, metadata) => {
      const timestamp = new Date().toLocaleTimeString('ja-JP');
      console.log(`[${timestamp}] 📝 ${line.trim()}`);
    });
  }

  private setupSignalHandlers(): void {
    // Ctrl+C での正常終了
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 監視停止要求を受信しました...');
      await this.stop();
      process.exit(0);
    });

    // その他のシグナルでの正常終了
    process.on('SIGTERM', async () => {
      console.log('\n\n🛑 プロセス終了要求を受信しました...');
      await this.stop();
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    try {
      console.log('🚀 VRChatプロセス監視テストを開始します...\n');
      
      // 現在の状態確認
      const currentStatus = this.watcher.getVRChatStatus();
      const processInfo = this.watcher.getProcessInfo();
      
      console.log(`📊 初期状態: ${currentStatus}`);
      if (processInfo) {
        console.log(`🎯 検知済みプロセス: PID ${processInfo.processId}`);
      }
      
      await this.watcher.startWatching();
      
    } catch (error) {
      console.error('❌ 監視開始エラー:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    try {
      await this.watcher.stopWatching();
      
      const endTime = new Date();
      const totalTime = Math.floor((endTime.getTime() - this.startTime.getTime()) / 1000);
      
      console.log(`\n📊 監視統計:`);
      console.log(`   - 開始時刻: ${this.startTime.toLocaleString('ja-JP')}`);
      console.log(`   - 終了時刻: ${endTime.toLocaleString('ja-JP')}`);
      console.log(`   - 総監視時間: ${totalTime}秒`);
      console.log(`\n👋 テスト完了`);
      
    } catch (error) {
      console.error('❌ 監視停止エラー:', error);
    }
  }

  // 現在の状態を表示
  printCurrentStatus(): void {
    const status = this.watcher.getVRChatStatus();
    const processInfo = this.watcher.getProcessInfo();
    const monitoredFiles = this.watcher.getMonitoredFiles();
    
    console.log(`\n📊 現在の状態:`);
    console.log(`   - VRChat状態: ${status}`);
    console.log(`   - プロセス情報: ${processInfo ? `PID ${processInfo.processId}` : 'なし'}`);
    console.log(`   - 監視ファイル数: ${monitoredFiles.length}`);
    
    if (monitoredFiles.length > 0) {
      console.log(`   - 監視中ファイル:`);
      monitoredFiles.forEach((file, index) => {
        console.log(`     ${index + 1}. ${file}`);
      });
    }
  }
}

// ===================================================================
// メイン実行部分
// ===================================================================

async function main() {
  const monitor = new VRChatMonitorTest();
  
  // 5秒ごとに状態を表示（デバッグ用）
  const statusInterval = setInterval(() => {
    monitor.printCurrentStatus();
  }, 5000);
  
  // クリーンアップ用にインターバルを停止
  process.on('SIGINT', () => {
    clearInterval(statusInterval);
  });
  
  process.on('SIGTERM', () => {
    clearInterval(statusInterval);
  });
  
  await monitor.start();
}

// スクリプト実行
if (require.main === module) {
  main().catch(error => {
    console.error('💥 致命的エラー:', error);
    process.exit(1);
  });
}
