# VRChat Log Relay Server - アルゴリズム実装詳細

## 🎯 主要アルゴリズム概要

このドキュメントでは、VRChat Log Relay Server の核心となるアルゴリズムの詳細実装方法を説明します。

### 重要アルゴリズム一覧
1. **ログファイル監視アルゴリズム** (vrc-tail準拠)
2. **VRChatプロセス監視アルゴリズム** 
3. **メッセージ解析アルゴリズム**
4. **WebSocket配信アルゴリズム**
5. **フィルタリングアルゴリズム**

## 🔍 1. ログファイル監視アルゴリズム (vrc-tail準拠)

### 概要
VRChatが生成する複数のログファイルを、グループ期間に基づいて効率的に監視するアルゴリズム。

### アルゴリズム仕様

#### ファイル選択ロジック
```typescript
interface FileInfo {
  path: string;
  timestamp: number;  // ファイル名から解析した時刻
  size: number;       // ファイルサイズ
}

class VRCLogFileSelector {
  private groupPeriod: number;  // 30秒
  private maxFiles: number;     // 最大4ファイル
  
  selectTargetFiles(files: FileInfo[]): FileInfo[] {
    // Step 1: ファイル名から時刻を解析してソート
    const sortedFiles = this.sortFilesByTimestamp(files);
    
    // Step 2: グループ期間に基づく選択
    return this.applyGroupingLogic(sortedFiles);
  }
  
  private sortFilesByTimestamp(files: FileInfo[]): FileInfo[] {
    return files
      .map(file => ({
        ...file,
        timestamp: this.parseTimestampFromFilename(file.path)
      }))
      .filter(file => file.timestamp > 0)  // 無効なファイル除外
      .sort((a, b) => b.timestamp - a.timestamp);  // 新しい順
  }
  
  private applyGroupingLogic(files: FileInfo[]): FileInfo[] {
    const result: FileInfo[] = [];
    let lastTimestamp = 0;
    
    for (const file of files) {
      if (result.length === 0) {
        // 最初のファイル（最新）
        result.push(file);
        lastTimestamp = file.timestamp;
        continue;
      }
      
      const timeDiff = lastTimestamp - file.timestamp;
      
      if (timeDiff <= this.groupPeriod * 1000) {
        // グループ期間内 → 追加
        result.unshift(file);  // 時系列順に配置
      } else {
        // グループ期間外 → 新しいグループ開始
        result.length = 0;     // 古いグループを破棄
        result.push(file);
        lastTimestamp = file.timestamp;
      }
      
      // 最大ファイル数制限
      if (result.length >= this.maxFiles) {
        break;
      }
    }
    
    return result;
  }
  
  // ファイル名パターン: output_log_2025-06-30_15-30-10.txt
  private parseTimestampFromFilename(filename: string): number {
    const pattern = /output_log_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.txt$/;
    const match = path.basename(filename).match(pattern);
    
    if (!match) return 0;
    
    const [, year, month, day, hour, minute, second] = match;
    const date = new Date(
      parseInt(year),
      parseInt(month) - 1,  // 月は0始まり
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second)
    );
    
    return date.getTime();
  }
}
```

#### 実行例
```typescript
// 入力ファイル例
const files = [
  { path: "output_log_2025-06-30_15-30-10.txt", timestamp: 0, size: 1024 },
  { path: "output_log_2025-06-30_15-30-35.txt", timestamp: 0, size: 2048 },
  { path: "output_log_2025-06-30_15-31-15.txt", timestamp: 0, size: 1536 },
  { path: "output_log_2025-06-30_15-32-00.txt", timestamp: 0, size: 512 }
];

// グループ期間: 30秒
// 結果: 15:31:15 と 15:32:00 のみ選択（45秒差なので別グループ）
```

### Tail監視の実装

