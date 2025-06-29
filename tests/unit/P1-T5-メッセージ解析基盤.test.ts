/**
 * P1-T5: MessageProcessor テストファイル
 * 
 * テスト内容:
 * - 基本ログ形式の解析機能
 * - Udonログの特別処理
 * - パーサーシステム
 * - エラーハンドリング
 */

import MessageProcessor from '../../src/log/MessageProcessor';
import { LogLevel, LogSource, LogMetadata } from '../../src/types';

describe('MessageProcessor', () => {
  let processor: MessageProcessor;
  let mockMetadata: LogMetadata;

  beforeEach(() => {
    processor = new MessageProcessor();
    mockMetadata = {
      source: LogSource.VRCHAT,
      filePath: 'C:\\test\\output_log_test.txt',
      fileName: 'output_log_test.txt',
      timestamp: Date.now(),
      lineNumber: 1
    };
  });

  describe('基本ログ形式の解析', () => {
    test('標準VRChatログ形式を解析できる', () => {
      const logLine = '2025.6.30 15:30:15 Log        -  [Network] Successfully joined instance';
      const result = processor.processLogLine(logLine, mockMetadata);

      expect(result).not.toBeNull();
      expect(result!.raw.level).toBe(LogLevel.INFO);
      expect(result!.raw.content).toBe('[Network] Successfully joined instance');
      expect(result!.source).toBe(LogSource.NETWORK);
    });

    test('警告レベルのログを正しく解析する', () => {
      const logLine = '2025.6.30 15:30:15 Warning     -  Something went wrong';
      const result = processor.processLogLine(logLine, mockMetadata);

      expect(result).not.toBeNull();
      expect(result!.raw.level).toBe(LogLevel.WARNING);
      expect(result!.raw.content).toBe('Something went wrong');
    });

    test('エラーレベルのログを正しく解析する', () => {
      const logLine = '2025.6.30 15:30:15 Error       -  Critical error occurred';
      const result = processor.processLogLine(logLine, mockMetadata);

      expect(result).not.toBeNull();
      expect(result!.raw.level).toBe(LogLevel.ERROR);
      expect(result!.raw.content).toBe('Critical error occurred');
    });
  });

  describe('Udonログの解析', () => {
    test('基本的なUdonログを解析できる', () => {
      const logLine = '[UdonBehaviour] PlayerTracker: Player joined - Alice';
      const result = processor.processLogLine(logLine, mockMetadata);

      expect(result).not.toBeNull();
      expect(result!.source).toBe(LogSource.UDON);
      expect(result!.parsed).toBeDefined();
      expect(result!.parsed!.type).toBe('udon_event');
    });

    test('Udonメソッド呼び出しを解析できる', () => {
      const logLine = '[UdonBehaviour] GameManager.StartGame(players=4, mode=battle)';
      const result = processor.processLogLine(logLine, mockMetadata);

      expect(result).not.toBeNull();
      expect(result!.source).toBe(LogSource.UDON);
      expect(result!.parsed).toBeDefined();
      expect(result!.parsed!.type).toBe('udon_event');
      
      // 解析されたデータの確認
      const data = result!.parsed!.data;
      expect(data.objectName).toBe('GameManager');
      expect(data.methodName).toBe('StartGame');
    });

    test('UdonJSONイベントを解析できる', () => {
      const logLine = '[UdonBehaviour] GameEvent: {"type": "score", "player": "Alice", "value": 100}';
      const result = processor.processLogLine(logLine, mockMetadata);

      expect(result).not.toBeNull();
      expect(result!.source).toBe(LogSource.UDON);
      expect(result!.parsed).toBeDefined();
      
      const data = result!.parsed!.data;
      expect(data.eventType).toBe('GameEvent');
      expect(data.customData.type).toBe('score');
      expect(data.customData.player).toBe('Alice');
      expect(data.customData.value).toBe(100);
    });
  });

  describe('無効なログの処理', () => {
    test('空行は無視される', () => {
      const result = processor.processLogLine('', mockMetadata);
      expect(result).toBeNull();
    });

    test('空白のみの行は無視される', () => {
      const result = processor.processLogLine('   ', mockMetadata);
      expect(result).toBeNull();
    });

    test('認識できない形式はプレーンテキストとして処理される', () => {
      const logLine = 'Some random text without proper format';
      const result = processor.processLogLine(logLine, mockMetadata);

      expect(result).not.toBeNull();
      expect(result!.source).toBe(LogSource.OTHER);
      expect(result!.raw.content).toBe('Some random text without proper format');
    });
  });

  describe('ソース推定機能', () => {
    test('ネットワーク関連のログを正しく分類する', () => {
      const logLine = '2025.6.30 15:30:15 Log        -  [Network] Connection established';
      const result = processor.processLogLine(logLine, mockMetadata);

      expect(result).not.toBeNull();
      expect(result!.source).toBe(LogSource.NETWORK);
    });

    test('VRChat関連のログを正しく分類する', () => {
      const logLine = '2025.6.30 15:30:15 Log        -  VRChat system ready';
      const result = processor.processLogLine(logLine, mockMetadata);

      expect(result).not.toBeNull();
      expect(result!.source).toBe(LogSource.VRCHAT);
    });
  });

  describe('タグ生成機能', () => {
    test('基本タグが正しく生成される', () => {
      const logLine = '2025.6.30 15:30:15 Warning     -  Test warning message';
      const result = processor.processLogLine(logLine, mockMetadata);

      expect(result).not.toBeNull();
      expect(result!.tags).toContain('level:warning');
      expect(result!.tags).toContain('source:other');
    });

    test('Udonログのタグが正しく生成される', () => {
      const logLine = '[UdonBehaviour] Test: data';
      const result = processor.processLogLine(logLine, mockMetadata);

      expect(result).not.toBeNull();
      expect(result!.tags).toContain('level:info');
      expect(result!.tags).toContain('source:udon');
      expect(result!.tags).toContain('type:udon_event');
    });
  });

  describe('パーサー管理機能', () => {
    test('デフォルトパーサーが登録されている', () => {
      const parsers = processor.getRegisteredParsers();
      expect(parsers.length).toBeGreaterThan(0);
      
      const udonParser = parsers.find(p => p.name === 'UdonLogParser');
      expect(udonParser).toBeDefined();
      expect(udonParser!.source).toBe(LogSource.UDON);
    });
  });

  describe('メッセージID生成', () => {
    test('各メッセージに一意のIDが生成される', () => {
      const logLine = '2025.6.30 15:30:15 Log        -  Test message';
      
      const result1 = processor.processLogLine(logLine, mockMetadata);
      const result2 = processor.processLogLine(logLine, mockMetadata);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result1!.id).not.toBe(result2!.id);
    });

    test('IDが適切な形式で生成される', () => {
      const logLine = '2025.6.30 15:30:15 Log        -  Test message';
      const result = processor.processLogLine(logLine, mockMetadata);

      expect(result).not.toBeNull();
      expect(result!.id).toMatch(/^msg-\d+-[a-z0-9]+$/);
    });
  });

  describe('エラーハンドリング', () => {
    test('不正なタイムスタンプでもエラーにならない', () => {
      const logLine = 'invalid.timestamp Log - Test message';
      const result = processor.processLogLine(logLine, mockMetadata);

      // プレーンテキストとして処理される
      expect(result).not.toBeNull();
      expect(result!.source).toBe(LogSource.OTHER);
    });
  });
});

