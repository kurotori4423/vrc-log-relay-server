/**
 * VRChatLogWatcher - VRChatログ監視クラス
 * 
 * VRChatのプロセス監視、ログディレクトリ監視、ログファイル監視を統合的に行う
 * vrc-tail準拠のアルゴリズムでファイル選択を実行
 * 
 * @created 2025-06-30
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as chokidar from 'chokidar';
import { Tail } from 'tail';
import { 
  VRChatStatus, 
  VRChatProcessInfo, 
  LogMetadata,
  LogSource 
} from '../types';
import { getLogger } from '../utils/logger';

const execAsync = promisify(exec);
const logger = getLogger();

/**
 * ログファイル情報
 */
interface LogFileInfo {
  /** ファイルパス */
  filePath: string;
  /** ファイル名 */
  fileName: string;
  /** ファイル作成時刻（ファイル名から解析） */
  timestamp: number;
  /** ファイルサイズ */
  size: number;
}

/**
 * VRChatLogWatcher設定
 */
interface WatcherConfig {
  /** VRChatログディレクトリパス（nullの場合は自動検出） */
  logDirectory?: string;
  /** ファイルグループ期間（秒） */
  groupPeriod: number;
  /** 最大同時監視ファイル数 */
  maxFiles: number;
  /** プロセス監視間隔（ミリ秒） */
  processCheckInterval: number;
  /** ディレクトリ監視設定 */
  directoryWatchOptions: {
    usePolling: boolean;
    depth: number;
    ignoreInitial: boolean;
  };
}

/**
 * VRChatログ監視クラス
 * 
 * 主要機能:
 * - VRChatプロセスの監視（起動/終了検知）
 * - ログディレクトリの監視（作成/削除検知）
 * - 複数ログファイルの同時監視（vrc-tail準拠）
 * - ログ行の配信
 */
export class VRChatLogWatcher extends EventEmitter {
  private config: WatcherConfig;
  private logDirectory: string | null = null;
  private vrchatStatus: VRChatStatus = VRChatStatus.NOT_RUNNING;
  private processInfo: VRChatProcessInfo | null = null;
  
  // 監視関連
  private processTimer: NodeJS.Timeout | null = null;
  private directoryWatcher: chokidar.FSWatcher | null = null;
  private fileTails: Map<string, Tail> = new Map();
  
  // 状態管理
  private isWatching = false;
  private lastStatusChange = Date.now();

  constructor(config: Partial<WatcherConfig> = {}) {
    super();
    
    // デフォルト設定をマージ
    this.config = {
      groupPeriod: 30,
      maxFiles: 4,
      processCheckInterval: 5000,
      directoryWatchOptions: {
        usePolling: false,
        depth: 1,
        ignoreInitial: false
      },
      ...config
    };

    logger.info('VRChatLogWatcher initialized', { config: this.config });
  }

  // =============================================================================
  // 公開メソッド
  // =============================================================================

  /**
   * ログ監視を開始
   */
  async startWatching(): Promise<void> {
    if (this.isWatching) {
      logger.warn('VRChatLogWatcher is already watching');
      return;
    }

    logger.info('Starting VRChat log watching');
    this.isWatching = true;

    try {
      // 1. VRChatプロセス監視を開始
      await this.startProcessMonitoring();
      
      // 2. ログディレクトリを特定
      await this.determineLogDirectory();
      
      // 3. ディレクトリ監視を開始（ディレクトリが存在する場合）
      if (this.logDirectory && fsSync.existsSync(this.logDirectory)) {
        await this.startDirectoryWatching();
        await this.startLogFileWatching();
      }

      logger.info('VRChat log watching started successfully');
      this.emit('watching_started');
      
    } catch (error) {
      this.isWatching = false;
      logger.error('Failed to start VRChat log watching', error);
      throw error;
    }
  }

  /**
   * ログ監視を停止
   */
  async stopWatching(): Promise<void> {
    if (!this.isWatching) {
      return;
    }

    logger.info('Stopping VRChat log watching');
    this.isWatching = false;

    // プロセス監視停止
    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = null;
    }

    // ディレクトリ監視停止
    if (this.directoryWatcher) {
      await this.directoryWatcher.close();
      this.directoryWatcher = null;
    }

    // ファイル監視停止
    await this.stopLogFileWatching();

