/**
 * VRChatプロセス監視 - 簡易テストスクリプト
 * 
 * VRChatの起動・終了をリアルタイムで監視するシンプルなテスト
 * 
 * 使用方法:
 * node simple-vrchat-test.js
 * 
 * @created 2025-06-30
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class SimpleVRChatMonitor {
  constructor() {
    this.isRunning = false;
    this.lastPid = null;
    this.checkInterval = 2000; // 2秒間隔
    this.timer = null;
    this.startTime = new Date();
  }

  async detectVRChatProcess() {
    const detectionMethods = [
      {
        name: 'wmic_direct',
        command: 'wmic process where "name=\'VRChat.exe\'" get ProcessId /format:value'
      },
      {
        name: 'tasklist_filter', 
        command: 'tasklist /FI "IMAGENAME eq VRChat.exe" /NH'
      },
      {
        name: 'wmic_filtered',
        // 自己参照を避けるため、wmicとcmdプロセスを除外
        command: 'wmic process where "name=\'VRChat.exe\' and not commandline like \'%wmic%\' and not commandline like \'%cmd%\'" get ProcessId /format:value'
      }
    ];

    for (const method of detectionMethods) {
      try {
        const startTime = Date.now();
        const { stdout } = await execAsync(method.command, { timeout: 10000 });
        const duration = Date.now() - startTime;
        
        let processId = null;
        
        if (method.name.includes('wmic')) {
          const lines = stdout.split('\n').filter(line => line.trim());
          for (const line of lines) {
            const match = line.match(/ProcessId=(\d+)/);
            if (match) {
              const pid = parseInt(match[1], 10);
              // 自分自身のプロセスIDでないことを確認
              if (pid > 0 && pid !== process.pid) {
                processId = pid;
                break;
              }
            }
          }
        } else if (method.name === 'tasklist_filter') {
          const lines = stdout.split('\n').filter(line => line.includes('VRChat.exe'));
          if (lines.length > 0) {
            const parts = lines[0].split(/\s+/);
            if (parts.length >= 2) {
              const pid = parseInt(parts[1], 10);
              // 自分自身のプロセスIDでないことを確認
              if (pid > 0 && pid !== process.pid) {
                processId = pid;
              }
            }
          }
        }
        
        if (processId && processId > 0) {
          console.log(`✅ [${new Date().toLocaleTimeString()}] ${method.name} でVRChat検知 (${duration}ms) - PID: ${processId}`);
          return { processId, method: method.name };
        } else {
          console.log(`⚪ [${new Date().toLocaleTimeString()}] ${method.name} - プロセス未検知 (${duration}ms)`);
        }
        
      } catch (error) {
        console.log(`❌ [${new Date().toLocaleTimeString()}] ${method.name} エラー: ${error.message}`);
      }
    }
    
    return null;
  }

  async checkProcess() {
    try {
      const processInfo = await this.detectVRChatProcess();
      const timestamp = new Date().toLocaleTimeString();
      
      if (processInfo && !this.isRunning) {
        // VRChat起動検知
        this.isRunning = true;
        this.lastPid = processInfo.processId;
        
        console.log('\n🎉 ================================');
        console.log(`🚀 VRChat起動検知! [${timestamp}]`);
        console.log(`📊 PID: ${processInfo.processId}`);
        console.log(`🔍 検知方法: ${processInfo.method}`);
        console.log('================================\n');
        
      } else if (!processInfo && this.isRunning) {
        // VRChat終了検知
        this.isRunning = false;
        const previousPid = this.lastPid;
        this.lastPid = null;
        
        console.log('\n👋 ================================');
        console.log(`🛑 VRChat終了検知! [${timestamp}]`);
        console.log(`📊 前回PID: ${previousPid}`);
        console.log('================================\n');
        
      } else if (processInfo && this.isRunning && processInfo.processId !== this.lastPid) {
        // プロセス変更検知 - より詳細な分析
        const previousPid = this.lastPid;
        
        // 複数プロセス存在の可能性をチェック
        console.log('\n� ================================');
        console.log(`🔄 プロセス変更検知 [${timestamp}]`);
        console.log(`📊 PID変更: ${previousPid} → ${processInfo.processId}`);
        console.log(`🔍 検知方法: ${processInfo.method}`);
        
        // より詳細な分析を実行
        await this.analyzeProcessChange(previousPid, processInfo.processId);
        
        this.lastPid = processInfo.processId;
        console.log('================================\n');
      }
      
    } catch (error) {
      console.error(`💥 プロセスチェックエラー [${new Date().toLocaleTimeString()}]:`, error.message);
    }
  }

  // 新しいメソッド: プロセス変更の詳細分析
  async analyzeProcessChange(oldPid, newPid) {
    console.log(`🔬 詳細分析を実行中...`);
    
    try {
      // 両方のプロセスが存在するかチェック
      const { stdout: allProcesses } = await execAsync(
        'wmic process where "commandline like \'%VRChat%\'" get ProcessId,CommandLine /format:csv',
        { timeout: 5000 }
      );
      
      const lines = allProcesses.split('\n').filter(line => 
        line.includes('VRChat') && !line.includes('Node,CommandLine,ProcessId')
      );
      
      console.log(`   📊 検知されたVRChat関連プロセス数: ${lines.length}`);
      
      if (lines.length > 1) {
        console.log(`   ⚠️  複数のVRChatプロセスが検知されました:`);
        lines.forEach((line, index) => {
          const parts = line.split(',');
          if (parts.length >= 3) {
            const pid = parts[parts.length - 1].trim();
            const cmd = parts.slice(1, -1).join(',').trim();
            console.log(`      ${index + 1}. PID: ${pid} - ${cmd.substring(0, 80)}...`);
          }
        });
        
        console.log(`   💡 判定: VRChatランチャー + ゲーム本体、または複数インスタンス`);
      } else if (lines.length === 1) {
        console.log(`   💡 判定: 単一プロセス（プロセス再起動またはPID変更）`);
      } else {
        console.log(`   ❌ 分析結果: プロセスが見つかりません`);
      }
      
    } catch (error) {
      console.log(`   ❌ 分析エラー: ${error.message}`);
    }
  }

  start() {
    console.log('🚀 VRChatプロセス監視テストを開始します...\n');
    console.log(`🔍 監視間隔: ${this.checkInterval / 1000}秒`);
    console.log(`📅 開始時刻: ${this.startTime.toLocaleString()}`);
    console.log('💡 VRChatを起動/終了して動作を確認してください');
    console.log('❌ 監視を停止するには Ctrl+C を押してください\n');
    
    // 初回チェック
    this.checkProcess();
    
    // 定期チェックを開始
    this.timer = setInterval(() => {
      this.checkProcess();
    }, this.checkInterval);
    
    // Ctrl+C ハンドラー
    process.on('SIGINT', () => {
      this.stop();
    });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    const endTime = new Date();
    const totalTime = Math.floor((endTime.getTime() - this.startTime.getTime()) / 1000);
    
    console.log('\n🛑 監視を停止しました');
    console.log(`📊 監視統計:`);
    console.log(`   - 開始時刻: ${this.startTime.toLocaleString()}`);
    console.log(`   - 終了時刻: ${endTime.toLocaleString()}`);
    console.log(`   - 総監視時間: ${totalTime}秒`);
    console.log(`   - 最終状態: ${this.isRunning ? 'VRChat動作中' : 'VRChat停止中'}`);
    
    if (this.lastPid) {
      console.log(`   - 最終PID: ${this.lastPid}`);
    }
    
    console.log('\n👋 テスト完了');
    process.exit(0);
  }
}

// メイン実行
const monitor = new SimpleVRChatMonitor();
monitor.start();