```typescript
class LogFileTailWatcher {
  private tailInstances: Map<string, Tail>;
  private activeFiles: Set<string>;
  
  addLogFile(filePath: string, fileIndex: number): void {
    if (this.tailInstances.has(filePath)) {
      return;  // 既に監視中
    }
    
    const tail = new Tail(filePath, {
      fromBeginning: false,    // 新しい行のみ
      follow: true,            // ファイル継続監視
      useWatchFile: true,      // ファイル監視使用
      fsWatchOptions: {
        interval: 100          // 100ms間隔
      }
    });
    
    // 行読み取りイベント
    tail.on('line', (line: string) => {
      this.emit('log_line', line, {
        filePath,
        fileIndex,
        timestamp: Date.now()
      });
    });
    
    // エラーハンドリング
    tail.on('error', (error) => {
      this.logger.error(`Tail error for ${filePath}:`, error);
      this.removeLogFile(filePath);
    });
    
    this.tailInstances.set(filePath, tail);
    this.activeFiles.add(filePath);
    
    this.logger.info(`Started tailing: ${path.basename(filePath)}`);
  }
  
  removeLogFile(filePath: string): void {
    const tail = this.tailInstances.get(filePath);
    if (tail) {
      tail.unwatch();
      this.tailInstances.delete(filePath);
      this.activeFiles.delete(filePath);
      this.logger.info(`Stopped tailing: ${path.basename(filePath)}`);
    }
  }
  
  // グループ変更時の古いファイル削除
  cleanupOldWatchers(): void {
    for (const [filePath, tail] of this.tailInstances) {
      tail.unwatch();
      this.tailInstances.delete(filePath);
    }
    this.activeFiles.clear();
    this.logger.info('Cleaned up old tail watchers');
  }
}
```

## 🖥️ 2. VRChatプロセス監視アルゴリズム

### 概要
Windows環境でVRChat.exe の起動・終了を確実に検知するアルゴリズム。

### 検知戦略

```typescript
class VRChatProcessMonitor {
  private detectionMethods: DetectionMethod[];
  private monitorInterval: number = 5000;  // 5秒間隔
  private retryLimit: number = 3;
  
  constructor() {
    this.detectionMethods = [
      {
        name: 'wmic_direct',
        command: 'wmic process where "name=\'VRChat.exe\'" get ProcessId /format:value',
        parser: this.parseWmicOutput.bind(this),
        priority: 1
      },
      {
        name: 'tasklist_filter', 
        command: 'tasklist /FI "IMAGENAME eq VRChat.exe" /NH',
        parser: this.parseTasklistOutput.bind(this),
        priority: 2
      },
      {
        name: 'wmic_commandline',
        command: 'wmic process where "commandline like \'%VRChat%\'" get ProcessId /format:value',
        parser: this.parseWmicOutput.bind(this),
        priority: 3
      }
    ];
  }
  
  async checkVRChatProcess(): Promise<ProcessInfo | null> {
    for (const method of this.detectionMethods) {
      for (let retry = 0; retry < this.retryLimit; retry++) {
        try {
          const result = await this.executeDetectionMethod(method);
          if (result) {
            return result;
          }
        } catch (error) {
          this.logger.warn(`Detection method ${method.name} failed (retry ${retry + 1}):`, error);
          
          if (retry < this.retryLimit - 1) {
            await this.delay(1000);  // 1秒待機
          }
        }
      }
    }
    
    return null;  // すべての方法で検知失敗
  }
  
  private async executeDetectionMethod(method: DetectionMethod): Promise<ProcessInfo | null> {
    const startTime = Date.now();
    
    try {
      const { stdout, stderr } = await execAsync(method.command, {
        timeout: 10000,  // 10秒タイムアウト
        encoding: 'utf8'
      });
      
      if (stderr && stderr.trim()) {
        this.logger.debug(`Command stderr: ${stderr}`);
      }
      
      const processInfo = method.parser(stdout);
      const duration = Date.now() - startTime;
      
      this.logger.debug(`Detection method ${method.name} completed in ${duration}ms`);
      
      return processInfo;
    } catch (error) {
      throw new Error(`Command execution failed: ${error.message}`);
    }
  }
  
  private parseWmicOutput(output: string): ProcessInfo | null {
    // WMIC出力例: "ProcessId=12345"
    const lines = output.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const match = line.match(/ProcessId=(\d+)/);
      if (match) {
        const processId = parseInt(match[1]);
        if (processId > 0) {
          return {
            processId,
            detectedAt: Date.now(),
            method: 'wmic'
          };
        }
      }
    }
    
    return null;
  }
  
  private parseTasklistOutput(output: string): ProcessInfo | null {
    // Tasklist出力例: "VRChat.exe    12345 Console    1    150,000 K"
    const lines = output.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      if (line.includes('VRChat.exe')) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const processId = parseInt(parts[1]);
          if (processId > 0) {
            return {
              processId,
              detectedAt: Date.now(),
              method: 'tasklist'
            };
          }
        }
      }
    }
    
    return null;
  }
}
```

### 状態変更検知

