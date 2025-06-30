"use strict";
/**
 * VRChatプロセス監視 - 実動テストスクリプト
 *
 * VRChatの起動・終了をリアルタイムで監視し、
 * 状態変更を詳細にログ出力します。
 *
 * 使用方法:
 * 1. このスクリプトを実行
 * 2. VRChatを起動/終了して動作確認
 * 3. Ctrl+C で監視停止
 *
 * @created 2025-06-30
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
var VRChatLogWatcher_1 = require("./src/log/VRChatLogWatcher");
var types_1 = require("./src/types");
var VRChatMonitorTest = /** @class */ (function () {
    function VRChatMonitorTest() {
        this.startTime = new Date();
        // テスト用の短い間隔設定
        this.watcher = new VRChatLogWatcher_1.VRChatLogWatcher({
            processCheckInterval: 2000, // 2秒間隔（頻繁にチェック）
            groupPeriod: 30,
            maxFiles: 4
        });
        this.setupEventHandlers();
        this.setupSignalHandlers();
    }
    VRChatMonitorTest.prototype.setupEventHandlers = function () {
        var _this = this;
        // VRChat状態変更イベント
        this.watcher.on('vrchat_status_change', function (event) {
            var timestamp = new Date().toLocaleString('ja-JP');
            var elapsed = Date.now() - _this.startTime.getTime();
            console.log('\n🔄 =================================');
            console.log("\uD83D\uDCC5 \u6642\u523B: ".concat(timestamp));
            console.log("\u23F1\uFE0F  \u76E3\u8996\u958B\u59CB\u304B\u3089\u306E\u7D4C\u904E\u6642\u9593: ".concat(Math.floor(elapsed / 1000), "\u79D2"));
            console.log("\uD83D\uDCCA \u72B6\u614B\u5909\u66F4: ".concat(event.previousStatus, " \u2192 ").concat(event.currentStatus));
            if (event.processInfo) {
                console.log("\uD83C\uDFAF \u30D7\u30ED\u30BB\u30B9\u60C5\u5831:");
                console.log("   - PID: ".concat(event.processInfo.processId));
                console.log("   - \u30D7\u30ED\u30BB\u30B9\u540D: ".concat(event.processInfo.processName));
                console.log("   - \u691C\u77E5\u65B9\u6CD5: ".concat(event.processInfo.detectionMethod));
                console.log("   - \u691C\u77E5\u6642\u523B: ".concat(event.processInfo.startTime.toLocaleString('ja-JP')));
            }
            else {
                console.log("\u26A0\uFE0F  \u30D7\u30ED\u30BB\u30B9\u60C5\u5831: \u306A\u3057\uFF08VRChat\u7D42\u4E86\uFF09");
            }
            // VRChat起動時のメッセージ
            if (event.currentStatus === types_1.VRChatStatus.RUNNING) {
                console.log("\n\uD83C\uDF89 VRChat\u304C\u8D77\u52D5\u3055\u308C\u307E\u3057\u305F\uFF01");
                console.log("\uD83D\uDD0D \u30ED\u30B0\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA\u306E\u76E3\u8996\u3092\u958B\u59CB\u3057\u307E\u3059...");
            }
            // VRChat終了時のメッセージ
            if (event.currentStatus === types_1.VRChatStatus.NOT_RUNNING) {
                console.log("\n\uD83D\uDC4B VRChat\u304C\u7D42\u4E86\u3055\u308C\u307E\u3057\u305F\u3002");
                console.log("\u23F9\uFE0F  \u30ED\u30B0\u30D5\u30A1\u30A4\u30EB\u76E3\u8996\u3092\u505C\u6B62\u3057\u307E\u3059\u3002");
            }
            console.log('=================================\n');
        });
        // 監視開始イベント
        this.watcher.on('watching_started', function () {
            console.log("\n\u2705 VRChat\u76E3\u8996\u3092\u958B\u59CB\u3057\u307E\u3057\u305F");
            console.log("\uD83D\uDD0D \u30D7\u30ED\u30BB\u30B9\u76E3\u8996\u9593\u9694: 2\u79D2");
            console.log("\uD83D\uDCC1 \u30ED\u30B0\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA: \u81EA\u52D5\u691C\u77E5");
            console.log("\n\uD83D\uDCA1 VRChat\u3092\u8D77\u52D5/\u7D42\u4E86\u3057\u3066\u52D5\u4F5C\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044");
            console.log("\u274C \u76E3\u8996\u3092\u505C\u6B62\u3059\u308B\u306B\u306F Ctrl+C \u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\n");
        });
        // 監視停止イベント
        this.watcher.on('watching_stopped', function () {
            console.log("\n\uD83D\uDED1 VRChat\u76E3\u8996\u3092\u505C\u6B62\u3057\u307E\u3057\u305F");
        });
        // ログファイル検知イベント
        this.watcher.on('log_file_detected', function (event) {
            console.log("\uD83D\uDCC4 \u30ED\u30B0\u30D5\u30A1\u30A4\u30EB\u691C\u77E5: ".concat(event.fileName));
        });
        // ログ行受信イベント
        this.watcher.on('log_line', function (line, metadata) {
            var timestamp = new Date().toLocaleTimeString('ja-JP');
            console.log("[".concat(timestamp, "] \uD83D\uDCDD ").concat(line.trim()));
        });
    };
    VRChatMonitorTest.prototype.setupSignalHandlers = function () {
        var _this = this;
        // Ctrl+C での正常終了
        process.on('SIGINT', function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log('\n\n🛑 監視停止要求を受信しました...');
                        return [4 /*yield*/, this.stop()];
                    case 1:
                        _a.sent();
                        process.exit(0);
                        return [2 /*return*/];
                }
            });
        }); });
        // その他のシグナルでの正常終了
        process.on('SIGTERM', function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log('\n\n🛑 プロセス終了要求を受信しました...');
                        return [4 /*yield*/, this.stop()];
                    case 1:
                        _a.sent();
                        process.exit(0);
                        return [2 /*return*/];
                }
            });
        }); });
    };
    VRChatMonitorTest.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            var currentStatus, processInfo, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        console.log('🚀 VRChatプロセス監視テストを開始します...\n');
                        currentStatus = this.watcher.getVRChatStatus();
                        processInfo = this.watcher.getProcessInfo();
                        console.log("\uD83D\uDCCA \u521D\u671F\u72B6\u614B: ".concat(currentStatus));
                        if (processInfo) {
                            console.log("\uD83C\uDFAF \u691C\u77E5\u6E08\u307F\u30D7\u30ED\u30BB\u30B9: PID ".concat(processInfo.processId));
                        }
                        return [4 /*yield*/, this.watcher.startWatching()];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        console.error('❌ 監視開始エラー:', error_1);
                        process.exit(1);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    VRChatMonitorTest.prototype.stop = function () {
        return __awaiter(this, void 0, void 0, function () {
            var endTime, totalTime, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.watcher.stopWatching()];
                    case 1:
                        _a.sent();
                        endTime = new Date();
                        totalTime = Math.floor((endTime.getTime() - this.startTime.getTime()) / 1000);
                        console.log("\n\uD83D\uDCCA \u76E3\u8996\u7D71\u8A08:");
                        console.log("   - \u958B\u59CB\u6642\u523B: ".concat(this.startTime.toLocaleString('ja-JP')));
                        console.log("   - \u7D42\u4E86\u6642\u523B: ".concat(endTime.toLocaleString('ja-JP')));
                        console.log("   - \u7DCF\u76E3\u8996\u6642\u9593: ".concat(totalTime, "\u79D2"));
                        console.log("\n\uD83D\uDC4B \u30C6\u30B9\u30C8\u5B8C\u4E86");
                        return [3 /*break*/, 3];
                    case 2:
                        error_2 = _a.sent();
                        console.error('❌ 監視停止エラー:', error_2);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    // 現在の状態を表示
    VRChatMonitorTest.prototype.printCurrentStatus = function () {
        var status = this.watcher.getVRChatStatus();
        var processInfo = this.watcher.getProcessInfo();
        var monitoredFiles = this.watcher.getMonitoredFiles();
        console.log("\n\uD83D\uDCCA \u73FE\u5728\u306E\u72B6\u614B:");
        console.log("   - VRChat\u72B6\u614B: ".concat(status));
        console.log("   - \u30D7\u30ED\u30BB\u30B9\u60C5\u5831: ".concat(processInfo ? "PID ".concat(processInfo.processId) : 'なし'));
        console.log("   - \u76E3\u8996\u30D5\u30A1\u30A4\u30EB\u6570: ".concat(monitoredFiles.length));
        if (monitoredFiles.length > 0) {
            console.log("   - \u76E3\u8996\u4E2D\u30D5\u30A1\u30A4\u30EB:");
            monitoredFiles.forEach(function (file, index) {
                console.log("     ".concat(index + 1, ". ").concat(file));
            });
        }
    };
    return VRChatMonitorTest;
}());
// ===================================================================
// メイン実行部分
// ===================================================================
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var monitor, statusInterval;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    monitor = new VRChatMonitorTest();
                    statusInterval = setInterval(function () {
                        monitor.printCurrentStatus();
                    }, 5000);
                    // クリーンアップ用にインターバルを停止
                    process.on('SIGINT', function () {
                        clearInterval(statusInterval);
                    });
                    process.on('SIGTERM', function () {
                        clearInterval(statusInterval);
                    });
                    return [4 /*yield*/, monitor.start()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// スクリプト実行
if (require.main === module) {
    main().catch(function (error) {
        console.error('💥 致命的エラー:', error);
        process.exit(1);
    });
}
