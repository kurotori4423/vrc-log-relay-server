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
}

// =============================================================================
// メインクラス
// =============================================================================

/**
 * MessageProcessor - ログメッセージ解析エンジン
 */
export class MessageProcessor {
  private parsers: LogParser[];
  private logger = logMessageProcessor;
  private logWatcher?: any; // VRChatLogWatcherの参照（循環参照回避のためany型）

  constructor(logWatcher?: any) {
    this.parsers = [];
    this.logWatcher = logWatcher;
    this.initializeDefaultParsers();
  }

  // =========================================================================
  // プライベートメソッド
  // =========================================================================

  /**
   * 静寂モード中かどうかを確認
   */
  private isInQuietModeNow(): boolean {
    if (!this.logWatcher) {
      return false;
    }
    // VRChatLogWatcherのisInQuietModeNowメソッドを呼び出し
    return typeof this.logWatcher.isInQuietModeNow === 'function' && 
           this.logWatcher.isInQuietModeNow();
  }

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

      // 静寂モード中でなければデバッグログを出力
      if (!this.isInQuietModeNow()) {
        this.logger('Processing log line', { lineLength: line.length });
      }

      // 1. 基本ログ形式の解析
      const basicParsed = this.parseBasicLogFormat(line);
      if (!basicParsed) {
        this.logger('Failed to parse basic log format', { line: line.substring(0, 100) });
        return null;
      }

      // 2. 特殊パーサーでの解析
      const detailedParsed = this.parseWithSpecializedParsers(basicParsed.content);

      // 3. 構造化メッセージの構築
      const processed = this.buildProcessedMessage(basicParsed, detailedParsed, metadata);