```typescript
class VRChatStatusTracker {
  private currentStatus: VRChatStatus;
  private previousStatus: VRChatStatus;
  
  updateStatus(newProcessInfo: ProcessInfo | null): StatusChangeEvent | null {
    this.previousStatus = { ...this.currentStatus };
    
    // プロセス状態更新
    if (newProcessInfo) {
      this.currentStatus.isRunning = true;
      this.currentStatus.processId = newProcessInfo.processId;
      this.currentStatus.detectedAt = newProcessInfo.detectedAt;
    } else {
      this.currentStatus.isRunning = false;
      this.currentStatus.processId = undefined;
      this.currentStatus.detectedAt = Date.now();
    }
    
    // 状態変更の検知
    if (this.hasStatusChanged()) {
      return this.createStatusChangeEvent();
    }
    
    return null;
  }
  
  private hasStatusChanged(): boolean {
    return this.currentStatus.isRunning !== this.previousStatus.isRunning;
  }
  
  private createStatusChangeEvent(): StatusChangeEvent {
    return {
      type: 'vrchat_process',
      timestamp: Date.now(),
      data: {
        isRunning: this.currentStatus.isRunning,
        processId: this.currentStatus.processId,
        previousState: this.previousStatus.isRunning
      },
      currentStatus: { ...this.currentStatus }
    };
  }
}
```

## 📝 3. メッセージ解析アルゴリズム

### 概要
VRChatの生ログを構造化データに変換するパイプライン処理。

### 解析パイプライン

```typescript
class MessageParsingPipeline {
  private basicParsers: BasicParser[];
  private specializedParsers: Map<string, SpecializedParser>;
  
  constructor() {
    this.basicParsers = [
      new VRChatLogParser(),
      new UdonLogParser(),
      new GenericLogParser()
    ];
    
    this.specializedParsers = new Map([
      ['udon', new UdonEventParser()],
      ['network', new NetworkEventParser()],
      ['world', new WorldEventParser()]
    ]);
  }
  
  processLogLine(line: string, metadata: LogMetadata): ProcessedMessage | null {
    // Step 1: 基本フォーマット解析
    const basicParsed = this.parseBasicFormat(line);
    if (!basicParsed) {
      return null;  // 解析不可能な行
    }
    
    // Step 2: 特殊解析
    const specializedParsed = this.parseSpecializedFormat(basicParsed);
    
    // Step 3: 構造化メッセージ構築
    return this.buildProcessedMessage(basicParsed, specializedParsed, metadata);
  }
  
  private parseBasicFormat(line: string): BasicParsedData | null {
    for (const parser of this.basicParsers) {
      const result = parser.parse(line);
      if (result) {
        return result;
      }
    }
    return null;
  }
  
  private parseSpecializedFormat(basic: BasicParsedData): ParsedData | null {
    // ソースタイプに基づく特殊解析
    const parser = this.specializedParsers.get(basic.source);
    if (parser) {
      return parser.parse(basic.content);
    }
    
    return null;
  }
}
```

### Udon専用解析アルゴリズム

```typescript
class UdonEventParser {
  private patterns: UdonPattern[];
  
  constructor() {
    this.patterns = [
      {
        name: 'object_event',
        regex: /^(.+?):\s*(.+?)\s*-\s*(.+)$/,
        handler: this.parseObjectEvent.bind(this)
      },
      {
        name: 'method_call',
        regex: /^(.+?)\.(.+?)\((.+?)\)$/,
        handler: this.parseMethodCall.bind(this)
      },
      {
        name: 'simple_event',
        regex: /^(.+?):\s*(.+)$/,
        handler: this.parseSimpleEvent.bind(this)
      },
      {
        name: 'json_data',
        regex: /^(.+?):\s*(\{.+\})$/,
        handler: this.parseJsonEvent.bind(this)
      }
    ];
  }
  
  parse(content: string): UdonLogData | null {
    // パターンマッチング（優先順位順）
    for (const pattern of this.patterns) {
      const match = content.match(pattern.regex);
      if (match) {
        try {
          return pattern.handler(match);
        } catch (error) {
          this.logger.debug(`Pattern ${pattern.name} parsing failed:`, error);
          continue;  // 次のパターンを試行
        }
      }
    }
    
    return null;
  }
  
  private parseObjectEvent(match: RegExpMatchArray): UdonLogData {
    const [, objectName, eventType, eventData] = match;
    
    return {
      objectName: objectName.trim(),
      eventType: eventType.trim(),
      customData: this.parseEventData(eventData.trim())
    };
  }
  
  private parseMethodCall(match: RegExpMatchArray): UdonLogData {
    const [, objectName, methodName, paramString] = match;
    
    return {
      objectName: objectName.trim(),
      methodName: methodName.trim(),
      parameters: this.parseParameters(paramString.trim())
    };
  }
  
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
      // 解析エラー時はプレーンテキストとして扱う
      return { value: dataString };
    }
  }
  
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
```

## 📡 4. WebSocket配信アルゴリズム

