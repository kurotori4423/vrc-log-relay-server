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
  /** 静寂モード設定 */
  quietMode: {
    /** 静寂モード有効化 */
    enabled: boolean;
    /** デバッグログの出力を抑制するか */
    suppressDebugLogs: boolean;
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
  private lastSuccessfulCheck = Date.now();

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
      quietMode: {
        enabled: true,
        suppressDebugLogs: true
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
        logger.debug('Starting directory and file watching', { logDirectory: this.logDirectory });
        await this.startDirectoryWatching();
        await this.startLogFileWatching();
      } else {
        logger.warn('Skipping file watching - directory not found', { 
          logDirectory: this.logDirectory,
          exists: this.logDirectory ? fsSync.existsSync(this.logDirectory) : false
        });
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
      
      // ステータス変更の判定
      if (currentStatus !== this.vrchatStatus) {
        const previousStatus = this.vrchatStatus;
        this.vrchatStatus = currentStatus;
        this.processInfo = processInfo;
        this.lastStatusChange = Date.now();
        this.lastSuccessfulCheck = Date.now();
        
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
      } else if (processInfo && this.processInfo && processInfo.processId !== this.processInfo.processId) {
        // 同じRUNNINGステータス内でのプロセスID変更
        const previousPid = this.processInfo.processId;
        this.processInfo = processInfo;
        this.lastSuccessfulCheck = Date.now();
        
        logger.info('VRChat process ID changed', {
          previousPid,
          newPid: processInfo.processId,
          detectionMethod: processInfo.detectionMethod
        });
        
        // プロセス変更イベントを発火（起動・終了とは区別）
        this.emit('vrchat_process_change', {
          previousPid,
          newProcessInfo: processInfo,
          timestamp: Date.now()
        });
      } else {
        // ステータス変更もプロセスID変更もない通常のチェック
        this.lastSuccessfulCheck = Date.now();
        
        // 静寂モード中でなければデバッグログを出力
        if (!this.isInQuietModeNow()) {
          logger.debug('VRChat process check completed', {
            status: currentStatus,
            processId: processInfo?.processId,
            isQuietMode: this.isInQuietModeNow()
          });
        }
      }
    } catch (error) {
      logger.error('Failed to check VRChat process', error);
    }
  }

  /**
   * 静寂モード中かどうかを確認
   */
  public isInQuietModeNow(): boolean {
    return this.config.quietMode.enabled && this.config.quietMode.suppressDebugLogs;
  }

  /**
   * VRChatプロセスを検出（複数手法を試行）
   */
  private async detectVRChatProcess(): Promise<VRChatProcessInfo | null> {
    const detectionMethods = [
      {
        name: 'wmic_main_process',
        priority: 1,
        execute: async (): Promise<VRChatProcessInfo | null> => {
          // メインのVRChatプロセス検知（ランチャーとwmicプロセス自体を除外）
          const { stdout } = await execAsync(
            'wmic process where "name=\'VRChat.exe\' and not commandline like \'%launcher%\' and not commandline like \'%wmic%\'" get ProcessId,CommandLine /format:csv',
            { timeout: 10000, encoding: 'utf8' }
          );
          return this.parseWmicDetailedOutput(stdout, 'wmic_main');
        }
      },
      {
        name: 'wmic_direct',
        priority: 2,
        execute: async (): Promise<VRChatProcessInfo | null> => {
          const { stdout } = await execAsync(
            'wmic process where "name=\'VRChat.exe\'" get ProcessId /format:value',
            { timeout: 10000, encoding: 'utf8' }
          );
          return this.parseWmicOutput(stdout);
        }
      },
      {
        name: 'tasklist_filter',
        priority: 3,
        execute: async (): Promise<VRChatProcessInfo | null> => {
          const { stdout } = await execAsync(
            'tasklist /FI "IMAGENAME eq VRChat.exe" /NH',
            { timeout: 10000, encoding: 'utf8' }
          );
          return this.parseTasklistOutput(stdout);
        }
      },
      {
        name: 'wmic_filtered',
        priority: 4,
        execute: async (): Promise<VRChatProcessInfo | null> => {
          // 自己参照を避けるため、異なるアプローチでVRChatを検索
          const { stdout } = await execAsync(
            'wmic process where "name=\'VRChat.exe\' and not commandline like \'%wmic%\' and not commandline like \'%cmd%\'" get ProcessId /format:value',
            { timeout: 10000, encoding: 'utf8' }
          );
          return this.parseWmicOutput(stdout);
        }
      }
    ];

    // 複数の検知手法を順番に試行（リトライ付き）
    for (const method of detectionMethods) {
      for (let retry = 0; retry < 3; retry++) {
        try {
          const startTime = Date.now();
          const result = await method.execute();
          const duration = Date.now() - startTime;
          
          if (result) {
            // 自己参照チェック: 現在のプロセスと同じPIDでないことを確認
            if (result.processId === process.pid) {
              if (!this.isInQuietModeNow()) {
                logger.debug(`Skipping self-reference: PID ${result.processId} is current process`);
              }
              continue;
            }
            
            if (!this.isInQuietModeNow()) {
              logger.debug(`Process detected using ${method.name} in ${duration}ms`);
            }
            return result;
          }
          
          if (!this.isInQuietModeNow()) {
            logger.debug(`No process found with ${method.name} (${duration}ms)`);
          }
          break; // 成功したが見つからなかった場合はリトライしない
        } catch (error) {
          if (!this.isInQuietModeNow()) {
            logger.warn(`Detection method ${method.name} failed (retry ${retry + 1}/3):`, error);
          }
          
          if (retry < 2) {
            await this.delay(1000); // 1秒待機してリトライ
          }
        }
      }
    }
    
    return null; // すべての方法で検知失敗
  }

  /**
   * WMIC詳細出力を解析（コマンドライン情報含む）
   */
  private parseWmicDetailedOutput(output: string, method: string): VRChatProcessInfo | null {
    const lines = output.split('\n').filter(line => 
      line.trim() && 
      !line.includes('Node,CommandLine,ProcessId') &&
      line.includes('VRChat')
    );
    
    // 複数プロセスが見つかった場合の処理
    if (lines.length > 1) {
      logger.debug(`Multiple VRChat processes found (${lines.length}), selecting main process`);
      
      // ランチャーやサブプロセスを除外してメインプロセスを選択
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 3) {
          const commandLine = parts.slice(1, -1).join(',').toLowerCase();
          const processIdStr = parts[parts.length - 1];
          const processId = parseInt(processIdStr, 10);
          
          // ランチャー、installer、updater等を除外
          if (processId > 0 && 
              !commandLine.includes('launcher') &&
              !commandLine.includes('installer') &&
              !commandLine.includes('updater') &&
              !commandLine.includes('crash') &&
              !commandLine.includes('setup')) {
            
            logger.debug(`Selected main VRChat process: PID ${processId}`);
            return {
              processId,
              processName: 'VRChat.exe',
              startTime: new Date(),
              detectionMethod: method as any
            };
          }
        }
      }
    }
    
    // 単一プロセスまたはフォールバック処理
    if (lines.length > 0) {
      const parts = lines[0].split(',');
      if (parts.length >= 3) {
        const processIdStr = parts[parts.length - 1];
        const processId = parseInt(processIdStr, 10);
        
        if (processId > 0) {
          return {
            processId,
            processName: 'VRChat.exe',
            startTime: new Date(),
            detectionMethod: method as any
          };
        }
      }
    }
    
    return null;
  }

  /**
   * WMIC出力を解析
   */
  private parseWmicOutput(output: string): VRChatProcessInfo | null {
    const lines = output.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const match = line.match(/ProcessId=(\d+)/);
      if (match) {
        const processId = parseInt(match[1], 10);
        if (processId > 0) {
          return {
            processId,
            processName: 'VRChat.exe',
            startTime: new Date(),
            detectionMethod: 'wmic'
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Tasklist出力を解析
   */
  private parseTasklistOutput(output: string): VRChatProcessInfo | null {
    const lines = output.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      if (line.includes('VRChat.exe')) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const processId = parseInt(parts[1], 10);
          if (processId > 0) {
            return {
              processId,
              processName: 'VRChat.exe',
              startTime: new Date(),
              detectionMethod: 'tasklist'
            };
          }
        }
      }
    }
    
    return null;
  }

  /**
   * 指定時間待機
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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

    // 自動検出 - VRChatは%USERPROFILE%\AppData\LocalLowに配置される
    const userProfile = process.env.USERPROFILE;
    logger.debug('USERPROFILE environment variable', { userProfile });
    
    if (!userProfile) {
      throw new Error('USERPROFILE environment variable not found');
    }

    this.logDirectory = path.join(userProfile, 'AppData', 'LocalLow', 'VRChat', 'VRChat');
    const dirExists = fsSync.existsSync(this.logDirectory);
    
    logger.info('Auto-detected log directory', { 
      logDirectory: this.logDirectory,
      exists: dirExists
    });
    
    if (!dirExists) {
      logger.warn('Auto-detected log directory does not exist', { logDirectory: this.logDirectory });
    }
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
    logger.debug('Starting log file watching - detailed', { logDirectory: this.logDirectory });
    await this.updateLogFileWatching();
  }

  /**
   * ログファイル監視を更新（vrc-tail準拠のファイル選択）
   */
  private async updateLogFileWatching(): Promise<void> {
    if (!this.logDirectory) return;

    try {
      logger.debug('Updating log file watching', { logDirectory: this.logDirectory });
      
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
      logger.debug('Scanning log files', { logDirectory: this.logDirectory });
      const files = await fs.readdir(this.logDirectory);
      logger.debug('Found files in directory', { 
        totalFiles: files.length,
        files: files.slice(0, 10) // 最初の10ファイルのみ表示
      });
      
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

      logger.debug('Scanned log files result', { 
        logFileCount: logFiles.length,
        logFiles: logFiles.map(f => ({ fileName: f.fileName, size: f.size }))
      });
      
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
    
    logger.debug('Sorted log files', {
      sortedFiles: sorted.map(f => ({
        fileName: f.fileName,
        timestamp: f.timestamp,
        date: new Date(f.timestamp),
        size: f.size
      }))
    });
    
    // 2. 最新ファイルを必ず含める
    const result: LogFileInfo[] = [sorted[0]];
    logger.debug('Selected first file (always included)', { fileName: sorted[0].fileName });
    
    // 3. グループ期間内の連続するファイルを追加
    for (let i = 1; i < sorted.length && result.length < this.config.maxFiles; i++) {
      const currentFile = sorted[i];
      const previousFile = sorted[i - 1];
      
      const timeDiff = previousFile.timestamp - currentFile.timestamp;
      const groupPeriodMs = this.config.groupPeriod * 1000;
      
      logger.debug('Checking file for group period', {
        fileName: currentFile.fileName,
        timeDiff,
        groupPeriodMs,
        withinPeriod: timeDiff <= groupPeriodMs
      });
      
      if (timeDiff <= groupPeriodMs) {
        result.push(currentFile);
        logger.debug('Added file to group', { fileName: currentFile.fileName });
      } else {
        // グループ期間を超えた場合は終了
        logger.debug('Group period exceeded, stopping selection');
        break;
      }
    }
    
    // 4. 時刻順に並び替え（古い順）
    result.sort((a, b) => a.timestamp - b.timestamp);
    
    logger.debug('Final selected files', { 
      selectedFiles: result.map(f => f.fileName)
    });
    
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
