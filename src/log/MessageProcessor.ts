/**
 * MessageProcessor - VRChatログメッセージ解析エンジン
 * 
 * 責任:
 * - VRChatの生ログを構造化データに変換
 * - Udonログの特別処理
 * - ログレベル・ソース分類
 * - プラグイン可能なパーサーシステム
 */

import {
  RawLogMessage,
  ProcessedMessage,
  ParsedLogData,
  LogLevel,
  LogSource,
  LogMetadata
} from '../types';
import { logMessageProcessor } from '../utils/logger';

// =============================================================================
// パーサーインターフェース
// =============================================================================

/**
 * ログパーサーインターフェース
 */
interface LogParser {
  /** パーサー名 */
  readonly name: string;
  /** 対象とするソース */
  readonly targetSource: LogSource;
  /** ログ行を解析 */
  parse(content: string): ParsedLogData | null;
  /** パターンマッチング */
  canParse(content: string): boolean;
}

/**
 * 基本ログ解析結果
 */
interface BasicLogData {
  /** タイムスタンプ */
  timestamp: Date;
  /** ログレベル */
  level: LogLevel;
  /** ログ内容 */
  content: string;
  /** 推定ソース */
  estimatedSource: LogSource;
}

/**
 * Udonログデータ
 */
interface UdonLogData {
  /** オブジェクト名 */
  objectName?: string;
  /** メソッド名 */
  methodName?: string;
  /** イベントタイプ */
  eventType?: string;
  /** パラメータ */
  parameters?: any[];
  /** カスタムデータ */
  customData?: Record<string, any>;
  /** 信頼度 */
  confidence: number;
}

// =============================================================================
// メインクラス
// =============================================================================

/**
 * MessageProcessor - ログメッセージ解析エンジン
 */
export class MessageProcessor {
  private parsers: Map<LogSource, LogParser[]>;
  private logger = logMessageProcessor;

  constructor() {
    this.parsers = new Map();
    this.initializeDefaultParsers();
  }

  // =========================================================================
  // パブリックメソッド
  // =========================================================================

  /**
   * ログ行を解析して構造化メッセージに変換
   * 
   * @param line ログ行
   * @param metadata ログメタデータ
   * @returns 構造化メッセージ または null
   */
  processLogLine(line: string, metadata: LogMetadata): ProcessedMessage | null {
    try {
      // 空行・無効行のスキップ
      if (!line || line.trim().length === 0) {
        return null;
      }

      this.logger('Processing log line', { lineLength: line.length });

      // 1. 基本ログ形式の解析
      const basicParsed = this.parseBasicLogFormat(line);
      if (!basicParsed) {
        this.logger('Failed to parse basic log format', { line: line.substring(0, 100) });
        return null;
      }

      // 2. ソース別特殊解析
      const detailedParsed = this.parseWithSpecializedParsers(
        basicParsed.content,
        basicParsed.estimatedSource
      );

      // 3. 構造化メッセージの構築
      const processed = this.buildProcessedMessage(basicParsed, detailedParsed, metadata);

      this.logger('Successfully processed message', {
        messageId: processed.id,
        source: processed.source,
        hasParsed: !!processed.parsed
      });

      return processed;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger('Error processing log line', { error: errorMessage, line });
      return null;
    }
  }

  /**
   * パーサーの追加
   * 
   * @param parser 追加するパーサー
   */
  addParser(parser: LogParser): void {
    if (!this.parsers.has(parser.targetSource)) {
      this.parsers.set(parser.targetSource, []);
    }
    
    this.parsers.get(parser.targetSource)!.push(parser);
    this.logger('Parser added', { 
      parserName: parser.name, 
      targetSource: parser.targetSource 
    });
  }

  /**
   * 登録されたパーサー一覧を取得
   * 
   * @returns パーサー情報の配列
   */
  getRegisteredParsers(): Array<{ name: string; source: LogSource }> {
    const result: Array<{ name: string; source: LogSource }> = [];
    
    this.parsers.forEach((parsers, source) => {
      parsers.forEach(parser => {
        result.push({ name: parser.name, source });
      });
    });
    
    return result;
  }

  // =========================================================================
  // プライベートメソッド - 基本解析
  // =========================================================================

