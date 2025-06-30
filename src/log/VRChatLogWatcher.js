"use strict";
/**
 * VRChatLogWatcher - VRChatログ監視クラス
 *
 * VRChatのプロセス監視、ログディレクトリ監視、ログファイル監視を統合的に行う
 * vrc-tail準拠のアルゴリズムでファイル選択を実行
 *
 * @created 2025-06-30
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VRChatLogWatcher = void 0;
var events_1 = require("events");
var path = require("path");
var fs = require("fs/promises");
var fsSync = require("fs");
var child_process_1 = require("child_process");
var util_1 = require("util");
var chokidar = require("chokidar");
var tail_1 = require("tail");
var types_1 = require("../types");
var logger_1 = require("../utils/logger");
var execAsync = (0, util_1.promisify)(child_process_1.exec);
var logger = (0, logger_1.getLogger)();
/**
 * VRChatログ監視クラス
 *
 * 主要機能:
 * - VRChatプロセスの監視（起動/終了検知）
 * - ログディレクトリの監視（作成/削除検知）
 * - 複数ログファイルの同時監視（vrc-tail準拠）
 * - ログ行の配信
 */
var VRChatLogWatcher = /** @class */ (function (_super) {
    __extends(VRChatLogWatcher, _super);
    function VRChatLogWatcher(config) {
        if (config === void 0) { config = {}; }
        var _this = _super.call(this) || this;
        _this.logDirectory = null;
        _this.vrchatStatus = types_1.VRChatStatus.NOT_RUNNING;
        _this.processInfo = null;
        // 監視関連
        _this.processTimer = null;
        _this.directoryWatcher = null;
        _this.fileTails = new Map();
        // 状態管理
        _this.isWatching = false;
        _this.lastStatusChange = Date.now();
        // デフォルト設定をマージ
        _this.config = __assign({ groupPeriod: 30, maxFiles: 4, processCheckInterval: 5000, directoryWatchOptions: {
                usePolling: false,
                depth: 1,
                ignoreInitial: false
            } }, config);
        logger.info('VRChatLogWatcher initialized', { config: _this.config });
        return _this;
    }
    // =============================================================================
    // 公開メソッド
    // =============================================================================
    /**
     * ログ監視を開始
     */
    VRChatLogWatcher.prototype.startWatching = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.isWatching) {
                            logger.warn('VRChatLogWatcher is already watching');
                            return [2 /*return*/];
                        }
                        logger.info('Starting VRChat log watching');
                        this.isWatching = true;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        // 1. VRChatプロセス監視を開始
                        return [4 /*yield*/, this.startProcessMonitoring()];
                    case 2:
                        // 1. VRChatプロセス監視を開始
                        _a.sent();
                        // 2. ログディレクトリを特定
                        return [4 /*yield*/, this.determineLogDirectory()];
                    case 3:
                        // 2. ログディレクトリを特定
                        _a.sent();
                        if (!(this.logDirectory && fsSync.existsSync(this.logDirectory))) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.startDirectoryWatching()];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, this.startLogFileWatching()];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6:
                        logger.info('VRChat log watching started successfully');
                        this.emit('watching_started');
                        return [3 /*break*/, 8];
                    case 7:
                        error_1 = _a.sent();
                        this.isWatching = false;
                        logger.error('Failed to start VRChat log watching', error_1);
                        throw error_1;
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * ログ監視を停止
     */
    VRChatLogWatcher.prototype.stopWatching = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.isWatching) {
                            return [2 /*return*/];
                        }
                        logger.info('Stopping VRChat log watching');
                        this.isWatching = false;
                        // プロセス監視停止
                        if (this.processTimer) {
                            clearInterval(this.processTimer);
                            this.processTimer = null;
                        }
                        if (!this.directoryWatcher) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.directoryWatcher.close()];
                    case 1:
                        _a.sent();
                        this.directoryWatcher = null;
                        _a.label = 2;
                    case 2: 
                    // ファイル監視停止
                    return [4 /*yield*/, this.stopLogFileWatching()];
                    case 3:
                        // ファイル監視停止
                        _a.sent();
                        logger.info('VRChat log watching stopped');
                        this.emit('watching_stopped');
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 現在のVRChat状態を取得
     */
    VRChatLogWatcher.prototype.getVRChatStatus = function () {
        return this.vrchatStatus;
    };
    /**
     * 現在監視中のファイル一覧を取得
     */
    VRChatLogWatcher.prototype.getMonitoredFiles = function () {
        return Array.from(this.fileTails.keys());
    };
    /**
     * VRChatプロセス情報を取得
     */
    VRChatLogWatcher.prototype.getProcessInfo = function () {
        return this.processInfo;
    };
    // =============================================================================
    // VRChatプロセス監視
    // =============================================================================
    /**
     * プロセス監視を開始
     */
    VRChatLogWatcher.prototype.startProcessMonitoring = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.info('Starting VRChat process monitoring');
                        // 初回チェック
                        return [4 /*yield*/, this.checkVRChatProcess()];
                    case 1:
                        // 初回チェック
                        _a.sent();
                        // 定期監視を開始
                        this.processTimer = setInterval(function () {
                            _this.checkVRChatProcess().catch(function (error) {
                                logger.error('Process check failed', error);
                            });
                        }, this.config.processCheckInterval);
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * VRChatプロセスをチェック
     */
    VRChatLogWatcher.prototype.checkVRChatProcess = function () {
        return __awaiter(this, void 0, void 0, function () {
            var processInfo, currentStatus, previousStatus, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 6, , 7]);
                        return [4 /*yield*/, this.detectVRChatProcess()];
                    case 1:
                        processInfo = _a.sent();
                        currentStatus = processInfo ? types_1.VRChatStatus.RUNNING : types_1.VRChatStatus.NOT_RUNNING;
                        if (!(currentStatus !== this.vrchatStatus)) return [3 /*break*/, 5];
                        previousStatus = this.vrchatStatus;
                        this.vrchatStatus = currentStatus;
                        this.processInfo = processInfo;
                        this.lastStatusChange = Date.now();
                        logger.info('VRChat status changed', {
                            from: previousStatus,
                            to: currentStatus,
                            processInfo: processInfo
                        });
                        this.emit('vrchat_status_change', {
                            previousStatus: previousStatus,
                            currentStatus: currentStatus,
                            processInfo: processInfo,
                            timestamp: this.lastStatusChange
                        });
                        if (!(currentStatus === types_1.VRChatStatus.RUNNING)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.onVRChatStarted()];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 3: return [4 /*yield*/, this.onVRChatStopped()];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        error_2 = _a.sent();
                        logger.error('Failed to check VRChat process', error_2);
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * VRChatプロセスを検出（複数手法を試行）
     */
    VRChatLogWatcher.prototype.detectVRChatProcess = function () {
        return __awaiter(this, void 0, void 0, function () {
            var detectionMethods, _i, detectionMethods_1, method, retry, startTime, result, duration, error_3;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        detectionMethods = [
                            {
                                name: 'wmic_direct',
                                priority: 1,
                                execute: function () { return __awaiter(_this, void 0, void 0, function () {
                                    var stdout;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, execAsync('wmic process where "name=\'VRChat.exe\'" get ProcessId /format:value', { timeout: 10000, encoding: 'utf8' })];
                                            case 1:
                                                stdout = (_a.sent()).stdout;
                                                return [2 /*return*/, this.parseWmicOutput(stdout)];
                                        }
                                    });
                                }); }
                            },
                            {
                                name: 'tasklist_filter',
                                priority: 2,
                                execute: function () { return __awaiter(_this, void 0, void 0, function () {
                                    var stdout;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, execAsync('tasklist /FI "IMAGENAME eq VRChat.exe" /NH', { timeout: 10000, encoding: 'utf8' })];
                                            case 1:
                                                stdout = (_a.sent()).stdout;
                                                return [2 /*return*/, this.parseTasklistOutput(stdout)];
                                        }
                                    });
                                }); }
                            },
                            {
                                name: 'wmic_commandline',
                                priority: 3,
                                execute: function () { return __awaiter(_this, void 0, void 0, function () {
                                    var stdout;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, execAsync('wmic process where "commandline like \'%VRChat%\'" get ProcessId /format:value', { timeout: 10000, encoding: 'utf8' })];
                                            case 1:
                                                stdout = (_a.sent()).stdout;
                                                return [2 /*return*/, this.parseWmicOutput(stdout)];
                                        }
                                    });
                                }); }
                            }
                        ];
                        _i = 0, detectionMethods_1 = detectionMethods;
                        _a.label = 1;
                    case 1:
                        if (!(_i < detectionMethods_1.length)) return [3 /*break*/, 10];
                        method = detectionMethods_1[_i];
                        retry = 0;
                        _a.label = 2;
                    case 2:
                        if (!(retry < 3)) return [3 /*break*/, 9];
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 5, , 8]);
                        startTime = Date.now();
                        return [4 /*yield*/, method.execute()];
                    case 4:
                        result = _a.sent();
                        duration = Date.now() - startTime;
                        if (result) {
                            logger.debug("Process detected using ".concat(method.name, " in ").concat(duration, "ms"));
                            return [2 /*return*/, result];
                        }
                        logger.debug("No process found with ".concat(method.name, " (").concat(duration, "ms)"));
                        return [3 /*break*/, 9]; // 成功したが見つからなかった場合はリトライしない
                    case 5:
                        error_3 = _a.sent();
                        logger.warn("Detection method ".concat(method.name, " failed (retry ").concat(retry + 1, "/3):"), error_3);
                        if (!(retry < 2)) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.delay(1000)];
                    case 6:
                        _a.sent(); // 1秒待機してリトライ
                        _a.label = 7;
                    case 7: return [3 /*break*/, 8];
                    case 8:
                        retry++;
                        return [3 /*break*/, 2];
                    case 9:
                        _i++;
                        return [3 /*break*/, 1];
                    case 10: return [2 /*return*/, null]; // すべての方法で検知失敗
                }
            });
        });
    };
    /**
     * WMIC出力を解析
     */
    VRChatLogWatcher.prototype.parseWmicOutput = function (output) {
        var lines = output.split('\n').filter(function (line) { return line.trim(); });
        for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
            var line = lines_1[_i];
            var match = line.match(/ProcessId=(\d+)/);
            if (match) {
                var processId = parseInt(match[1], 10);
                if (processId > 0) {
                    return {
                        processId: processId,
                        processName: 'VRChat.exe',
                        startTime: new Date(),
                        detectionMethod: 'wmic'
                    };
                }
            }
        }
        return null;
    };
    /**
     * Tasklist出力を解析
     */
    VRChatLogWatcher.prototype.parseTasklistOutput = function (output) {
        var lines = output.split('\n').filter(function (line) { return line.trim(); });
        for (var _i = 0, lines_2 = lines; _i < lines_2.length; _i++) {
            var line = lines_2[_i];
            if (line.includes('VRChat.exe')) {
                var parts = line.split(/\s+/);
                if (parts.length >= 2) {
                    var processId = parseInt(parts[1], 10);
                    if (processId > 0) {
                        return {
                            processId: processId,
                            processName: 'VRChat.exe',
                            startTime: new Date(),
                            detectionMethod: 'tasklist'
                        };
                    }
                }
            }
        }
        return null;
    };
    /**
     * 指定時間待機
     */
    VRChatLogWatcher.prototype.delay = function (ms) {
        return new Promise(function (resolve) { return setTimeout(resolve, ms); });
    };
    /**
     * VRChat開始時の処理
     */
    VRChatLogWatcher.prototype.onVRChatStarted = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.info('VRChat started - initializing log monitoring');
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        return [4 /*yield*/, this.determineLogDirectory()];
                    case 2:
                        _a.sent();
                        if (!this.logDirectory) return [3 /*break*/, 6];
                        if (!fsSync.existsSync(this.logDirectory)) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.startDirectoryWatching()];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, this.startLogFileWatching()];
                    case 4:
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        // ディレクトリの作成を待機
                        logger.info('Waiting for log directory creation', { logDirectory: this.logDirectory });
                        _a.label = 6;
                    case 6: return [3 /*break*/, 8];
                    case 7:
                        error_4 = _a.sent();
                        logger.error('Failed to initialize log monitoring on VRChat start', error_4);
                        return [3 /*break*/, 8];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * VRChat停止時の処理
     */
    VRChatLogWatcher.prototype.onVRChatStopped = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.info('VRChat stopped - cleaning up log monitoring');
                        // ファイル監視を停止
                        return [4 /*yield*/, this.stopLogFileWatching()];
                    case 1:
                        // ファイル監視を停止
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    // =============================================================================
    // ログディレクトリ監視
    // =============================================================================
    /**
     * ログディレクトリを特定
     */
    VRChatLogWatcher.prototype.determineLogDirectory = function () {
        return __awaiter(this, void 0, void 0, function () {
            var localAppData;
            return __generator(this, function (_a) {
                if (this.config.logDirectory) {
                    this.logDirectory = this.config.logDirectory;
                    logger.info('Using configured log directory', { logDirectory: this.logDirectory });
                    return [2 /*return*/];
                }
                localAppData = process.env.LOCALAPPDATA;
                if (!localAppData) {
                    throw new Error('LOCALAPPDATA environment variable not found');
                }
                this.logDirectory = path.join(localAppData, 'Low', 'VRChat', 'VRChat');
                logger.info('Auto-detected log directory', { logDirectory: this.logDirectory });
                return [2 /*return*/];
            });
        });
    };
    /**
     * ディレクトリ監視を開始
     */
    VRChatLogWatcher.prototype.startDirectoryWatching = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                if (!this.logDirectory) {
                    throw new Error('Log directory not determined');
                }
                logger.info('Starting directory watching', { logDirectory: this.logDirectory });
                this.directoryWatcher = chokidar.watch(this.logDirectory, __assign(__assign({}, this.config.directoryWatchOptions), { ignoreInitial: true // 初期ファイルは別途処理
                 }));
                this.directoryWatcher
                    .on('add', function (filePath) { return _this.onLogFileAdded(filePath); })
                    .on('unlink', function (filePath) { return _this.onLogFileRemoved(filePath); })
                    .on('error', function (error) {
                    logger.error('Directory watcher error', error);
                });
                return [2 /*return*/];
            });
        });
    };
    /**
     * ログファイル追加時の処理
     */
    VRChatLogWatcher.prototype.onLogFileAdded = function (filePath) {
        var fileName = path.basename(filePath);
        // output_log_*.txt パターンのチェック
        if (this.isVRChatLogFile(fileName)) {
            logger.info('New VRChat log file detected', { filePath: filePath });
            // ファイル選択アルゴリズムを再実行
            this.updateLogFileWatching();
        }
    };
    /**
     * ログファイル削除時の処理
     */
    VRChatLogWatcher.prototype.onLogFileRemoved = function (filePath) {
        var fileName = path.basename(filePath);
        if (this.isVRChatLogFile(fileName)) {
            logger.info('VRChat log file removed', { filePath: filePath });
            // 監視から除去
            if (this.fileTails.has(filePath)) {
                this.removeLogFileWatching(filePath);
            }
            // ファイル選択アルゴリズムを再実行
            this.updateLogFileWatching();
        }
    };
    // =============================================================================
    // ログファイル監視
    // =============================================================================
    /**
     * ログファイル監視を開始
     */
    VRChatLogWatcher.prototype.startLogFileWatching = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.logDirectory) {
                            throw new Error('Log directory not determined');
                        }
                        logger.info('Starting log file watching');
                        return [4 /*yield*/, this.updateLogFileWatching()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * ログファイル監視を更新（vrc-tail準拠のファイル選択）
     */
    VRChatLogWatcher.prototype.updateLogFileWatching = function () {
        return __awaiter(this, void 0, void 0, function () {
            var files, targetFiles, _loop_1, this_1, _i, _a, filePath, _b, targetFiles_1, file, error_5;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!this.logDirectory)
                            return [2 /*return*/];
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.scanLogFiles()];
                    case 2:
                        files = _c.sent();
                        targetFiles = this.selectTargetFiles(files);
                        logger.info('Selected log files for watching', {
                            totalFiles: files.length,
                            selectedFiles: targetFiles.map(function (f) { return f.fileName; })
                        });
                        _loop_1 = function (filePath) {
                            if (!targetFiles.some(function (f) { return f.filePath === filePath; })) {
                                this_1.removeLogFileWatching(filePath);
                            }
                        };
                        this_1 = this;
                        // 現在監視中で、新しい選択に含まれないファイルを停止
                        for (_i = 0, _a = this.fileTails; _i < _a.length; _i++) {
                            filePath = _a[_i][0];
                            _loop_1(filePath);
                        }
                        // 新しく選択されたファイルの監視を開始
                        for (_b = 0, targetFiles_1 = targetFiles; _b < targetFiles_1.length; _b++) {
                            file = targetFiles_1[_b];
                            if (!this.fileTails.has(file.filePath)) {
                                this.addLogFileWatching(file.filePath);
                            }
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        error_5 = _c.sent();
                        logger.error('Failed to update log file watching', error_5);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * ログファイルをスキャン
     */
    VRChatLogWatcher.prototype.scanLogFiles = function () {
        return __awaiter(this, void 0, void 0, function () {
            var files, logFiles, _i, files_1, fileName, filePath, stats, timestamp, statError_1, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.logDirectory)
                            return [2 /*return*/, []];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 9, , 10]);
                        return [4 /*yield*/, fs.readdir(this.logDirectory)];
                    case 2:
                        files = _a.sent();
                        logFiles = [];
                        _i = 0, files_1 = files;
                        _a.label = 3;
                    case 3:
                        if (!(_i < files_1.length)) return [3 /*break*/, 8];
                        fileName = files_1[_i];
                        if (!this.isVRChatLogFile(fileName)) return [3 /*break*/, 7];
                        filePath = path.join(this.logDirectory, fileName);
                        _a.label = 4;
                    case 4:
                        _a.trys.push([4, 6, , 7]);
                        return [4 /*yield*/, fs.stat(filePath)];
                    case 5:
                        stats = _a.sent();
                        timestamp = this.parseTimestampFromFilename(fileName);
                        logFiles.push({
                            filePath: filePath,
                            fileName: fileName,
                            timestamp: timestamp,
                            size: stats.size
                        });
                        return [3 /*break*/, 7];
                    case 6:
                        statError_1 = _a.sent();
                        logger.warn('Failed to stat log file', { fileName: fileName, error: statError_1 });
                        return [3 /*break*/, 7];
                    case 7:
                        _i++;
                        return [3 /*break*/, 3];
                    case 8: return [2 /*return*/, logFiles];
                    case 9:
                        error_6 = _a.sent();
                        logger.error('Failed to scan log files', error_6);
                        return [2 /*return*/, []];
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * vrc-tail準拠のファイル選択アルゴリズム
     */
    VRChatLogWatcher.prototype.selectTargetFiles = function (files) {
        if (files.length === 0)
            return [];
        // 1. 時刻でソート（新しい順）
        var sorted = __spreadArray([], files, true).sort(function (a, b) { return b.timestamp - a.timestamp; });
        // 2. グループ期間に基づく選択
        var result = [];
        var lastTimestamp = 0;
        for (var _i = 0, sorted_1 = sorted; _i < sorted_1.length; _i++) {
            var file = sorted_1[_i];
            if (result.length === 0) {
                result.push(file);
                lastTimestamp = file.timestamp;
                continue;
            }
            // グループ期間内のファイルを追加
            if (lastTimestamp - file.timestamp <= this.config.groupPeriod * 1000) {
                result.unshift(file); // 古い順に並べる
            }
            else {
                // 新しいグループ開始 - 古いファイルは破棄
                result.length = 0;
                result.push(file);
                lastTimestamp = file.timestamp;
            }
            if (result.length >= this.config.maxFiles)
                break;
        }
        return result;
    };
    /**
     * 単一ファイルの監視を追加
     */
    VRChatLogWatcher.prototype.addLogFileWatching = function (filePath) {
        var _this = this;
        try {
            logger.info('Adding log file to watching', { filePath: filePath });
            var tail = new tail_1.Tail(filePath, {
                fromBeginning: false,
                follow: true,
                useWatchFile: true
            });
            tail.on('line', function (line) {
                _this.onLogLine(line, filePath);
            });
            tail.on('error', function (error) {
                logger.error('Tail error', { filePath: filePath, error: error });
            });
            this.fileTails.set(filePath, tail);
        }
        catch (error) {
            logger.error('Failed to add log file watching', { filePath: filePath, error: error });
        }
    };
    /**
     * 単一ファイルの監視を削除
     */
    VRChatLogWatcher.prototype.removeLogFileWatching = function (filePath) {
        var tail = this.fileTails.get(filePath);
        if (tail) {
            logger.info('Removing log file from watching', { filePath: filePath });
            try {
                tail.unwatch();
            }
            catch (error) {
                logger.warn('Failed to unwatch tail', { filePath: filePath, error: error });
            }
            this.fileTails.delete(filePath);
        }
    };
    /**
     * すべてのログファイル監視を停止
     */
    VRChatLogWatcher.prototype.stopLogFileWatching = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, _b, filePath, tail;
            return __generator(this, function (_c) {
                logger.info('Stopping all log file watching');
                for (_i = 0, _a = this.fileTails; _i < _a.length; _i++) {
                    _b = _a[_i], filePath = _b[0], tail = _b[1];
                    try {
                        tail.unwatch();
                    }
                    catch (error) {
                        logger.warn('Failed to unwatch tail', { filePath: filePath, error: error });
                    }
                }
                this.fileTails.clear();
                return [2 /*return*/];
            });
        });
    };
    /**
     * ログ行を受信した時の処理
     */
    VRChatLogWatcher.prototype.onLogLine = function (line, filePath) {
        var metadata = {
            source: types_1.LogSource.VRCHAT,
            filePath: filePath,
            fileName: path.basename(filePath),
            timestamp: Date.now(),
            lineNumber: 0 // Tailライブラリからは取得不可
        };
        this.emit('log_line', line, metadata);
    };
    // =============================================================================
    // ユーティリティメソッド
    // =============================================================================
    /**
     * ファイル名がVRChatログファイルかどうかを判定
     */
    VRChatLogWatcher.prototype.isVRChatLogFile = function (fileName) {
        return /^output_log_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.txt$/.test(fileName);
    };
    /**
     * ファイル名からタイムスタンプを解析
     */
    VRChatLogWatcher.prototype.parseTimestampFromFilename = function (fileName) {
        var match = fileName.match(/^output_log_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.txt$/);
        if (!match) {
            return 0;
        }
        var year = match[1], month = match[2], day = match[3], hour = match[4], minute = match[5], second = match[6];
        var date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, // 月は0ベース
        parseInt(day, 10), parseInt(hour, 10), parseInt(minute, 10), parseInt(second, 10));
        return date.getTime();
    };
    return VRChatLogWatcher;
}(events_1.EventEmitter));
exports.VRChatLogWatcher = VRChatLogWatcher;
