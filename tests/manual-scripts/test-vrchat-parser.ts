/**
 * VRChatLogParser 実地テスト用スクリプト
 * 
 * 実際のVRChatログデータを使用してパース処理をテスト
 */

import { MessageProcessor } from '../../src/log/MessageProcessor';
import { LogLevel, LogSource, LogMetadata } from '../../src/types';

// 実際のVRChatログサンプル
const sampleLogs = [
  // ワールド変化
  '2025.6.30 15:30:15 Log - [Behaviour] Joining wrld_4432ea9b-729c-46e3-8eaf-846aa0a37fdd~private(usr_c1aa1200-bffb-4685-a17a-a649e92318a5)~region(jp)',
  
  // プレイヤー入場
  '2025.6.30 15:31:22 Log - [Behaviour] OnPlayerJoined SampleUser (usr_12345678-abcd-1234-efgh-123456789012)',
  '2025.6.30 15:31:25 Log - [Behaviour] OnPlayerJoined Player Name With Spaces (usr_abcdef12-3456-7890-abcd-ef1234567890)',
  
  // プレイヤー退場
  '2025.6.30 15:45:10 Log - [Behaviour] OnPlayerLeft SampleUser (usr_12345678-abcd-1234-efgh-123456789012)',
  
  // その他のVRChatメッセージ
  '2025.6.30 15:46:33 Log - [Behaviour] Some other system message',
  '2025.6.30 15:47:01 Warning - [Network] Connection lost',
  
  // Udonメッセージ
  '2025.6.30 15:48:15 Log - [UdonBehaviour] PlayerController: OnInteract - button_id=5',
  '2025.6.30 15:48:16 Log - [UdonBehaviour] GameManager: {"event": "score_update", "player": "usr_123", "score": 1500}',
];

function runParsingTests() {
  console.log('=== VRChatログパース処理 実地テスト ===\n');
  
  const processor = new MessageProcessor();
  
  sampleLogs.forEach((logLine, index) => {
    console.log(`--- テスト ${index + 1} ---`);
    console.log(`入力: ${logLine}`);
    
    const metadata: LogMetadata = {
      source: LogSource.OTHER, // 初期判定
      filePath: '/test/sample.log',
      fileName: 'sample.log',
      timestamp: Date.now(),
      lineNumber: index + 1
    };
    
    const result = processor.processLogLine(logLine, metadata);
    
    if (result) {
      console.log(`ソース: ${result.source}`);
      console.log(`レベル: ${result.raw.level}`);
      
      if (result.parsed) {
        console.log(`パースタイプ: ${result.parsed.type}`);
        console.log(`信頼度: ${result.parsed.confidence}`);
        console.log(`データ:`, JSON.stringify(result.parsed.data, null, 2));
      } else {
        console.log('パース結果: なし');
      }
      
      console.log(`タグ: [${result.tags.join(', ')}]`);
    } else {
      console.log('解析失敗');
    }
    
    console.log('');
  });
  
  console.log('=== テスト完了 ===');
}

// スクリプト実行
runParsingTests();
