"use strict";
/**
 * VRChat Log Relay Server - ロガーユーティリティ
 *
 * Winston を使用したログ管理機能を提供します。
 * 開発環境とプロダクション環境で異なるログ設定を適用します。
 *
 * @created 2025-06-30
 * @updated 2025-06-30
 */
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.initializeLogger = initializeLogger;
exports.getLogger = getLogger;
exports.debug = debug;
exports.info = info;
exports.warn = warn;
exports.error = error;
exports.fatal = fatal;
exports.logVRChatProcess = logVRChatProcess;
exports.logFileWatcher = logFileWatcher;
exports.logWebSocket = logWebSocket;
exports.logMessageProcessor = logMessageProcessor;
exports.logServer = logServer;
exports.startPerformanceLog = startPerformanceLog;
exports.logMemoryUsage = logMemoryUsage;
exports.setLogLevel = setLogLevel;
exports.getLogLevel = getLogLevel;
exports.cleanupOldLogs = cleanupOldLogs;
var winston_1 = require("winston");
var path_1 = require("path");
var fs_1 = require("fs");
// =============================================================================
// デフォルト設定
// =============================================================================
/**
 * デフォルトのログ設定
 */
var DEFAULT_CONFIG = {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    console: true,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5
};
// =============================================================================
// カスタムログフォーマット
// =============================================================================
/**
 * コンソール用のカラーフォーマット
 */
var consoleFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.colorize({ all: true }), winston_1.default.format.printf(function (_a) {
    var timestamp = _a.timestamp, level = _a.level, message = _a.message, meta = __rest(_a, ["timestamp", "level", "message"]);
    var metaStr = Object.keys(meta).length ? "\n".concat(JSON.stringify(meta, null, 2)) : '';
    return "".concat(timestamp, " [").concat(level, "]: ").concat(message).concat(metaStr);
}));
/**
 * ファイル用のJSONフォーマット
 */
var fileFormat = winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json());
// =============================================================================
// ログディレクトリの作成
// =============================================================================
/**
 * ログディレクトリを作成する
 * @param filePath ログファイルのパス
 */
function ensureLogDirectory(filePath) {
    try {
        var logDir = path_1.default.dirname(filePath);
        if (!fs_1.default.existsSync(logDir)) {
            fs_1.default.mkdirSync(logDir, { recursive: true });
        }
    }
    catch (error) {
        console.error('ログディレクトリの作成に失敗しました:', error);
    }
}
// =============================================================================
// ロガーインスタンス作成
// =============================================================================
/**
 * ロガーインスタンス（シングルトン）
 */
var loggerInstance = null;
/**
 * ロガーを初期化する
 * @param config ログ設定
 * @returns 初期化されたロガーインスタンス
 */
function initializeLogger(config) {
    if (config === void 0) { config = {}; }
    // 設定をマージ
    var mergedConfig = __assign(__assign({}, DEFAULT_CONFIG), config);
    // トランスポート設定
    var transports = [];
    // コンソール出力設定
    if (mergedConfig.console) {
        transports.push(new winston_1.default.transports.Console({
            level: mergedConfig.level,
            format: consoleFormat
        }));
    }
    // ファイル出力設定
    if (mergedConfig.file) {
        try {
            ensureLogDirectory(mergedConfig.file);
            // 通常ログファイル
            transports.push(new winston_1.default.transports.File({
                filename: mergedConfig.file,
                level: mergedConfig.level,
                format: fileFormat,
                maxsize: mergedConfig.maxFileSize,
                maxFiles: mergedConfig.maxFiles,
                tailable: true
            }));
            // エラー専用ログファイル
            var errorLogFile = mergedConfig.file.replace(/\.log$/, '.error.log');
            transports.push(new winston_1.default.transports.File({
                filename: errorLogFile,
                level: 'error',
                format: fileFormat,
                maxsize: mergedConfig.maxFileSize,
                maxFiles: mergedConfig.maxFiles,
                tailable: true
            }));
        }
        catch (error) {
            console.error('ログファイル設定に失敗しました:', error);
        }
    }
    // ロガーインスタンス作成
    loggerInstance = winston_1.default.createLogger({
        level: mergedConfig.level,
        transports: transports,
        // プロセス終了時のログ処理
        exitOnError: false,
        // 例外ハンドリング
        exceptionHandlers: mergedConfig.file ? [
            new winston_1.default.transports.File({
                filename: mergedConfig.file.replace(/\.log$/, '.exceptions.log'),
                format: fileFormat
            })
        ] : undefined,
        // 未処理のPromise拒否ハンドリング
        rejectionHandlers: mergedConfig.file ? [
            new winston_1.default.transports.File({
                filename: mergedConfig.file.replace(/\.log$/, '.rejections.log'),
                format: fileFormat
            })
        ] : undefined
    });
    return loggerInstance;
}
/**
 * 現在のロガーインスタンスを取得する
 * @returns ロガーインスタンス
 */