  /**
   * 基本ログ形式の解析
   * 
   * @param line ログ行
   * @returns 基本解析結果 または null
   */
  private parseBasicLogFormat(line: string): BasicLogData | null {
    // VRChatの標準ログ形式パターン
    const patterns = [
      {
        // 標準形式: "2025.6.30 15:30:15 Log - Content"
        regex: /^(\d{4}\.\d{1,2}\.\d{1,2} \d{2}:\d{2}:\d{2})\s+(Log|Warning|Error|Exception)\s*-\s*(.+)$/,
        handler: this.parseStandardFormat.bind(this)
      },
      {
        // Udon形式: "[UdonBehaviour] Content"
        regex: /^\[UdonBehaviour\]\s*(.+)$/,
        handler: this.parseUdonFormat.bind(this)
      },
      {
        // その他のVRChatログ形式
        regex: /^(\d{4}\.\d{1,2}\.\d{1,2} \d{2}:\d{2}:\d{2})\s+(.+)$/,
        handler: this.parseGenericFormat.bind(this)
      }
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (match) {
        try {
          return pattern.handler(match, line);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger('Pattern parsing failed', { 
            error: errorMessage, 
            pattern: pattern.regex.source 
          });
          continue;
        }
      }
    }

    // フォールバック: プレーンテキストとして処理
    return this.parseAsPlainText(line);
  }

  /**
   * 標準VRChatログ形式の処理
   */
  private parseStandardFormat(match: RegExpMatchArray, line: string): BasicLogData {
    const [, timestampStr, levelStr, content] = match;
    
    return {
      timestamp: this.parseTimestamp(timestampStr),
      level: this.parseLogLevel(levelStr),
      content: content.trim(),
      estimatedSource: this.estimateSource(content)
    };
  }

  /**
   * Udonログ形式の処理
   */
  private parseUdonFormat(match: RegExpMatchArray, line: string): BasicLogData {
    const [, content] = match;
    
    return {
      timestamp: new Date(), // Udonログは通常タイムスタンプなし
      level: LogLevel.INFO,
      content: content.trim(),
      estimatedSource: LogSource.UDON
    };
  }

  /**
   * 汎用ログ形式の処理
   */
  private parseGenericFormat(match: RegExpMatchArray, line: string): BasicLogData {
    const [, timestampStr, content] = match;
    
    return {
      timestamp: this.parseTimestamp(timestampStr),
      level: LogLevel.INFO,
      content: content.trim(),
      estimatedSource: this.estimateSource(content)
    };
  }

  /**
   * プレーンテキストとしての処理
   */
  private parseAsPlainText(line: string): BasicLogData {
    return {
      timestamp: new Date(),
      level: LogLevel.INFO,
      content: line.trim(),
      estimatedSource: LogSource.OTHER
    };
  }

  // =========================================================================
  // プライベートメソッド - 特殊解析
  // =========================================================================

