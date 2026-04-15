import path from 'node:path'
import { fileURLToPath } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'
import {
  QueryParams,
  InsertParams,
  UpdateParams,
  DeleteParams,
  BulkInsertOrUpdateParams,
} from './types'
import { app } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const NATIVE_DIST = path.join(process.env.APP_ROOT, 'dist-native')

// 根据当前系统和架构，判断使用哪个native模块
const platform = process.platform
const arch = process.arch
const nativeDir = `${platform}-${arch}`

// 设置native模块路径
const nativePath = VITE_DEV_SERVER_URL
  ? path.join(
      process.env.APP_ROOT,
      'native/better-sqlite3',
      `better-sqlite3-v9.6.0-electron-v110-${nativeDir}.node`,
    )
  : path.join(NATIVE_DIST, 'better-sqlite3.node')

const dbPath = path.join(app.getPath('userData'), 'data.db')

console.log('BetterSqlite3 path:', nativePath)
console.log('Database path:', dbPath)

class Database {
  private db

  constructor() {
    this.db = new BetterSqlite3(dbPath, {
      nativeBinding: nativePath,
    })
  }

  open(): Promise<void> {
    return new Promise<void>((resolve, _reject) => {
      this.db.pragma('foreign_keys = ON')
      console.log('Connected to the database.')
      resolve()
    })
  }

  close(): Promise<void> {
    return new Promise<void>((resolve, _reject) => {
      this.db.close()
      console.log('Database closed.')
      resolve()
    })
  }

  query(param: QueryParams): Promise<any[]> {
    return new Promise<any[]>((resolve, _reject) => {
      const stmt = this.db.prepare(param.sql)
      const rows = param.params ? stmt.all(...param.params) : stmt.all()
      resolve(rows)
    })
  }

  insert(param: InsertParams): Promise<number> {
    return new Promise<number>((resolve, _reject) => {
      const keys = Object.keys(param.data)
      const values = Object.values(param.data)
      const placeholders = keys.map(() => '?').join(',')
      const sql = `INSERT INTO ${param.table} (${keys.join(',')}) VALUES (${placeholders})`

      const stmt = this.db.prepare(sql)
      const info = stmt.run(...values)
      resolve(info.lastInsertRowid as number)
    })
  }

  async checkForeignKey(table: string, id: string): Promise<boolean> {
    const result = await this.query({ sql: `SELECT 1 FROM ${table} WHERE id = ?`, params: [id] })
    return result.length > 0
  }

  update(param: UpdateParams): Promise<number> {
    return new Promise<number>((resolve, _reject) => {
      const entries = Object.entries(param.data)
        .map(([key, _value]) => `${key} = ?`)
        .join(',')
      const params = Object.values(param.data)
      const sql = `UPDATE ${param.table} SET ${entries} WHERE ${param.condition}`

      const stmt = this.db.prepare(sql)
      const info = stmt.run(...params)
      resolve(info.changes)
    })
  }

  delete(param: DeleteParams): Promise<void> {
    return new Promise<void>((resolve, _reject) => {
      const sql = `DELETE FROM ${param.table} WHERE ${param.condition}`
      const stmt = this.db.prepare(sql)
      stmt.run()
      resolve()
    })
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  async bulkInsertOrUpdate(param: BulkInsertOrUpdateParams): Promise<void> {
    return new Promise<void>((resolve, _reject) => {
      const keys = Object.keys(param.data[0])
      const placeholders = keys.map(() => '?').join(',')
      const updatePlaceholders = keys.map((key) => `${key} = excluded.${key}`).join(',')
      const sql = `
        INSERT INTO ${param.table} (${keys.join(',')})
        VALUES (${placeholders})
        ON CONFLICT(id) DO UPDATE SET ${updatePlaceholders}
      `

      const stmt = this.db.prepare(sql)

      // 开始事务
      const transaction = this.db.transaction((records: Record<string, any>[]) => {
        for (const record of records) {
          stmt.run(...Object.values(record))
        }
      })

      transaction(param.data)
      resolve()
    })
  }
}

const db = new Database()

export const initSqlite = async () => {
  try {
    await db.open()

    // 创建产品参考表
    db.exec(`
      CREATE TABLE IF NOT EXISTS product_reference (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        image_paths TEXT NOT NULL DEFAULT '[]',
        features TEXT NOT NULL DEFAULT '',
        highlights TEXT NOT NULL DEFAULT '',
        target_audience TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        colors TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL DEFAULT 0
      )
    `)

    // 创建素材帧分析表
    db.exec(`
      CREATE TABLE IF NOT EXISTS video_frame_analysis (
        id TEXT PRIMARY KEY,
        video_path TEXT NOT NULL,
        timestamp REAL NOT NULL DEFAULT 0,
        frame_path TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        colors TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        appeal REAL NOT NULL DEFAULT 5,
        analyzed_at INTEGER NOT NULL DEFAULT 0
      )
    `)

    // 为素材帧分析表创建索引，加速按视频路径查询
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_vfa_video_path ON video_frame_analysis(video_path)
    `)

    // 兼容旧数据：如果 appeal 列不存在则添加
    try {
      db.exec(`ALTER TABLE video_frame_analysis ADD COLUMN appeal REAL NOT NULL DEFAULT 5`)
    } catch {
      // 列已存在，忽略
    }

    console.log('Database initialized.')
  } catch (err) {
    console.error('Error opening database:', err)
  }
}

export const sqQuery = db.query.bind(db)
export const sqInsert = db.insert.bind(db)
export const sqUpdate = db.update.bind(db)
export const sqDelete = db.delete.bind(db)
export const sqBulkInsertOrUpdate = db.bulkInsertOrUpdate.bind(db)
