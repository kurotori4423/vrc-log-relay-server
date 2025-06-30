"use strict";
/**
 * VRChat Log Relay Server - 基本型定義
 *
 * このファイルには、プロジェクト全体で使用される基本的な型定義を含めます。
 *
 * @created 2025-06-30
 * @updated 2025-06-30
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorType = exports.MessageType = exports.LogSource = exports.LogLevel = exports.VRChatStatus = void 0;
// =============================================================================
// VRChat関連の型定義
// =============================================================================
/**
 * VRChatの実行状態を表す列挙型
 */
var VRChatStatus;
(function (VRChatStatus) {
    /** VRChatが起動していない状態 */
    VRChatStatus["NOT_RUNNING"] = "not_running";
    /** VRChatが起動中だが、ログディレクトリが見つからない状態 */
    VRChatStatus["STARTING"] = "starting";
    /** VRChatが正常に動作し、ログファイルが監視可能な状態 */
    VRChatStatus["RUNNING"] = "running";
    /** VRChatが終了処理中の状態 */
    VRChatStatus["STOPPING"] = "stopping";
})(VRChatStatus || (exports.VRChatStatus = VRChatStatus = {}));
// =============================================================================
// ログメッセージ関連の型定義
// =============================================================================
/**
 * ログレベル（VRChatの標準ログレベル）
 */
var LogLevel;
(function (LogLevel) {
    /** デバッグレベル */
    LogLevel["DEBUG"] = "debug";
    /** 情報レベル */
    LogLevel["INFO"] = "info";
    /** 警告レベル */
    LogLevel["WARNING"] = "warning";
    /** エラーレベル */
    LogLevel["ERROR"] = "error";
    /** 致命的エラーレベル */
    LogLevel["FATAL"] = "fatal";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
/**
 * ログメッセージのソース種別
 */
var LogSource;
(function (LogSource) {
    /** VRChat本体 */
    LogSource["VRCHAT"] = "vrchat";
    /** Udonスクリプト */
    LogSource["UDON"] = "udon";
    /** ネットワーク関連 */
    LogSource["NETWORK"] = "network";
    /** その他・不明 */
    LogSource["OTHER"] = "other";
})(LogSource || (exports.LogSource = LogSource = {}));
// =============================================================================
// WebSocket通信関連の型定義
// =============================================================================
/**
 * WebSocketメッセージタイプ
 */
var MessageType;
(function (MessageType) {
    /** ログメッセージの配信 */
    MessageType["LOG_MESSAGE"] = "log_message";
    /** VRChat状態変更通知 */
    MessageType["VRCHAT_STATUS_CHANGE"] = "vrchat_status_change";
    /** クライアント認証要求 */
    MessageType["CLIENT_AUTH"] = "client_auth";
    /** サーバー状態通知 */
    MessageType["SERVER_STATUS"] = "server_status";
    /** フィルター設定 */
    MessageType["FILTER_CONFIG"] = "filter_config";
    /** エラー通知 */
    MessageType["ERROR"] = "error";
})(MessageType || (exports.MessageType = MessageType = {}));
// =============================================================================
// エラー関連の型定義
// =============================================================================
/**
 * サーバーエラーの種別
 */
var ErrorType;
(function (ErrorType) {
    /** VRChatプロセス関連エラー */
    ErrorType["VRCHAT_PROCESS_ERROR"] = "vrchat_process_error";
    /** ファイル監視エラー */
    ErrorType["FILE_WATCHER_ERROR"] = "file_watcher_error";
    /** WebSocket通信エラー */
    ErrorType["WEBSOCKET_ERROR"] = "websocket_error";
    /** 設定ファイルエラー */
    ErrorType["CONFIG_ERROR"] = "config_error";
    /** ログ解析エラー */
    ErrorType["PARSE_ERROR"] = "parse_error";
    /** システムエラー */
    ErrorType["SYSTEM_ERROR"] = "system_error";
})(ErrorType || (exports.ErrorType = ErrorType = {}));
// 設定関連の型定義をエクスポート
__exportStar(require("./config"), exports);
