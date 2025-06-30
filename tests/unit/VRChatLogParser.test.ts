/**
 * VRChatLogParser テストファイル
 * 
 * VRChatの特定メッセージ（ワールド変化、プレイヤー入場・退場）のパース処理をテスト
 */

import { MessageProcessor } from '../../src/log/MessageProcessor';
import { LogLevel, LogSource, LogMetadata } from '../../src/types';

describe('VRChatLogParser', () => {
  let processor: MessageProcessor;
  
  const createMetadata = (source: LogSource = LogSource.VRCHAT): LogMetadata => ({
    source,
    filePath: '/test/test.log',
    fileName: 'test.log',
    timestamp: Date.now(),
    lineNumber: 1
  });

  beforeEach(() => {
    processor = new MessageProcessor();
  });

  describe('ワールド変化の解析', () => {
    it('正常なワールド変化ログを解析できる', () => {
      const testLine = '2025.6.30 15:30:15 Log - [Behaviour] Joining wrld_abc123~private(usr_def456)~region(ja)';
      const metadata = createMetadata();

      const result = processor.processLogLine(testLine, metadata);

      expect(result).not.toBeNull();
      expect(result?.parsed?.type).toBe('world_change');
      expect(result?.parsed?.data).toEqual({
        worldId: 'abc123',
        userId: 'def456',
        region: 'ja',
        timestamp: expect.any(Number)
      });
      expect(result?.parsed?.confidence).toBe(0.95);
    });

    it('複雑なワールドIDとユーザーIDを正しく解析できる', () => {
      const testLine = '2025.6.30 15:30:15 Log - [Behaviour] Joining wrld_wrld_00000000-0000-0000-0000-000000000000~private(usr_usr_12345678-1234-1234-1234-123456789012)~region(us)';
      const metadata = createMetadata();

      const result = processor.processLogLine(testLine, metadata);

      expect(result).not.toBeNull();
      expect(result?.parsed?.type).toBe('world_change');
      expect(result?.parsed?.data.worldId).toBe('wrld_00000000-0000-0000-0000-000000000000');
      expect(result?.parsed?.data.userId).toBe('usr_12345678-1234-1234-1234-123456789012');
      expect(result?.parsed?.data.region).toBe('us');
    });
  });

  describe('プレイヤー入場の解析', () => {
    it('正常なプレイヤー入場ログを解析できる', () => {
      const testLine = '2025.6.30 15:31:22 Log - [Behaviour] OnPlayerJoined TestUser (usr_12345678)';
      const metadata = createMetadata();

      const result = processor.processLogLine(testLine, metadata);

      expect(result).not.toBeNull();
      expect(result?.parsed?.type).toBe('user_join');
      expect(result?.parsed?.data).toEqual({
        userName: 'TestUser',
        userId: '12345678',
        timestamp: expect.any(Number)
      });
      expect(result?.parsed?.confidence).toBe(0.95);
    });

    it('スペースを含むユーザー名を正しく解析できる', () => {
      const testLine = '2025.6.30 15:31:25 Log - [Behaviour] OnPlayerJoined Test User Name (usr_abcdef123)';
      const metadata = createMetadata();

      const result = processor.processLogLine(testLine, metadata);

      expect(result).not.toBeNull();
      expect(result?.parsed?.type).toBe('user_join');
      expect(result?.parsed?.data.userName).toBe('Test User Name');
      expect(result?.parsed?.data.userId).toBe('abcdef123');
    });

    it('Debugプレフィックス付きプレイヤー入場ログを解析できる', () => {
      const testLine = '2025.6.30 15:31:22 Debug - [Behaviour] OnPlayerJoined TestUser (usr_12345678-abcd-1234-efgh-123456789012)';
      const metadata = createMetadata();

      const result = processor.processLogLine(testLine, metadata);

      expect(result).not.toBeNull();
      expect(result?.parsed?.type).toBe('user_join');
      expect(result?.parsed?.data).toEqual({
        userName: 'TestUser',
        userId: '12345678-abcd-1234-efgh-123456789012',
        timestamp: expect.any(Number)
      });
      expect(result?.parsed?.confidence).toBe(0.95);
    });
  });

  describe('プレイヤー退場の解析', () => {
    it('正常なプレイヤー退場ログを解析できる', () => {
      const testLine = '2025.6.30 15:45:10 Log - [Behaviour] OnPlayerLeft TestUser (usr_12345678)';
      const metadata = createMetadata();

      const result = processor.processLogLine(testLine, metadata);

      expect(result).not.toBeNull();
      expect(result?.parsed?.type).toBe('user_leave');
      expect(result?.parsed?.data).toEqual({
        userName: 'TestUser',
        userId: '12345678',
        timestamp: expect.any(Number)
      });
      expect(result?.parsed?.confidence).toBe(0.95);
    });

    it('Debugプレフィックス付きプレイヤー退場ログを解析できる', () => {
      const testLine = '2025.6.30 15:45:10 Debug - [Behaviour] OnPlayerLeft kurotori (usr_f850bf8f-60bf-415f-86ea-26115070b497)';
      const metadata = createMetadata();

      const result = processor.processLogLine(testLine, metadata);

      expect(result).not.toBeNull();
      expect(result?.parsed?.type).toBe('user_leave');
      expect(result?.parsed?.data).toEqual({
        userName: 'kurotori',
        userId: 'f850bf8f-60bf-415f-86ea-26115070b497',
        timestamp: expect.any(Number)
      });
      expect(result?.parsed?.confidence).toBe(0.95);
    });
  });

  describe('その他のメッセージ', () => {
    it('判別できないVRChatメッセージは"other"として分類される', () => {
      const testLine = '2025.6.30 15:46:33 Log - [Behaviour] Some other message';
      const metadata = createMetadata();

      const result = processor.processLogLine(testLine, metadata);

      expect(result).not.toBeNull();
      expect(result?.parsed?.type).toBe('other');
      expect(result?.parsed?.data.content).toBe('[Behaviour] Some other message');
      expect(result?.parsed?.confidence).toBe(0.3);
    });

    it('Udonメッセージは別のパーサーで処理される', () => {
      const testLine = '2025.6.30 15:48:15 Log - [UdonBehaviour] CustomEvent: TestData';
      const metadata = createMetadata();

      const result = processor.processLogLine(testLine, metadata);

      expect(result).not.toBeNull();
      expect(result?.source).toBe(LogSource.UDON);
      expect(result?.parsed?.type).toBe('udon_event');
    });
  });

  describe('ソース判定の確認', () => {
    it('VRChat特定メッセージが正しくVRCHATソースと判定される', () => {
      const worldChangeLog = '2025.6.30 15:30:15 Log - [Behaviour] Joining wrld_test~private(usr_test)~region(ja)';
      const playerJoinLog = '2025.6.30 15:30:15 Log - [Behaviour] OnPlayerJoined Test (usr_test)';
      const playerLeaveLog = '2025.6.30 15:30:15 Log - [Behaviour] OnPlayerLeft Test (usr_test)';

      const metadata = createMetadata(LogSource.OTHER); // 初期ソースをOTHERに設定

      [worldChangeLog, playerJoinLog, playerLeaveLog].forEach(testLine => {
        const result = processor.processLogLine(testLine, metadata);
        expect(result).not.toBeNull();
        expect(result?.source).toBe(LogSource.VRCHAT);
      });
    });

    it('Debugプレフィックス付きメッセージが正しくVRCHATソースと判定される', () => {
      const debugPlayerLeaveLog = '2025.6.30 15:45:10 Debug - [Behaviour] OnPlayerLeft kurotori (usr_f850bf8f-60bf-415f-86ea-26115070b497)';
      const metadata = createMetadata(LogSource.OTHER);

      const result = processor.processLogLine(debugPlayerLeaveLog, metadata);
      expect(result).not.toBeNull();
      expect(result?.source).toBe(LogSource.VRCHAT);
      expect(result?.parsed?.type).toBe('user_leave');
    });
  });
});