      // 静寂モード中でなければデバッグログを出力
      if (!this.isInQuietModeNow()) {
        this.logger('Successfully processed message', {
          messageId: processed.id,
          hasParsed: !!processed.parsed
        });
      }

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
    this.parsers.push(parser);
    this.logger('Parser added', { 
      parserName: parser.name
    });
  }

  /**
   * 登録されたパーサー一覧を取得
   * 
   * @returns パーサー情報の配列
   */
  getRegisteredParsers(): Array<{ name: string }> {
    return this.parsers.map(parser => ({ name: parser.name }));
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
      content: content.trim()
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
      content: content.trim()
    };
  }

  /**
   * プレーンテキストとしての処理
   */
  private parseAsPlainText(line: string): BasicLogData {
    return {
      timestamp: new Date(),
      level: LogLevel.INFO,
      content: line.trim()
    };
  }

  // =========================================================================
  // プライベートメソッド - 特殊解析
  // =========================================================================

  /**
   * 特殊パーサーでの解析
   * 
   * @param content ログ内容
   * @returns 解析済みデータ または null
   */
  private parseWithSpecializedParsers(content: string): ParsedLogData | null {
    // VRChatの特定イベント（プレイヤー参加、退出、ワールド変更）のみを解析
    for (const parser of this.parsers) {
      if (parser.name === 'VRChatLogParser' && parser.canParse(content)) {
        try {
          const result = parser.parse(content);
          if (result) {
            this.logger('VRChat event parser succeeded', { 
              parserName: parser.name,
              resultType: result.type
            });
            return result;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger('VRChat event parser failed', { 
            parserName: parser.name,
            error: errorMessage 
          });
          continue;
        }
      }
    }

    // フォールバック: 'other'タイプで処理
    return {
      type: 'other',
      data: { content }
    };
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
    
    // 詳細解析結果のタグ
    if (detailed) {
      tags.push(`type:${detailed.type}`);
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
    // VRChat特定パーサーの追加（プレイヤー参加、退出、ワールド変更のみ）
    this.addParser(new VRChatLogParser());
    
    this.logger('Default parsers initialized', { 
      parserCount: this.getRegisteredParsers().length 
    });
  }
}

// =============================================================================
// VRChatログパーサー実装
// =============================================================================

/**
 * VRChatLogParser - VRChat特定メッセージパーサー
 */
class VRChatLogParser implements LogParser {
  readonly name = 'VRChatLogParser';

  /**
   * VRChatログの解析パターン
   */
  private patterns = [
    {
      name: 'world_change',
      // ワールド変化: "Debug - [Behaviour] Joining wrld_{ワールドID}[:インスタンス番号]~private(usr_{ユーザーID})[~canRequestInvite]~region({サーバー国タイプ})"
      // ログレベルプレフィックス（Debug -、Log -、Warning -など）を考慮
      regex: /^(?:Debug|Log|Warning|Error)\s*-\s*\[Behaviour\]\s+Joining\s+(wrld_[a-zA-Z0-9_-]+)(?::(\d+))?~private\((usr_[a-zA-Z0-9_-]+)\)(?:~canRequestInvite)?~region\(([a-z]+)\)$|^\[Behaviour\]\s+Joining\s+(wrld_[a-zA-Z0-9_-]+)(?::(\d+))?~private\((usr_[a-zA-Z0-9_-]+)\)(?:~canRequestInvite)?~region\(([a-z]+)\)$/,
      handler: this.parseWorldChange.bind(this)
    },
    {
      name: 'player_join',
      // プレイヤー入場: "Debug - [Behaviour] OnPlayerJoined {ユーザー名} (usr_{ユーザーID})"
      // ログレベルプレフィックス（Debug -、Log -、Warning -など）を考慮
      regex: /^(?:Debug|Log|Warning|Error)\s*-\s*\[Behaviour\]\s+OnPlayerJoined\s+(.+?)\s+\((usr_[a-zA-Z0-9_-]+)\)$|^\[Behaviour\]\s+OnPlayerJoined\s+(.+?)\s+\((usr_[a-zA-Z0-9_-]+)\)$/,
      handler: this.parsePlayerJoin.bind(this)
    },
    {
      name: 'player_leave',
      // プレイヤー退場: "Debug - [Behaviour] OnPlayerLeft {ユーザー名} (usr_{ユーザーID})"
      // ログレベルプレフィックス（Debug -、Log -、Warning -など）を考慮
      regex: /^(?:Debug|Log|Warning|Error)\s*-\s*\[Behaviour\]\s+OnPlayerLeft\s+(.+?)\s+\((usr_[a-zA-Z0-9_-]+)\)$|^\[Behaviour\]\s+OnPlayerLeft\s+(.+?)\s+\((usr_[a-zA-Z0-9_-]+)\)$/,
      handler: this.parsePlayerLeave.bind(this)
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
          const result = pattern.handler(match);
          return {
            type: result.type,
            data: result.data
          };
        } catch (error) {
          continue; // 次のパターンを試行
        }
      }
    }

    return null;
  }

  /**
   * ワールド変化の解析
   */
  private parseWorldChange(match: RegExpMatchArray): { type: string; data: Record<string, any> } {
    // ログレベルプレフィックスありとなしの両方に対応
    // マッチグループ: [full, worldId1, instance1, userId1, region1, worldId2, instance2, userId2, region2]
    const worldId = match[1] || match[5];
    const instance = match[2] || match[6];
    const userId = match[3] || match[7];
    const region = match[4] || match[8];
    
    const data: Record<string, any> = {
      worldId: worldId,
      userId: userId,
      region: region,
      timestamp: Date.now()
    };

    // インスタンス番号が存在する場合は追加
    if (instance) {
      data.instance = parseInt(instance);
    }
    
    return {
      type: 'world_change',
      data: data
    };
  }

  /**
   * プレイヤー入場の解析
   */
  private parsePlayerJoin(match: RegExpMatchArray): { type: string; data: Record<string, any> } {
    // ログレベルプレフィックスありとなしの両方に対応
    // マッチグループ: [full, userName1, userId1, userName2, userId2]
    const userName = match[1] || match[3];
    const userId = match[2] || match[4];
    
    return {
      type: 'user_join',
      data: {
        userName: userName.trim(),
        userId: userId,
        timestamp: Date.now()
      }
    };
  }

  /**
   * プレイヤー退場の解析
   */
  private parsePlayerLeave(match: RegExpMatchArray): { type: string; data: Record<string, any> } {
    // ログレベルプレフィックスありとなしの両方に対応
    // マッチグループ: [full, userName1, userId1, userName2, userId2]
    const userName = match[1] || match[3];
    const userId = match[2] || match[4];
    
    return {
      type: 'user_leave',
      data: {
        userName: userName.trim(),
        userId: userId,
        timestamp: Date.now()
      }
    };
  }
}

// デフォルトエクスポート
export default MessageProcessor;