  /**
   * ソース別特殊パーサーでの解析
   * 
   * @param content ログ内容
   * @param source 推定ソース
   * @returns 解析済みデータ または null
   */
  private parseWithSpecializedParsers(content: string, source: LogSource): ParsedLogData | null {
    const parsers = this.parsers.get(source) || [];
    
    for (const parser of parsers) {
      if (parser.canParse(content)) {
        try {
          const result = parser.parse(content);
          if (result) {
            this.logger('Specialized parser succeeded', { 
              parserName: parser.name,
              resultType: result.type 
            });
            return result;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger('Specialized parser failed', { 
            parserName: parser.name,
            error: errorMessage 
          });
          continue;
        }
      }
    }

    return null;
  }

  /**
   * 構造化メッセージの構築
   * 
   * @param basic 基本解析結果
   * @param detailed 詳細解析結果
   * @param metadata メタデータ
   * @returns 構造化メッセージ
   */
  private buildProcessedMessage(
    basic: BasicLogData,
    detailed: ParsedLogData | null,
    metadata: LogMetadata
  ): ProcessedMessage {
    // RawLogMessage の構築
    const rawMessage: RawLogMessage = {
      timestamp: basic.timestamp,
      level: basic.level,
      content: basic.content,
      fileName: metadata.fileName,
      lineNumber: metadata.lineNumber
    };

    // ProcessedMessage の構築
    const processed: ProcessedMessage = {
      id: this.generateMessageId(),
      raw: rawMessage,
      source: basic.estimatedSource,
      parsed: detailed || undefined,
      tags: this.generateTags(basic, detailed),
      processedAt: new Date()
    };

    return processed;
  }

  // =========================================================================
  // プライベートメソッド - ユーティリティ
  // =========================================================================

  /**
   * タイムスタンプ文字列の解析
   * 
   * @param timestampStr タイムスタンプ文字列
   * @returns Dateオブジェクト
   */
  private parseTimestamp(timestampStr: string): Date {
    try {
      // VRChat形式: "2025.6.30 15:30:15"
      const [datePart, timePart] = timestampStr.split(' ');
      const [year, month, day] = datePart.split('.').map(Number);
      const [hour, minute, second] = timePart.split(':').map(Number);
      
      return new Date(year, month - 1, day, hour, minute, second);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger('Timestamp parsing failed', { 
        timestampStr, 
        error: errorMessage 
      });
      return new Date(); // フォールバック
    }
  }

  /**
   * ログレベルの解析
   * 
   * @param levelStr ログレベル文字列
   * @returns LogLevel
   */
  private parseLogLevel(levelStr: string): LogLevel {
    const levelMap: Record<string, LogLevel> = {
      'Log': LogLevel.INFO,
      'Warning': LogLevel.WARNING,
      'Error': LogLevel.ERROR,
      'Exception': LogLevel.ERROR,
      'Debug': LogLevel.DEBUG
    };

    return levelMap[levelStr] || LogLevel.INFO;
  }

  /**
   * ログソースの推定
   * 
   * @param content ログ内容
   * @returns 推定ソース
   */
  private estimateSource(content: string): LogSource {
    const patterns = [
      { regex: /\[UdonBehaviour\]|\[Udon\]/i, source: LogSource.UDON },
      { regex: /\[Network\]|\[Networking\]/i, source: LogSource.NETWORK },
      { regex: /VRChat|VRC/i, source: LogSource.VRCHAT }
    ];

    for (const pattern of patterns) {
      if (pattern.regex.test(content)) {
        return pattern.source;
      }
    }

    return LogSource.OTHER;
  }

  /**
   * フィルタリング用タグの生成
   * 
   * @param basic 基本解析結果
   * @param detailed 詳細解析結果
   * @returns タグ配列
   */
  private generateTags(basic: BasicLogData, detailed: ParsedLogData | null): string[] {
    const tags: string[] = [];

    // レベルタグ
    tags.push(`level:${basic.level}`);
    
    // ソースタグ
    tags.push(`source:${basic.estimatedSource}`);
    
    // 詳細解析結果のタグ
    if (detailed) {
      tags.push(`type:${detailed.type}`);
      if (detailed.confidence > 0.8) {
        tags.push('high-confidence');
      }
    }

    return tags;
  }

  /**
   * メッセージIDの生成
   * 
   * @returns UUID
   */
  private generateMessageId(): string {
    // 簡単なUUID v4形式の生成（外部ライブラリ依存を避ける）
    return 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  // =========================================================================
  // プライベートメソッド - デフォルトパーサー初期化
  // =========================================================================

  /**
   * デフォルトパーサーの初期化
   */
  private initializeDefaultParsers(): void {
    // Udonパーサーの追加
    this.addParser(new UdonLogParser());
    
    // その他のデフォルトパーサーは将来追加予定
    this.logger('Default parsers initialized', { 
      parserCount: this.getRegisteredParsers().length 
    });
  }
}

// =============================================================================
// デフォルトパーサー実装
// =============================================================================

/**
 * UdonLogParser - Udon専用パーサー
 */
class UdonLogParser implements LogParser {
  readonly name = 'UdonLogParser';
  readonly targetSource = LogSource.UDON;

  /**
   * Udonログの解析パターン
   */
  private patterns = [
    {
      name: 'json_data',
      // "EventName: {json}" - JSON形式を最優先で処理
      regex: /^(.+?):\s*(\{.+\})$/,
      handler: this.parseJsonEvent.bind(this)
    },
    {
      name: 'object_event',
      // "ObjectName: EventType - Data"
      regex: /^(.+?):\s*(.+?)\s*-\s*(.+)$/,
      handler: this.parseObjectEvent.bind(this)
    },
    {
      name: 'method_call',
      // "ObjectName.MethodName(params)"
      regex: /^(.+?)\.(.+?)\((.+?)\)$/,
      handler: this.parseMethodCall.bind(this)
    },
    {
      name: 'simple_event',
      // "ObjectName: Data"
      regex: /^(.+?):\s*(.+)$/,
      handler: this.parseSimpleEvent.bind(this)
    }
  ];

  canParse(content: string): boolean {
    return this.patterns.some(pattern => pattern.regex.test(content));
  }

  parse(content: string): ParsedLogData | null {
    for (const pattern of this.patterns) {
      const match = content.match(pattern.regex);
      if (match) {
        try {
          const udonData = pattern.handler(match);
          return {
            type: 'udon_event',
            data: udonData,
            confidence: 0.9
          };
        } catch (error) {
          continue; // 次のパターンを試行
        }
      }
    }

    return null;
  }

  /**
   * オブジェクトイベントの解析
   */
  private parseObjectEvent(match: RegExpMatchArray): UdonLogData {
    const [, objectName, eventType, eventData] = match;
    
    return {
      objectName: objectName.trim(),
      eventType: eventType.trim(),
      customData: this.parseEventData(eventData.trim()),
      confidence: 0.9
    };
  }

  /**
   * メソッド呼び出しの解析
   */
  private parseMethodCall(match: RegExpMatchArray): UdonLogData {
    const [, objectName, methodName, paramString] = match;
    
    return {
      objectName: objectName.trim(),
      methodName: methodName.trim(),
      parameters: this.parseParameters(paramString.trim()),
      confidence: 0.9
    };
  }

  /**
   * シンプルイベントの解析
   */
  private parseSimpleEvent(match: RegExpMatchArray): UdonLogData {
    const [, objectName, data] = match;
    
    return {
      objectName: objectName.trim(),
      eventType: 'custom',
      customData: { value: data.trim() },
      confidence: 0.7
    };
  }

  /**
   * JSONイベントの解析
   */
  private parseJsonEvent(match: RegExpMatchArray): UdonLogData {
    const [, eventName, jsonString] = match;
    
    try {
      const jsonData = JSON.parse(jsonString);
      return {
        eventType: eventName.trim(),
        customData: jsonData,
        confidence: 0.95
      };
    } catch (error) {
      return {
        eventType: eventName.trim(),
        customData: { raw: jsonString },
        confidence: 0.5
      };
    }
  }

  /**
   * イベントデータの解析
   */
  private parseEventData(dataString: string): Record<string, any> {
    try {
      // JSON形式の場合
      if (dataString.startsWith('{') && dataString.endsWith('}')) {
        return JSON.parse(dataString);
      }
      
      // キー=値形式の場合
      if (dataString.includes('=')) {
        return this.parseKeyValuePairs(dataString);
      }
      
      // プレーンテキストの場合
      return { value: dataString };
      
    } catch (error) {
      return { value: dataString };
    }
  }

  /**
   * パラメータ文字列の解析
   */
  private parseParameters(paramString: string): any[] {
    try {
      const params = paramString.split(',').map(p => p.trim());
      return params.map(param => this.parseValue(param));
    } catch (error) {
      return [paramString];
    }
  }

  /**
   * キー=値ペアの解析
   */
  private parseKeyValuePairs(input: string): Record<string, any> {
    const result: Record<string, any> = {};
    const pairs = input.split(',').map(p => p.trim());
    
    for (const pair of pairs) {
      const [key, value] = pair.split('=').map(s => s.trim());
      if (key && value !== undefined) {
        result[key] = this.parseValue(value);
      }
    }
    
    return result;
  }

  /**
   * 値の型変換
   */
  private parseValue(value: string): any {
    // 数値変換試行
    if (/^-?\d+$/.test(value)) {
      return parseInt(value);
    }
    if (/^-?\d*\.\d+$/.test(value)) {
      return parseFloat(value);
    }
    
    // ブール値
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // 文字列（引用符除去）
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    
    return value;
  }
}

// デフォルトエクスポート
export default MessageProcessor;