### 概要
効率的な並列配信とフィルタリングを組み合わせた配信システム。

### 並列配信アルゴリズム

```typescript
class MessageDistributor {
  private clients: Map<string, ClientConnection>;
  private distributionQueue: MessageQueue;
  private maxConcurrentSends: number = 10;
  
  async distributeMessage(message: ProcessedMessage): Promise<DistributionResult> {
    const startTime = Date.now();
    
    // Step 1: 配信対象クライアントの選定
    const eligibleClients = this.findEligibleClients(message);
    
    if (eligibleClients.length === 0) {
      return {
        success: true,
        deliveredCount: 0,
        duration: Date.now() - startTime
      };
    }
    
    // Step 2: 並列配信実行
    const result = await this.executeParallelDistribution(message, eligibleClients);
    
    // Step 3: 統計更新
    this.updateDistributionStats(message, result);
    
    return {
      ...result,
      duration: Date.now() - startTime
    };
  }
  
  private findEligibleClients(message: ProcessedMessage): ClientConnection[] {
    const eligible: ClientConnection[] = [];
    
    for (const client of this.clients.values()) {
      // 基本チェック
      if (!client.isAlive || !client.isConnected()) {
        continue;
      }
      
      // フィルター適用
      if (client.matches(message)) {
        eligible.push(client);
      }
    }
    
    return eligible;
  }
  
  private async executeParallelDistribution(
    message: ProcessedMessage,
    clients: ClientConnection[]
  ): Promise<DistributionResult> {
    const chunks = this.chunkArray(clients, this.maxConcurrentSends);
    let deliveredCount = 0;
    let errorCount = 0;
    
    // チャンク単位で並列実行
    for (const chunk of chunks) {
      const chunkTasks = chunk.map(client => 
        this.sendToClientSafe(client, message)
      );
      
      const chunkResults = await Promise.allSettled(chunkTasks);
      
      // 結果集計
      for (const result of chunkResults) {
        if (result.status === 'fulfilled' && result.value) {
          deliveredCount++;
        } else {
          errorCount++;
        }
      }
    }
    
    return {
      success: errorCount < clients.length,
      deliveredCount,
      errorCount,
      totalClients: clients.length
    };
  }
  
  private async sendToClientSafe(
    client: ClientConnection,
    message: ProcessedMessage
  ): Promise<boolean> {
    try {
      const payload = JSON.stringify({
        type: 'log_message',
        data: message
      });
      
      await client.sendRaw(payload);
      client.messagesSent++;
      client.updateLastSeen();
      
      return true;
    } catch (error) {
      this.logger.debug(`Failed to send to client ${client.id}:`, error);
      this.handleDeliveryError(client, error);
      return false;
    }
  }
  
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
```

## 🔍 5. フィルタリングアルゴリズム

### 概要
クライアント固有のフィルター条件に基づく効率的なメッセージフィルタリング。

### フィルター評価エンジン

```typescript
class FilterEvaluator {
  evaluate(filters: MessageFilter[], message: ProcessedMessage): boolean {
    if (filters.length === 0) {
      return true;  // フィルターなし = すべて通す
    }
    
    // すべてのフィルターでAND条件
    for (const filter of filters) {
      if (!this.evaluateFilter(filter, message)) {
        return false;
      }
    }
    
    return true;
  }
  
  private evaluateFilter(filter: MessageFilter, message: ProcessedMessage): boolean {
    switch (filter.type) {
      case 'level':
        return this.evaluateLevelFilter(filter.condition, message.level);
        
      case 'source':
        return this.evaluateSourceFilter(filter.condition, message.source);
        
      case 'content':
        return this.evaluateContentFilter(filter.condition, message.raw);
        
      case 'regex':
        return this.evaluateRegexFilter(filter.condition, message.raw);
        
      default:
        this.logger.warn(`Unknown filter type: ${filter.type}`);
        return true;  // 不明なフィルターは通す
    }
  }
  
  private evaluateLevelFilter(condition: FilterCondition, level: LogLevel): boolean {
    switch (condition.operator) {
      case 'equals':
        return level === condition.value;
        
      case 'in':
        return Array.isArray(condition.value) && 
               condition.value.includes(level);
        
      default:
        return false;
    }
  }
  
  private evaluateContentFilter(condition: FilterCondition, content: string): boolean {
    const target = condition.caseSensitive ? content : content.toLowerCase();
    const value = condition.caseSensitive ? 
                  condition.value : 
                  (condition.value as string).toLowerCase();
    
    switch (condition.operator) {
      case 'equals':
        return target === value;
        
      case 'contains':
        return target.includes(value as string);
        
      default:
        return false;
    }
  }
  
  private evaluateRegexFilter(condition: FilterCondition, content: string): boolean {
    try {
      const regex = condition.value instanceof RegExp ? 
                    condition.value : 
                    new RegExp(condition.value as string, 
                              condition.caseSensitive ? '' : 'i');
      
      return regex.test(content);
    } catch (error) {
      this.logger.warn('Invalid regex in filter:', error);
      return false;
    }
  }
}
```