    logger.info('VRChat log watching stopped');
    this.emit('watching_stopped');
  }

  /**
   * 現在のVRChat状態を取得
   */
  getVRChatStatus(): VRChatStatus {
    return this.vrchatStatus;
  }

  /**
   * 現在監視中のファイル一覧を取得
   */
  getMonitoredFiles(): string[] {
    return Array.from(this.fileTails.keys());
  }

  /**
   * VRChatプロセス情報を取得
   */
  getProcessInfo(): VRChatProcessInfo | null {
    return this.processInfo;
  }

  // =============================================================================
  // VRChatプロセス監視
  // =============================================================================

  /**
   * プロセス監視を開始
   */
  private async startProcessMonitoring(): Promise<void> {
    logger.info('Starting VRChat process monitoring');
    
    // 初回チェック
    await this.checkVRChatProcess();
    
    // 定期監視を開始
    this.processTimer = setInterval(() => {
      this.checkVRChatProcess().catch(error => {
        logger.error('Process check failed', error);
      });
    }, this.config.processCheckInterval);
  }

  /**
   * VRChatプロセスをチェック
   */
  private async checkVRChatProcess(): Promise<void> {
    try {
      const processInfo = await this.detectVRChatProcess();
      const currentStatus = processInfo ? VRChatStatus.RUNNING : VRChatStatus.NOT_RUNNING;
      
      if (currentStatus !== this.vrchatStatus) {
        const previousStatus = this.vrchatStatus;
        this.vrchatStatus = currentStatus;
        this.processInfo = processInfo;
        this.lastStatusChange = Date.now();
        
        logger.info('VRChat status changed', { 
          from: previousStatus, 
          to: currentStatus,
          processInfo 
        });
        
        this.emit('vrchat_status_change', {
          previousStatus,
          currentStatus,
          processInfo,
          timestamp: this.lastStatusChange
        });

        // ステータス変更に応じた処理
        if (currentStatus === VRChatStatus.RUNNING) {
          await this.onVRChatStarted();
        } else {
          await this.onVRChatStopped();
        }
      }
    } catch (error) {
      logger.error('Failed to check VRChat process', error);
    }
  }

  /**
   * VRChatプロセスを検出（複数手法を試行）
   */
  private async detectVRChatProcess(): Promise<VRChatProcessInfo | null> {
    const detectionMethods = [
      // 方法1: wmic (最も確実)
      async (): Promise<VRChatProcessInfo | null> => {
        try {
          const { stdout } = await execAsync('wmic process where "name=\'VRChat.exe\'" get ProcessId,CreationDate,ExecutablePath /format:csv');
          const lines = stdout.trim().split('\n').filter(line => line.includes('VRChat.exe'));
          
          if (lines.length > 0) {
            const parts = lines[0].split(',');
            const processId = parseInt(parts[3], 10);
            const executablePath = parts[2];
            
            return {
              processId,
              processName: 'VRChat.exe',
              executablePath,
              startTime: new Date() // CreationDateの解析は複雑なので簡略化
            };
          }
        } catch (error) {
          logger.debug('wmic detection failed', error);
        }
        return null;
      },

      // 方法2: tasklist
      async (): Promise<VRChatProcessInfo | null> => {
        try {
          const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq VRChat.exe" /NH');
          const lines = stdout.trim().split('\n').filter(line => line.includes('VRChat.exe'));
          
          if (lines.length > 0) {
            const parts = lines[0].split(/\s+/);
            const processId = parseInt(parts[1], 10);
            
            return {
              processId,
              processName: 'VRChat.exe',
              startTime: new Date()
            };
          }
        } catch (error) {
          logger.debug('tasklist detection failed', error);
        }
        return null;
      }
    ];

    // 各検出方法を順次試行
    for (const method of detectionMethods) {
      const result = await method();
      if (result) {
        return result;
      }
    }

    return null;
  }

  /**
   * VRChat開始時の処理
   */
  private async onVRChatStarted(): Promise<void> {
    logger.info('VRChat started - initializing log monitoring');
    
    try {
      await this.determineLogDirectory();
      
      if (this.logDirectory) {
        // ディレクトリが既に存在する場合
        if (fsSync.existsSync(this.logDirectory)) {
          await this.startDirectoryWatching();
          await this.startLogFileWatching();
        } else {
          // ディレクトリの作成を待機
          logger.info('Waiting for log directory creation', { logDirectory: this.logDirectory });
        }
      }
    } catch (error) {
      logger.error('Failed to initialize log monitoring on VRChat start', error);
    }
  }

  /**
   * VRChat停止時の処理
   */
  private async onVRChatStopped(): Promise<void> {
    logger.info('VRChat stopped - cleaning up log monitoring');
    
    // ファイル監視を停止
    await this.stopLogFileWatching();
  }

  // =============================================================================
  // ログディレクトリ監視
  // =============================================================================

  /**
   * ログディレクトリを特定
   */
  private async determineLogDirectory(): Promise<void> {
    if (this.config.logDirectory) {
      this.logDirectory = this.config.logDirectory;
      logger.info('Using configured log directory', { logDirectory: this.logDirectory });
      return;
    }

    // 自動検出
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      throw new Error('LOCALAPPDATA environment variable not found');
    }

    this.logDirectory = path.join(localAppData, 'Low', 'VRChat', 'VRChat');
    logger.info('Auto-detected log directory', { logDirectory: this.logDirectory });
  }

  /**
   * ディレクトリ監視を開始
   */
  private async startDirectoryWatching(): Promise<void> {
    if (!this.logDirectory) {
      throw new Error('Log directory not determined');
    }

    logger.info('Starting directory watching', { logDirectory: this.logDirectory });

    this.directoryWatcher = chokidar.watch(this.logDirectory, {
      ...this.config.directoryWatchOptions,
      ignoreInitial: true  // 初期ファイルは別途処理
    });

    this.directoryWatcher
      .on('add', (filePath: string) => this.onLogFileAdded(filePath))
      .on('unlink', (filePath: string) => this.onLogFileRemoved(filePath))
      .on('error', (error: unknown) => {
        logger.error('Directory watcher error', error);
      });
  }

  /**
   * ログファイル追加時の処理
   */
  private onLogFileAdded(filePath: string): void {
    const fileName = path.basename(filePath);
    
    // output_log_*.txt パターンのチェック
    if (this.isVRChatLogFile(fileName)) {
      logger.info('New VRChat log file detected', { filePath });
      
      // ファイル選択アルゴリズムを再実行
      this.updateLogFileWatching();
    }
  }

  /**
   * ログファイル削除時の処理
   */
  private onLogFileRemoved(filePath: string): void {
    const fileName = path.basename(filePath);
    
    if (this.isVRChatLogFile(fileName)) {
      logger.info('VRChat log file removed', { filePath });
      
      // 監視から除去
      if (this.fileTails.has(filePath)) {
        this.removeLogFileWatching(filePath);
      }
      
      // ファイル選択アルゴリズムを再実行
      this.updateLogFileWatching();
    }
  }

  // =============================================================================
  // ログファイル監視
  // =============================================================================

  /**
   * ログファイル監視を開始
   */
  private async startLogFileWatching(): Promise<void> {
    if (!this.logDirectory) {
      throw new Error('Log directory not determined');
    }

    logger.info('Starting log file watching');
    await this.updateLogFileWatching();
  }

  /**
   * ログファイル監視を更新（vrc-tail準拠のファイル選択）
   */
  private async updateLogFileWatching(): Promise<void> {
    if (!this.logDirectory) return;

    try {
      // 現在のログファイル一覧を取得
      const files = await this.scanLogFiles();
      
      // vrc-tail準拠のファイル選択
      const targetFiles = this.selectTargetFiles(files);
      
      logger.info('Selected log files for watching', { 
        totalFiles: files.length, 
        selectedFiles: targetFiles.map(f => f.fileName) 
      });

      // 現在監視中で、新しい選択に含まれないファイルを停止
      for (const [filePath] of this.fileTails) {
        if (!targetFiles.some(f => f.filePath === filePath)) {
          this.removeLogFileWatching(filePath);
        }
      }

      // 新しく選択されたファイルの監視を開始
      for (const file of targetFiles) {
        if (!this.fileTails.has(file.filePath)) {
          this.addLogFileWatching(file.filePath);
        }
      }

    } catch (error) {
      logger.error('Failed to update log file watching', error);
    }
  }

  /**
   * ログファイルをスキャン
   */
  private async scanLogFiles(): Promise<LogFileInfo[]> {
    if (!this.logDirectory) return [];

    try {
      const files = await fs.readdir(this.logDirectory);
      const logFiles: LogFileInfo[] = [];

      for (const fileName of files) {
        if (this.isVRChatLogFile(fileName)) {
          const filePath = path.join(this.logDirectory, fileName);
          
          try {
            const stats = await fs.stat(filePath);
            const timestamp = this.parseTimestampFromFilename(fileName);
            
            logFiles.push({
              filePath,
              fileName,
              timestamp,
              size: stats.size
            });
          } catch (statError) {
            logger.warn('Failed to stat log file', { fileName, error: statError });
          }
        }
      }

      return logFiles;
    } catch (error) {
      logger.error('Failed to scan log files', error);
      return [];
    }
  }

  /**
   * vrc-tail準拠のファイル選択アルゴリズム
   */
  private selectTargetFiles(files: LogFileInfo[]): LogFileInfo[] {
    if (files.length === 0) return [];

    // 1. 時刻でソート（新しい順）
    const sorted = [...files].sort((a, b) => b.timestamp - a.timestamp);
    
    // 2. グループ期間に基づく選択
    const result: LogFileInfo[] = [];
    let lastTimestamp = 0;
    
    for (const file of sorted) {
      if (result.length === 0) {
        result.push(file);
        lastTimestamp = file.timestamp;
        continue;
      }
      
      // グループ期間内のファイルを追加
      if (lastTimestamp - file.timestamp <= this.config.groupPeriod * 1000) {
        result.unshift(file); // 古い順に並べる
      } else {
        // 新しいグループ開始 - 古いファイルは破棄
        result.length = 0;
        result.push(file);
        lastTimestamp = file.timestamp;
      }
      
      if (result.length >= this.config.maxFiles) break;
    }
    
    return result;
  }

  /**
   * 単一ファイルの監視を追加
   */
  private addLogFileWatching(filePath: string): void {
    try {
      logger.info('Adding log file to watching', { filePath });

      const tail = new Tail(filePath, {
        fromBeginning: false,
        follow: true,
        useWatchFile: true
      });

      tail.on('line', (line: string) => {
        this.onLogLine(line, filePath);
      });

      tail.on('error', (error: Error) => {
        logger.error('Tail error', { filePath, error });
      });

      this.fileTails.set(filePath, tail);
      
    } catch (error) {
      logger.error('Failed to add log file watching', { filePath, error });
    }
  }

  /**
   * 単一ファイルの監視を削除
   */
  private removeLogFileWatching(filePath: string): void {
    const tail = this.fileTails.get(filePath);
    if (tail) {
      logger.info('Removing log file from watching', { filePath });
      
      try {
        tail.unwatch();
      } catch (error) {
        logger.warn('Failed to unwatch tail', { filePath, error });
      }
      
      this.fileTails.delete(filePath);
    }
  }

  /**
   * すべてのログファイル監視を停止
   */
  private async stopLogFileWatching(): Promise<void> {
    logger.info('Stopping all log file watching');

    for (const [filePath, tail] of this.fileTails) {
      try {
        tail.unwatch();
      } catch (error) {
        logger.warn('Failed to unwatch tail', { filePath, error });
      }
    }

    this.fileTails.clear();
  }

  /**
   * ログ行を受信した時の処理
   */
  private onLogLine(line: string, filePath: string): void {
    const metadata: LogMetadata = {
      source: LogSource.VRCHAT,
      filePath,
      fileName: path.basename(filePath),
      timestamp: Date.now(),
      lineNumber: 0 // Tailライブラリからは取得不可
    };

    this.emit('log_line', line, metadata);
  }

  // =============================================================================
  // ユーティリティメソッド
  // =============================================================================

  /**
   * ファイル名がVRChatログファイルかどうかを判定
   */
  private isVRChatLogFile(fileName: string): boolean {
    return /^output_log_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.txt$/.test(fileName);
  }

  /**
   * ファイル名からタイムスタンプを解析
   */
  private parseTimestampFromFilename(fileName: string): number {
    const match = fileName.match(/^output_log_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.txt$/);
    if (!match) {
      return 0;
    }

    const [, year, month, day, hour, minute, second] = match;
    const date = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1, // 月は0ベース
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10)
    );

    return date.getTime();
  }
}