// サンプルデータを使った統合テスト
describe('MessageProcessor 統合テスト', () => {
  let processor: MessageProcessor;
  let mockMetadata: LogMetadata;

  beforeEach(() => {
    processor = new MessageProcessor();
    mockMetadata = {
      source: LogSource.VRCHAT,
      filePath: 'C:\\test\\output_log_test.txt',
      fileName: 'output_log_test.txt',
      timestamp: Date.now(),
      lineNumber: 1
    };
  });

  test('複数のログ形式を順次処理できる', () => {
    const logLines = [
      '2025.6.30 15:30:15 Log        -  [Network] Connection started',
      '[UdonBehaviour] PlayerTracker: Player joined - Alice',
      '2025.6.30 15:30:16 Warning    -  Low memory warning',
      '[UdonBehaviour] GameManager.EndGame(winner=Alice, score=1500)',
      '2025.6.30 15:30:17 Error      -  Connection lost'
    ];

    const results = logLines.map((line, index) => {
      const metadata = { ...mockMetadata, lineNumber: index + 1 };
      return processor.processLogLine(line, metadata);
    });

    // すべて正常に処理される
    expect(results.every(r => r !== null)).toBe(true);
    
    // ソースが正しく分類される
    expect(results[0]!.source).toBe(LogSource.NETWORK);
    expect(results[1]!.source).toBe(LogSource.UDON);
    expect(results[2]!.source).toBe(LogSource.OTHER);
    expect(results[3]!.source).toBe(LogSource.UDON);
    expect(results[4]!.source).toBe(LogSource.OTHER);

    // Udonログが解析される
    expect(results[1]!.parsed).toBeDefined();
    expect(results[3]!.parsed).toBeDefined();
  });

  test('パフォーマンス: 100件のログを高速処理できる', () => {
    const logLine = '2025.6.30 15:30:15 Log        -  [Network] Test message';
    const startTime = Date.now();

    for (let i = 0; i < 100; i++) {
      const metadata = { ...mockMetadata, lineNumber: i + 1 };
      const result = processor.processLogLine(logLine, metadata);
      expect(result).not.toBeNull();
    }

    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    // 100件を1秒以内で処理できること
    expect(processingTime).toBeLessThan(1000);
  });
});