function getLogger() {
    if (!loggerInstance) {
        // デフォルト設定でロガーを初期化
        loggerInstance = initializeLogger();
    }
    return loggerInstance;
}
// =============================================================================
// 便利なログ関数
// =============================================================================
/**
 * デバッグメッセージをログ出力
 * @param message メッセージ
 * @param meta 追加メタデータ
 */
function debug(message, meta) {
    if (meta === void 0) { meta = {}; }
    getLogger().debug(message, meta);
}
/**
 * 情報メッセージをログ出力
 * @param message メッセージ
 * @param meta 追加メタデータ
 */
function info(message, meta) {
    if (meta === void 0) { meta = {}; }
    getLogger().info(message, meta);
}
/**
 * 警告メッセージをログ出力
 * @param message メッセージ
 * @param meta 追加メタデータ
 */
function warn(message, meta) {
    if (meta === void 0) { meta = {}; }
    getLogger().warn(message, meta);
}
/**
 * エラーメッセージをログ出力
 * @param message メッセージ
 * @param error エラーオブジェクト（オプション）
 * @param meta 追加メタデータ
 */
function error(message, error, meta) {
    if (meta === void 0) { meta = {}; }
    var errorMeta = __assign(__assign({}, meta), (error && {
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack
        }
    }));
    getLogger().error(message, errorMeta);
}
/**
 * 致命的エラーメッセージをログ出力
 * @param message メッセージ
 * @param error エラーオブジェクト（オプション）
 * @param meta 追加メタデータ
 */
function fatal(message, error, meta) {
    if (meta === void 0) { meta = {}; }
    var errorMeta = __assign(__assign({}, meta), (error && {
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack
        }
    }));
    getLogger().error(message, __assign(__assign({}, errorMeta), { level: 'fatal' }));
}
// =============================================================================
// VRChat Log Relay Server 専用ログ関数
// =============================================================================
/**
 * VRChatプロセス関連のログ
 * @param message メッセージ
 * @param processInfo プロセス情報
 */
function logVRChatProcess(message, processInfo) {
    if (processInfo === void 0) { processInfo = {}; }
    info(message, __assign({ component: 'VRChatProcess' }, processInfo));
}
/**
 * ファイル監視関連のログ
 * @param message メッセージ
 * @param fileInfo ファイル情報
 */
function logFileWatcher(message, fileInfo) {
    if (fileInfo === void 0) { fileInfo = {}; }
    debug(message, __assign({ component: 'FileWatcher' }, fileInfo));
}
/**
 * WebSocket関連のログ
 * @param message メッセージ
 * @param connectionInfo 接続情報
 */
function logWebSocket(message, connectionInfo) {
    if (connectionInfo === void 0) { connectionInfo = {}; }
    debug(message, __assign({ component: 'WebSocket' }, connectionInfo));
}
/**
 * メッセージ処理関連のログ
 * @param message メッセージ
 * @param messageInfo メッセージ情報
 */
