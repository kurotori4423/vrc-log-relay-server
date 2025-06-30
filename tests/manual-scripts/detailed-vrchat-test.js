/**
 * VRChatプロセス監視 - 詳細分析テストスクリプト
 * 
 * 複数の検知手法の性能比較と詳細な統計を出力
 * 
 * @created 2025-06-30
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class DetailedVRChatMonitor {
  constructor() {
    this.statistics = {
      totalChecks: 0,
      detectionMethods: {
        wmic_direct: { attempts: 0, successes: 0, totalTime: 0 },
        tasklist_filter: { attempts: 0, successes: 0, totalTime: 0 },
        wmic_commandline: { attempts: 0, successes: 0, totalTime: 0 }
      },
      processHistory: [],
      startTime: new Date()
    };
  }

  async performDetailedCheck() {
    console.log(`\n🔍 詳細チェック開始 [${new Date().toLocaleTimeString()}]`);
    this.statistics.totalChecks++;
    
    const methods = [
      {
        name: 'wmic_direct',
        command: 'wmic process where "name=\'VRChat.exe\'" get ProcessId,CommandLine /format:csv'
      },
      {
        name: 'tasklist_filter', 
        command: 'tasklist /FI "IMAGENAME eq VRChat.exe" /NH /FO CSV'
      },
      {
        name: 'wmic_commandline',
        command: 'wmic process where "commandline like \'%VRChat%\'" get ProcessId,CommandLine /format:csv'
      }
    ];

    const results = [];

    for (const method of methods) {
      const stat = this.statistics.detectionMethods[method.name];
      stat.attempts++;
      
      try {
        const startTime = Date.now();
        const { stdout } = await execAsync(method.command, { timeout: 15000 });
        const duration = Date.now() - startTime;
        stat.totalTime += duration;
        
        const processInfo = this.parseOutput(method.name, stdout);
        
        if (processInfo) {
          stat.successes++;
          results.push({
            method: method.name,
            success: true,
            duration,
            processInfo
          });
          console.log(`   ✅ ${method.name}: PID ${processInfo.processId} (${duration}ms)`);
        } else {
          results.push({
            method: method.name,
            success: false,
            duration,
            processInfo: null
          });
          console.log(`   ❌ ${method.name}: 検知なし (${duration}ms)`);
        }
        
      } catch (error) {
        results.push({
          method: method.name,
          success: false,
          duration: 0,
          error: error.message
        });
        console.log(`   💥 ${method.name}: エラー - ${error.message}`);
      }
    }
    
    return results;
  }

  parseOutput(methodName, output) {
    if (methodName.includes('wmic')) {
      const lines = output.split('\n').filter(line => line.trim() && !line.includes('Node,CommandLine,ProcessId'));
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 3) {
          const processIdStr = parts[parts.length - 1];
          const processId = parseInt(processIdStr, 10);
          if (processId > 0) {
            return {
              processId,
              commandLine: parts.slice(1, -1).join(','),
              method: methodName
            };
          }
        }
      }
    } else if (methodName === 'tasklist_filter') {
      const lines = output.split('\n').filter(line => line.includes('VRChat.exe'));
      if (lines.length > 0) {
        // CSV形式の解析
        const line = lines[0].replace(/"/g, '');
        const parts = line.split(',');
        if (parts.length >= 2) {
          const processId = parseInt(parts[1], 10);
          if (processId > 0) {
            return {
              processId,
              method: methodName
            };
          }
        }
      }
    }
    return null;
  }

  printDetailedStatistics() {
    console.log('\n📊 ================== 詳細統計 ==================');
    console.log(`🕐 監視期間: ${this.statistics.startTime.toLocaleString()} ～ 現在`);
    console.log(`🔍 総チェック回数: ${this.statistics.totalChecks}`);
    
    console.log('\n📈 検知手法別成績:');
    
    Object.entries(this.statistics.detectionMethods).forEach(([method, stat]) => {
      const successRate = stat.attempts > 0 ? (stat.successes / stat.attempts * 100).toFixed(1) : '0.0';
      const avgTime = stat.attempts > 0 ? (stat.totalTime / stat.attempts).toFixed(0) : '0';
      
      console.log(`   ${method}:`);
      console.log(`     成功率: ${successRate}% (${stat.successes}/${stat.attempts})`);
      console.log(`     平均応答時間: ${avgTime}ms`);
    });
    
    if (this.statistics.processHistory.length > 0) {
      console.log('\n📝 プロセス履歴:');
      this.statistics.processHistory.slice(-5).forEach((entry, index) => {
        console.log(`   ${index + 1}. [${entry.timestamp}] PID: ${entry.processId} (${entry.method})`);
      });
    }
    
    console.log('================================================\n');
  }

  async runDetailedTest() {
    console.log('🚀 VRChatプロセス監視 - 詳細分析テスト\n');
    
    for (let i = 0; i < 5; i++) {
      console.log(`\n🔄 テストラウンド ${i + 1}/5`);
      
      const results = await this.performDetailedCheck();
      
      // 成功した検知があれば履歴に追加
      const successfulResult = results.find(r => r.success);
      if (successfulResult) {
        this.statistics.processHistory.push({
          timestamp: new Date().toLocaleTimeString(),
          processId: successfulResult.processInfo.processId,
          method: successfulResult.method
        });
      }
      
      // 3秒待機
      if (i < 4) {
        console.log('   ⏳ 3秒待機...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    this.printDetailedStatistics();
    
    console.log('🎉 詳細テスト完了');
  }
}

// メイン実行
const monitor = new DetailedVRChatMonitor();
monitor.runDetailedTest().catch(error => {
  console.error('💥 テストエラー:', error);
});