### 最適化されたフィルター

```typescript
class OptimizedFilterMatcher {
  private compiledFilters: Map<string, CompiledFilter>;
  
  constructor() {
    this.compiledFilters = new Map();
  }
  
  compileFilter(filter: MessageFilter): CompiledFilter {
    const compiled: CompiledFilter = {
      id: filter.id,
      type: filter.type,
      matcher: this.createMatcher(filter)
    };
    
    this.compiledFilters.set(filter.id, compiled);
    return compiled;
  }
  
  private createMatcher(filter: MessageFilter): MatcherFunction {
    switch (filter.type) {
      case 'level':
        return this.createLevelMatcher(filter.condition);
        
      case 'content':
        return this.createContentMatcher(filter.condition);
        
      case 'regex':
        return this.createRegexMatcher(filter.condition);
        
      default:
        return () => true;
    }
  }
  
  private createLevelMatcher(condition: FilterCondition): MatcherFunction {
    if (condition.operator === 'in' && Array.isArray(condition.value)) {
      const levelSet = new Set(condition.value);
      return (message: ProcessedMessage) => levelSet.has(message.level);
    }
    
    return (message: ProcessedMessage) => message.level === condition.value;
  }
  
  private createContentMatcher(condition: FilterCondition): MatcherFunction {
    const caseSensitive = condition.caseSensitive !== false;
    const searchValue = caseSensitive ? 
                       condition.value as string : 
                       (condition.value as string).toLowerCase();
    
    if (condition.operator === 'contains') {
      return (message: ProcessedMessage) => {
        const content = caseSensitive ? message.raw : message.raw.toLowerCase();
        return content.includes(searchValue);
      };
    }
    
    return (message: ProcessedMessage) => {
      const content = caseSensitive ? message.raw : message.raw.toLowerCase();
      return content === searchValue;
    };
  }
  
  private createRegexMatcher(condition: FilterCondition): MatcherFunction {
    try {
      const regex = condition.value instanceof RegExp ? 
                    condition.value : 
                    new RegExp(condition.value as string, 
                              condition.caseSensitive ? '' : 'i');
      
      return (message: ProcessedMessage) => regex.test(message.raw);
    } catch (error) {
      this.logger.warn('Failed to compile regex filter:', error);
      return () => false;
    }
  }
}

type MatcherFunction = (message: ProcessedMessage) => boolean;

interface CompiledFilter {
  id: string;
  type: string;
  matcher: MatcherFunction;
}
```

## ⚡ パフォーマンス最適化

### メモリ効率的な実装

```typescript
// メッセージプールによるGC負荷軽減
class MessagePool {
  private pool: ProcessedMessage[] = [];
  private maxPoolSize: number = 100;
  
  acquire(): ProcessedMessage {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    
    return this.createNewMessage();
  }
  
  release(message: ProcessedMessage): void {
    if (this.pool.length < this.maxPoolSize) {
      this.resetMessage(message);
      this.pool.push(message);
    }
  }
  
  private resetMessage(message: ProcessedMessage): void {
    message.id = '';
    message.timestamp = 0;
    message.raw = '';
    message.parsed = undefined;
    // その他のフィールドをリセット
  }
}

// バッチ処理による効率化
class BatchProcessor {
  private batchQueue: ProcessedMessage[] = [];
  private batchSize: number = 10;
  private batchTimeout: number = 50;  // 50ms
  private timeoutId?: NodeJS.Timeout;
  
  enqueue(message: ProcessedMessage): void {
    this.batchQueue.push(message);
    
    if (this.batchQueue.length >= this.batchSize) {
      this.processBatch();
    } else if (!this.timeoutId) {
      this.timeoutId = setTimeout(() => this.processBatch(), this.batchTimeout);
    }
  }
  
  private processBatch(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
    
    if (this.batchQueue.length === 0) return;
    
    const batch = this.batchQueue.splice(0);
    this.distributeMessageBatch(batch);
  }
}
```

---

これらのアルゴリズムにより、VRChat Log Relay Server は高性能で信頼性の高いログ監視・配信システムを実現します。各アルゴリズムは最適化とエラーハンドリングを重視して設計されています。
