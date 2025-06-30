/**
 * P2-T1: WebSocketサーバー基盤 - テスト
 * 
 * WebSocketServerクラスとClientConnectionクラスの基本動作テスト
 */

import { WebSocketServer } from '../../src/websocket/WebSocketServer';
import { ServerConfig } from '../../src/types/config';
import { logger } from '../../src/utils/logger';
import WebSocket from 'ws';

describe('P2-T1: WebSocketサーバー基盤テスト', () => {
  let server: WebSocketServer;
  let config: ServerConfig;
  
  beforeAll(() => {
    // テスト用設定
    config = {
      server: {
        port: 3001,
        host: '127.0.0.1',
        name: 'Test Server',
        version: '1.0.0'
      },
      websocket: {
        port: 8081,
        host: '127.0.0.1',
        maxClients: 5,
        pingInterval: 30000,
        pongTimeout: 5000,
        compression: false,
        perMessageDeflate: false,
        maxPayload: 1024 * 1024,
        distributionBatch: {
          enabled: false,
          batchSize: 10,
          batchTimeout: 100
        },
        statusBroadcast: {
          enabled: true,
          debounceInterval: 1000
        }
      },
      vrchat: {
        logDirectory: undefined,
        monitoring: {
          groupPeriod: 30,
          maxFiles: 10,
          filePattern: 'output_log_*.txt',
          encoding: 'utf8'
        },
        processMonitoring: {
          enabled: true,
          interval: 5000,
          processName: 'VRChat.exe',
          retryLimit: 3,
          detectionTimeout: 30000
        },
        directoryMonitoring: {
          enabled: true,
          depth: 1,
          usePolling: false,
          pollInterval: 1000
        }
      },
      logging: {
        level: 'info',
        format: 'json',
        timestamp: true,
        console: {
          enabled: true,
          colorize: true,
          format: 'simple'
        },
        file: {
          enabled: false,
          filename: 'logs/test.log',
          maxSize: '10M',
          maxFiles: 3,
          datePattern: 'YYYY-MM-DD',
          zippedArchive: false
        },
        errorFile: {
          enabled: false,
          filename: 'logs/test.error.log',
          level: 'error'
        },
        categories: {
          server: 'info',
          vrchat: 'debug',
          websocket: 'debug',
          messages: 'debug'
        }
      },
      features: {
        webUI: false,
        healthCheck: false,
        metrics: true,
        authentication: false,
        rateLimit: false,
        vrchatMonitoring: {
          processDetection: true,
          directoryWatching: true,
          fileWatching: true,
          statusNotification: true
        }
      },
      performance: {
        memory: {
          maxHeapSize: '128M',
          gcThreshold: 80
        },
        processing: {
          maxConcurrentTasks: 10,
          taskTimeout: 5000,
          messageQueueSize: 1000
        },
        fileWatching: {
          stabilityThreshold: 100,
          pollInterval: 1000,
          useNativeEvents: true
        }
      },
      healthCheck: {
        enabled: false,
        endpoint: '/health',
        interval: 30000,
        timeout: 5000,
        checks: {
          memoryUsage: true,
          vrchatProcess: true,
          logDirectory: true,
          websocketServer: true
        },
        thresholds: {
          memoryUsagePercent: 90,
          responseTimeMs: 1000
        }
      },
      webUI: {
        enabled: false,
        path: '/admin',
        staticFiles: 'web-ui/dist',
        development: {
          hotReload: false,
          devServer: false
        }
      }
    };
  });

  beforeEach(() => {
    server = new WebSocketServer(config);
  });

  afterEach(async () => {
    if (server.isActive()) {
      await server.stop();
    }
  });

  describe('サーバー起動・停止', () => {
    test('サーバーが正常に起動する', async () => {
      expect(server.isActive()).toBe(false);
      
      await server.start();
      
      expect(server.isActive()).toBe(true);
      expect(server.getClientCount()).toBe(0);
    }, 10000);

    test('サーバーが正常に停止する', async () => {
      await server.start();
      expect(server.isActive()).toBe(true);
      
      await server.stop();
      
      expect(server.isActive()).toBe(false);
    }, 10000);

    test('既に起動中のサーバーを再起動しようとするとエラー', async () => {
      await server.start();
      
      await expect(server.start()).rejects.toThrow('WebSocket server is already running');
      
      await server.stop();
    }, 10000);
  });

  describe('クライアント接続管理', () => {
    test('クライアントが正常に接続できる', async () => {
      await server.start();
      
      const client = new WebSocket('ws://127.0.0.1:8081');
      
      await new Promise((resolve, reject) => {
        client.on('open', () => {
          expect(server.getClientCount()).toBe(1);
          client.close();
          resolve(undefined);
        });
        
        client.on('error', reject);
        
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });
    }, 10000);

    test('クライアント情報が正しく管理される', async () => {
      await server.start();
      
      const client = new WebSocket('ws://127.0.0.1:8081');
      
      await new Promise((resolve, reject) => {
        client.on('open', () => {
          const clientInfo = server.getClientInfo();
          expect(clientInfo).toHaveLength(1);
          expect(clientInfo[0]).toHaveProperty('id');
          expect(clientInfo[0]).toHaveProperty('name');
          expect(clientInfo[0]).toHaveProperty('connectedAt');
          
          client.close();
          resolve(undefined);
        });
        
        client.on('error', reject);
        
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });
    }, 10000);

    test('Hello/Welcomeメッセージ交換', async () => {
      await server.start();
      
      const client = new WebSocket('ws://127.0.0.1:8081');
      
      await new Promise((resolve, reject) => {
        let welcomeReceived = false;
        
        client.on('open', () => {
          // Helloメッセージを送信
          const helloMessage = {
            type: 'hello',
            data: {
              clientName: 'Test Client',
              version: '1.0.0',
              capabilities: ['filtering'],
              description: 'Jest test client'
            }
          };
          
          client.send(JSON.stringify(helloMessage));
        });
        
        client.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'welcome') {
              expect(message.data).toHaveProperty('clientId');
              expect(message.data).toHaveProperty('serverVersion');
              expect(message.data).toHaveProperty('connectedAt');
              expect(message.data.capabilities).toContain('filtering');
              
              welcomeReceived = true;
              client.close();
              resolve(undefined);
            }
          } catch (error) {
            reject(error);
          }
        });
        
        client.on('error', reject);
        
        setTimeout(() => {
          if (!welcomeReceived) {
            reject(new Error('Welcome message not received'));
          }
        }, 5000);
      });
    }, 10000);
  });

  describe('メッセージ処理', () => {
    test('ステータス要求への応答', async () => {
      await server.start();
      
      const client = new WebSocket('ws://127.0.0.1:8081');
      
      await new Promise((resolve, reject) => {
        let statusReceived = false;
        
        client.on('open', () => {
          const statusRequest = {
            type: 'get_status'
          };
          
          client.send(JSON.stringify(statusRequest));
        });
        
        client.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'status') {
              expect(message.data).toHaveProperty('uptime');
              expect(message.data).toHaveProperty('connectedClients');
              expect(message.data).toHaveProperty('memoryUsage');
              expect(message.data).toHaveProperty('vrchatStatus');
              
              statusReceived = true;
              client.close();
              resolve(undefined);
            }
          } catch (error) {
            reject(error);
          }
        });
        
        client.on('error', reject);
        
        setTimeout(() => {
          if (!statusReceived) {
            reject(new Error('Status message not received'));
          }
        }, 5000);
      });
    }, 10000);

    test('Ping/Pong交換', async () => {
      await server.start();
      
      const client = new WebSocket('ws://127.0.0.1:8081');
      
      await new Promise((resolve, reject) => {
        let pongReceived = false;
        
        client.on('open', () => {
          const pingMessage = {
            type: 'ping',
            data: {
              timestamp: Date.now()
            }
          };
          
          client.send(JSON.stringify(pingMessage));
        });
        
        client.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'pong') {
              expect(message.data).toHaveProperty('timestamp');
              
              pongReceived = true;
              client.close();
              resolve(undefined);
            }
          } catch (error) {
            reject(error);
          }
        });
        
        client.on('error', reject);
        
        setTimeout(() => {
          if (!pongReceived) {
            reject(new Error('Pong message not received'));
          }
        }, 5000);
      });
    }, 10000);
  });

  describe('ブロードキャスト機能', () => {
    test('複数クライアントへのブロードキャスト', async () => {
      await server.start();
      
      const client1 = new WebSocket('ws://127.0.0.1:8081');
      const client2 = new WebSocket('ws://127.0.0.1:8081');
      
      await new Promise((resolve, reject) => {
        let client1Ready = false;
        let client2Ready = false;
        let client1Received = false;
        let client2Received = false;
        
        const checkBothClientsConnected = () => {
          if (client1Ready && client2Ready) {
            // 両方のクライアントが接続されたらブロードキャスト
            const broadcastMessage = {
              type: 'test_broadcast',
              data: {
                message: 'Hello all clients!',
                timestamp: Date.now()
              }
            };
            
            server.broadcast(broadcastMessage);
          }
        };
        
        const checkBothReceived = () => {
          if (client1Received && client2Received) {
            client1.close();
            client2.close();
            resolve(undefined);
          }
        };
        
        client1.on('open', () => {
          client1Ready = true;
          checkBothClientsConnected();
        });
        
        client2.on('open', () => {
          client2Ready = true;
          checkBothClientsConnected();
        });
        
        client1.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.type === 'test_broadcast') {
              client1Received = true;
              checkBothReceived();
            }
          } catch (error) {
            reject(error);
          }
        });
        
        client2.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.type === 'test_broadcast') {
              client2Received = true;
              checkBothReceived();
            }
          } catch (error) {
            reject(error);
          }
        });
        
        client1.on('error', reject);
        client2.on('error', reject);
        
        setTimeout(() => {
          reject(new Error('Broadcast test timeout'));
        }, 10000);
      });
    }, 15000);
  });

  describe('接続制限', () => {
    test('最大接続数制限', async () => {
      await server.start();
      
      // 最大接続数（5）を超える接続を試行
      const clients: WebSocket[] = [];
      
      // 5つの正常な接続
      for (let i = 0; i < 5; i++) {
        const client = new WebSocket('ws://127.0.0.1:8081');
        clients.push(client);
        
        await new Promise((resolve) => {
          client.on('open', resolve);
        });
      }
      
      expect(server.getClientCount()).toBe(5);
      
      // 6つ目の接続は拒否されるはず
      const extraClient = new WebSocket('ws://127.0.0.1:8081');
      
      await new Promise((resolve, reject) => {
        extraClient.on('open', () => {
          reject(new Error('Extra client should not have connected'));
        });
        
        extraClient.on('close', () => {
          resolve(undefined);
        });
        
        extraClient.on('error', () => {
          resolve(undefined); // エラーも正常な動作
        });
        
        setTimeout(resolve, 2000); // 2秒待っても接続されなければOK
      });
      
      // クリーンアップ
      clients.forEach(client => client.close());
    }, 20000);
  });
});

// テスト実行の情報表示
console.log('P2-T1: WebSocketサーバー基盤テスト実行中...');
console.log('テスト項目:');
console.log('- サーバー起動・停止');
console.log('- クライアント接続管理');
console.log('- Hello/Welcomeメッセージ交換');
console.log('- ステータス要求への応答');
console.log('- Ping/Pong交換');
console.log('- ブロードキャスト機能');
console.log('- 接続制限');