function logMessageProcessor(message, messageInfo) {
    if (messageInfo === void 0) { messageInfo = {}; }
    debug(message, __assign({ component: 'MessageProcessor' }, messageInfo));
}
/**
 * サーバー関連のログ
 * @param message メッセージ
 * @param serverInfo サーバー情報
 */
function logServer(message, serverInfo) {
    if (serverInfo === void 0) { serverInfo = {}; }
    info(message, __assign({ component: 'Server' }, serverInfo));
}
// =============================================================================
// パフォーマンス測定用ログ関数
// =============================================================================
/**
 * パフォーマンス測定開始
 * @param label 測定ラベル
 * @returns 測定終了関数
 */
function startPerformanceLog(label) {
    var start = Date.now();
    debug("Performance: ".concat(label, " - \u958B\u59CB"));
    return function () {
        var duration = Date.now() - start;
        debug("Performance: ".concat(label, " - \u5B8C\u4E86"), { duration: "".concat(duration, "ms") });
    };
}
/**
 * メモリ使用量をログ出力
 * @param label ラベル
 */
function logMemoryUsage(label) {
    if (label === void 0) { label = 'Memory Usage'; }
    var usage = process.memoryUsage();
    var formatBytes = function (bytes) { return (bytes / 1024 / 1024).toFixed(2) + ' MB'; };
    debug(label, {
        rss: formatBytes(usage.rss),
        heapTotal: formatBytes(usage.heapTotal),
        heapUsed: formatBytes(usage.heapUsed),
        external: formatBytes(usage.external)
    });
}
// =============================================================================
// ログレベル動的変更
// =============================================================================
/**
 * ログレベルを動的に変更する
 * @param level 新しいログレベル
 */
function setLogLevel(level) {
    var logger = getLogger();
    logger.level = level;
    info("\u30ED\u30B0\u30EC\u30D9\u30EB\u3092\u5909\u66F4\u3057\u307E\u3057\u305F: ".concat(level));
}
/**
 * 現在のログレベルを取得する
 * @returns 現在のログレベル
 */
function getLogLevel() {
    return getLogger().level;
}
// =============================================================================
// ログローテーション・クリーンアップ
// =============================================================================
/**
 * 古いログファイルをクリーンアップする
 * @param logDirectory ログディレクトリ
 * @param daysToKeep 保持日数
 */
function cleanupOldLogs(logDirectory_1) {
    return __awaiter(this, arguments, void 0, function (logDirectory, daysToKeep) {
        var cutoffDate, files, _i, files_1, file, filePath, stats;
        if (daysToKeep === void 0) { daysToKeep = 7; }
        return __generator(this, function (_a) {
            try {
                if (!fs_1.default.existsSync(logDirectory)) {
                    return [2 /*return*/];
                }
                cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
                files = fs_1.default.readdirSync(logDirectory);
                for (_i = 0, files_1 = files; _i < files_1.length; _i++) {
                    file = files_1[_i];
                    if (file.endsWith('.log')) {
                        filePath = path_1.default.join(logDirectory, file);
                        stats = fs_1.default.statSync(filePath);
                        if (stats.mtime < cutoffDate) {
                            fs_1.default.unlinkSync(filePath);
                            info("\u53E4\u3044\u30ED\u30B0\u30D5\u30A1\u30A4\u30EB\u3092\u524A\u9664\u3057\u307E\u3057\u305F: ".concat(file));
                        }
                    }
                }
            }
            catch (err) {
                error('ログファイルクリーンアップに失敗しました', err);
            }
            return [2 /*return*/];
        });
    });
}
// =============================================================================
// デフォルトエクスポート
// =============================================================================
/**
 * デフォルトロガーインスタンス
 */
exports.default = getLogger;
/**
 * 名前付きエクスポート（便利なアクセス用）
 */
exports.logger = getLogger();
