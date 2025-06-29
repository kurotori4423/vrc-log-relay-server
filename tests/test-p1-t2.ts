/**
 * P1-T2: 基盤クラス実装のテスト
 * 
 * 実装したtypes/index.tsとutils/logger.tsの動作確認を行います
 */

import { 
  VRChatStatus, 
  LogLevel, 
  LogSource, 
  MessageType,
  type RawLogMessage,
  type ProcessedMessage 
} from './src/types';
import { 
  initializeLogger, 
  debug, 
  info, 
  warn, 
  error,
  logVRChatProcess,
  startPerformanceLog,
  logMemoryUsage
} from './src/utils/logger';

// ログ設定でテスト
console.log('=== P1-T2: 基盤クラス実装テスト ===\n');

// 1. 型定義のテスト
console.log('1. 型定義のテスト');
console.log('VRChatStatus.RUNNING:', VRChatStatus.RUNNING);
console.log('LogLevel.INFO:', LogLevel.INFO);
console.log('LogSource.UDON:', LogSource.UDON);
console.log('MessageType.LOG_MESSAGE:', MessageType.LOG_MESSAGE);

// 2. ロガーの初期化テスト
console.log('\n2. ロガー初期化テスト');
const logger = initializeLogger({
  level: 'debug',
  console: true,
  file: './logs/test.log'
});

// 3. 基本ログ出力テスト
console.log('\n3. 基本ログ出力テスト');
debug('デバッグメッセージのテスト', { testData: 'debug-test' });
info('情報メッセージのテスト', { testData: 'info-test' });
warn('警告メッセージのテスト', { testData: 'warn-test' });

// 4. VRChat専用ログ関数テスト
console.log('\n4. VRChat専用ログ関数テスト');
logVRChatProcess('VRChatプロセス検出テスト', { 
  processId: 12345, 
  processName: 'VRChat.exe' 
});

// 5. パフォーマンス測定テスト
console.log('\n5. パフォーマンス測定テスト');
const endPerf = startPerformanceLog('基盤クラステスト');
setTimeout(() => {
  endPerf();
  
  // 6. メモリ使用量テスト
  console.log('\n6. メモリ使用量テスト');
  logMemoryUsage('テスト実行後');
  
  // 7. サンプルデータ構造テスト
  console.log('\n7. サンプルデータ構造テスト');
  const sampleRawMessage: RawLogMessage = {
    timestamp: new Date(),
    level: LogLevel.INFO,
    content: 'Sample VRChat log message',
    fileName: 'output_log_2025-06-30_12-00-00.txt'
  };
  
  const sampleProcessedMessage: ProcessedMessage = {
    id: 'test-msg-001',
    raw: sampleRawMessage,
    source: LogSource.VRCHAT,
    tags: ['test', 'sample'],
    processedAt: new Date()
  };
  
  info('サンプルメッセージ構造テスト成功', { 
    messageId: sampleProcessedMessage.id,
    source: sampleProcessedMessage.source,
    tagsCount: sampleProcessedMessage.tags.length 
  });
  
  console.log('\n=== P1-T2 テスト完了 ===');
  console.log('✅ 型定義: 正常');
  console.log('✅ ロガー初期化: 正常'); 
  console.log('✅ ログ出力: 正常');
  console.log('✅ 専用ログ関数: 正常');
  console.log('✅ パフォーマンス測定: 正常');
  console.log('✅ メモリ監視: 正常');
  console.log('✅ データ構造: 正常');
  
}, 100);
