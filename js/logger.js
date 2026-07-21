import { STORAGE_KEYS } from './config.js';

export class Logger {
  constructor() {
    this.logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGS) || '[]');
  }

  log(level, message, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details,
    };
    this.logs.push(entry);
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(this.logs));
    console.log(`[${level.toUpperCase()}] ${message}`, details);
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
    localStorage.removeItem(STORAGE_KEYS.LOGS);
  }

  export(format = 'json') {
    if (format === 'json') return JSON.stringify(this.logs, null, 2);
    if (format === 'csv') {
      const header = 'timestamp,level,message,details\n';
      return header + this.logs.map(l => `${l.timestamp},${l.level},${l.message},"${JSON.stringify(l.details)}"`).join('\n');
    }
    return this.logs.map(l => `[${l.timestamp}] ${l.level}: ${l.message}`).join('\n');
  }
}