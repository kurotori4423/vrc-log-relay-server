/**
 * 修正されたVRChatLogParserの実地テスト
 * 実際の問題ケースを含むテスト
 */

import { MessageProcessor } from '../../src/log/MessageProcessor';
import { LogLevel, LogSource, LogMetadata } from '../../src/types';

function testFixedParser() {
  console.log('=== 修正されたVRChatLogParser 実地テスト ===\n');
  
  const processor = new MessageProcessor();
  
  // 実際に問題が発生していたログメッセージ（完全なログ行）
  const problemLog = '2025.6.30 15:45:10 Debug - [Behaviour] OnPlayerLeft kurotori (usr_f850bf8f-60bf-415f-86ea-26115070b497)';
  
  console.log(`問題ケース: ${problemLog}`);
  
  const metadata: LogMetadata = {
    source: LogSource.OTHER,
    filePath: '/test/sample.log',
    fileName: 'sample.log',
    timestamp: Date.now(),
    lineNumber: 1
  };
  
  const result = processor.processLogLine(problemLog, metadata);
  
  if (result) {
    console.log(`✅ 解析成功!`);
    console.log(`ソース: ${result.source}`);
    console.log(`パースタイプ: ${result.parsed?.type}`);
    console.log(`信頼度: ${Math.round((result.parsed?.confidence || 0) * 100)}%`);
    console.log(`ユーザー名: ${result.parsed?.data?.userName}`);
    console.log(`ユーザーID: ${result.parsed?.data?.userId}`);
    console.log(`タグ: [${result.tags.join(', ')}]`);
  } else {
    console.log('❌ 解析失敗');
  }
  
  console.log('\n=== その他のDebugプレフィックス付きテストケース ===\n');
  
  const additionalTests = [
    '2025.6.30 15:31:22 Debug - [Behaviour] OnPlayerJoined TestUser (usr_12345678-abcd-1234-efgh-123456789012)',
    '2025.6.30 15:30:15 Debug - [Behaviour] Joining wrld_test123~private(usr_abc456)~region(jp)',
    '2025.6.30 15:45:10 Warning - [Behaviour] OnPlayerLeft AnotherUser (usr_xyz789)',
    '2025.6.30 15:31:22 Error - [Behaviour] OnPlayerJoined ErrorUser (usr_error123)'
  ];
  
  additionalTests.forEach((testLog, index) => {
    console.log(`--- テスト ${index + 1} ---`);
    console.log(`入力: ${testLog}`);
    
    const testResult = processor.processLogLine(testLog, metadata);
    
    if (testResult) {
      console.log(`ソース: ${testResult.source}`);
      console.log(`パースタイプ: ${testResult.parsed?.type}`);
      console.log(`信頼度: ${Math.round((testResult.parsed?.confidence || 0) * 100)}%`);
    } else {
      console.log('解析失敗');
    }
    console.log('');
  });
  
  console.log('=== テスト完了 ===');
}

// テスト実行
testFixedParser();
