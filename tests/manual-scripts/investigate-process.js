/**
 * VRChatプロセス詳細調査スクリプト
 * 
 * 検知されているプロセスの詳細情報を表示
 * 
 * @created 2025-06-30
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class ProcessInvestigator {
  async investigateProcess(pid) {
    console.log(`🔍 PID ${pid} の詳細調査`);
    console.log('=====================================\n');
    
    try {
      // 1. 基本プロセス情報
      console.log('📊 基本プロセス情報:');
      const { stdout: basicInfo } = await execAsync(
        `wmic process where "ProcessId=${pid}" get Name,ProcessId,CommandLine,ExecutablePath /format:list`
      );
      console.log(basicInfo);
      
      // 2. プロセスの親子関係
      console.log('\n👨‍👩‍👧‍👦 プロセスの親子関係:');
      const { stdout: parentInfo } = await execAsync(
        `wmic process where "ProcessId=${pid}" get ParentProcessId,ProcessId /format:list`
      );
      console.log(parentInfo);
      
      // 3. 全VRChat関連プロセス
      console.log('\n🎮 全VRChat関連プロセス:');
      const { stdout: allVRChat } = await execAsync(
        'wmic process where "commandline like \'%VRChat%\'" get ProcessId,Name,CommandLine /format:csv'
      );
      
      const lines = allVRChat.split('\n').filter(line => 
        line.trim() && !line.includes('CommandLine,Name,ProcessId')
      );
      
      lines.forEach((line, index) => {
        if (line.includes('VRChat')) {
          const parts = line.split(',');
          if (parts.length >= 3) {
            const cmdLine = parts[0];
            const name = parts[1];
            const processId = parts[2];
            
            console.log(`   ${index + 1}. PID: ${processId}`);
            console.log(`      名前: ${name}`);
            console.log(`      コマンドライン: ${cmdLine.substring(0, 100)}...`);
            console.log('');
          }
        }
      });
      
      // 4. プロセスが実際にVRChatゲームかチェック
      console.log('\n🎯 VRChatゲーム判定:');
      const { stdout: detailedCmd } = await execAsync(
        `wmic process where "ProcessId=${pid}" get CommandLine /format:value`
      );
      
      const cmdLines = detailedCmd.split('\n').filter(line => line.includes('CommandLine='));
      if (cmdLines.length > 0) {
        const fullCommand = cmdLines[0].replace('CommandLine=', '').trim();
        console.log(`   完全コマンドライン: ${fullCommand}`);
        
        // 判定ロジック
        const isLauncher = fullCommand.toLowerCase().includes('launcher');
        const isUpdater = fullCommand.toLowerCase().includes('updater');
        const isInstaller = fullCommand.toLowerCase().includes('installer');
        const isCrashHandler = fullCommand.toLowerCase().includes('crash');
        const isUnityGame = fullCommand.includes('-batchmode') === false && 
                           fullCommand.includes('VRChat.exe') && 
                           !isLauncher && !isUpdater && !isInstaller && !isCrashHandler;
        
        console.log(`\n   🔍 判定結果:`);
        console.log(`      ランチャー: ${isLauncher ? '✅' : '❌'}`);
        console.log(`      アップデーター: ${isUpdater ? '✅' : '❌'}`);
        console.log(`      インストーラー: ${isInstaller ? '✅' : '❌'}`);
        console.log(`      クラッシュハンドラー: ${isCrashHandler ? '✅' : '❌'}`);
        console.log(`      VRChatゲーム本体: ${isUnityGame ? '✅' : '❌'}`);
        
        if (!isUnityGame) {
          console.log(`\n   ⚠️  このプロセスはVRChatゲーム本体ではありません！`);
        }
      }
      
    } catch (error) {
      console.error('❌ 調査エラー:', error.message);
    }
  }

  async findAllVRChatProcesses() {
    console.log('\n🔍 すべてのVRChat関連プロセスを検索中...\n');
    
    try {
      // より広範囲な検索
      const searchTerms = ['VRChat', 'vrchat', 'Unity', 'unity'];
      
      for (const term of searchTerms) {
        console.log(`🔎 "${term}" で検索:`);
        
        try {
          const { stdout } = await execAsync(
            `wmic process where "commandline like '%${term}%'" get ProcessId,Name,CommandLine /format:csv`,
            { timeout: 10000 }
          );
          
          const lines = stdout.split('\n').filter(line => 
            line.trim() && 
            !line.includes('CommandLine,Name,ProcessId') &&
            line.toLowerCase().includes(term.toLowerCase())
          );
          
          if (lines.length > 0) {
            lines.forEach((line, index) => {
              const parts = line.split(',');
              if (parts.length >= 3) {
                const cmdLine = parts[0];
                const name = parts[1];
                const processId = parts[2];
                
                console.log(`   ${index + 1}. PID: ${processId} - ${name}`);
              }
            });
          } else {
            console.log(`   見つかりませんでした`);
          }
        } catch (error) {
          console.log(`   検索エラー: ${error.message}`);
        }
        
        console.log('');
      }
      
    } catch (error) {
      console.error('❌ 全体検索エラー:', error.message);
    }
  }
}

// メイン実行
async function main() {
  const investigator = new ProcessInvestigator();
  
  // コマンドライン引数からPIDを取得
  const targetPid = process.argv[2] || '31104';
  
  console.log('🕵️ VRChatプロセス詳細調査開始\n');
  
  // 指定されたPIDの詳細調査
  await investigator.investigateProcess(targetPid);
  
  // 全VRChat関連プロセスの検索
  await investigator.findAllVRChatProcesses();
  
  console.log('🎉 調査完了');
}

main().catch(error => {
  console.error('💥 調査失敗:', error);
});
