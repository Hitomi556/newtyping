import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { basicAuth } from 'hono/basic-auth'

type Bindings = {
  DB: D1Database;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS設定
app.use('/api/*', cors())

// 静的ファイルの配信
app.use('/static/*', serveStatic({ root: './public' }))

// Basic認証ミドルウェア（管理画面用）
app.use('/admin/*', async (c, next) => {
  const username = c.env.ADMIN_USERNAME || 'admin'
  const password = c.env.ADMIN_PASSWORD || 'password'
  
  const auth = basicAuth({
    username,
    password,
    realm: '管理画面',
    hashFunction: (m: string) => m, // パスワードを平文で比較（シンプル実装）
  })
  
  return auth(c, next)
})

app.use('/admin', async (c, next) => {
  const username = c.env.ADMIN_USERNAME || 'admin'
  const password = c.env.ADMIN_PASSWORD || 'password'
  
  const auth = basicAuth({
    username,
    password,
    realm: '管理画面',
    hashFunction: (m: string) => m,
  })
  
  return auth(c, next)
})

// API: 級一覧の取得
app.get('/api/levels', async (c) => {
  try {
    const { DB } = c.env
    const result = await DB.prepare(`
      SELECT l.*, COUNT(w.id) as word_count 
      FROM eiken_levels l
      LEFT JOIN words w ON l.id = w.level_id
      GROUP BY l.id
      ORDER BY l.id DESC
    `).all()
    
    return c.json({ success: true, levels: result.results })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// API: 特定の級の単語一覧を取得
app.get('/api/words/:levelId', async (c) => {
  try {
    const { DB } = c.env
    const levelId = c.req.param('levelId')
    const limit = c.req.query('limit') || '10'
    const offset = c.req.query('offset') || '0'
    
    const result = await DB.prepare(`
      SELECT w.*, 
             COALESCE(p.correct_count, 0) as correct_count,
             COALESCE(p.incorrect_count, 0) as incorrect_count
      FROM words w
      LEFT JOIN progress p ON w.id = p.word_id AND p.user_id = 'default_user'
      WHERE w.level_id = ?
      ORDER BY RANDOM()
      LIMIT ? OFFSET ?
    `).bind(levelId, limit, offset).all()
    
    return c.json({ success: true, words: result.results })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// API: ランダムに単語を取得（クイズ用・忘却曲線対応）
app.get('/api/quiz/:levelId', async (c) => {
  try {
    const { DB } = c.env
    const levelId = c.req.param('levelId')
    const count = parseInt(c.req.query('count') || '10')
    
    // 1. 復習期限が来た単語を優先的に取得
    const dueWords = await DB.prepare(`
      SELECT w.*, 
             COALESCE(p.correct_count, 0) as correct_count,
             COALESCE(p.incorrect_count, 0) as incorrect_count,
             p.next_review_date,
             p.interval_days,
             p.review_stage
      FROM words w
      INNER JOIN progress p ON w.id = p.word_id AND p.user_id = 'default_user'
      WHERE w.level_id = ? 
        AND p.next_review_date <= datetime('now')
        AND p.review_stage < 2
      ORDER BY p.next_review_date ASC
      LIMIT ?
    `).bind(levelId, count).all()
    
    let words = dueWords.results || []
    
    // 2. 不足分は新規単語または習得済み単語から取得
    if (words.length < count) {
      const remaining = count - words.length
      const newWords = await DB.prepare(`
        SELECT w.*, 
               COALESCE(p.correct_count, 0) as correct_count,
               COALESCE(p.incorrect_count, 0) as incorrect_count
        FROM words w
        LEFT JOIN progress p ON w.id = p.word_id AND p.user_id = 'default_user'
        WHERE w.level_id = ?
          AND (p.id IS NULL OR p.review_stage = 2)
        ORDER BY RANDOM()
        LIMIT ?
      `).bind(levelId, remaining).all()
      
      words = words.concat(newWords.results || [])
    }
    
    return c.json({ 
      success: true, 
      words: words,
      due_count: dueWords.results?.length || 0
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// API: 今日復習すべき単語数を取得
app.get('/api/review-due/:levelId', async (c) => {
  try {
    const { DB } = c.env
    const levelId = c.req.param('levelId')
    
    const result = await DB.prepare(`
      SELECT COUNT(*) as due_count
      FROM words w
      INNER JOIN progress p ON w.id = p.word_id AND p.user_id = 'default_user'
      WHERE w.level_id = ? 
        AND p.next_review_date <= datetime('now')
        AND p.review_stage < 2
    `).bind(levelId).first()
    
    return c.json({ success: true, due_count: result?.due_count || 0 })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// SM-2アルゴリズムに基づいて次回復習日を計算
function calculateNextReview(easinessFactor: number, repetitions: number, intervalDays: number, quality: number) {
  // quality: 0-5 (0=完全に忘れた, 5=完璧に覚えている)
  // 不正解の場合 quality=0-2, 正解の場合 quality=3-5
  
  let newEasinessFactor = easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if (newEasinessFactor < 1.3) newEasinessFactor = 1.3
  
  let newRepetitions = repetitions
  let newIntervalDays = intervalDays
  
  if (quality < 3) {
    // 不正解の場合、最初からやり直し
    newRepetitions = 0
    newIntervalDays = 0
  } else {
    // 正解の場合
    if (repetitions === 0) {
      newIntervalDays = 1
    } else if (repetitions === 1) {
      newIntervalDays = 6
    } else {
      newIntervalDays = Math.round(intervalDays * newEasinessFactor)
    }
    newRepetitions += 1
  }
  
  const nextReviewDate = new Date()
  nextReviewDate.setDate(nextReviewDate.getDate() + newIntervalDays)
  
  return {
    easinessFactor: newEasinessFactor,
    repetitions: newRepetitions,
    intervalDays: newIntervalDays,
    nextReviewDate: nextReviewDate.toISOString()
  }
}

// API: 学習進捗を記録（SRS対応）
app.post('/api/progress', async (c) => {
  try {
    const { DB } = c.env
    const { word_id, is_correct, mode } = await c.req.json()
    
    // 既存の進捗を確認
    const existing = await DB.prepare(`
      SELECT * FROM progress 
      WHERE word_id = ? AND user_id = 'default_user' AND mode = ?
    `).bind(word_id, mode).first()
    
    // quality: 不正解=1, 正解=4（標準的な正解）
    const quality = is_correct ? 4 : 1
    
    if (existing) {
      // 連続正解数を計算
      let consecutiveCorrect = is_correct ? (existing.consecutive_correct || 0) + 1 : 0
      let isMastered = existing.is_mastered || (consecutiveCorrect >= 2)
      
      // SRSパラメータを計算
      const srsData = calculateNextReview(
        existing.easiness_factor || 2.5,
        existing.repetitions || 0,
        existing.interval_days || 0,
        quality
      )
      
      // review_stage: 0=新規、1=学習中、2=習得済み
      let reviewStage = existing.review_stage || 0
      if (isMastered) {
        reviewStage = 2
      } else if (existing.correct_count > 0 || existing.incorrect_count > 0) {
        reviewStage = 1
      }
      
      // 更新
      await DB.prepare(`
        UPDATE progress 
        SET correct_count = correct_count + ?,
            incorrect_count = incorrect_count + ?,
            consecutive_correct = ?,
            is_mastered = ?,
            mastered_at = CASE WHEN ? = 1 AND is_mastered = 0 THEN CURRENT_TIMESTAMP ELSE mastered_at END,
            last_practiced = CURRENT_TIMESTAMP,
            easiness_factor = ?,
            repetitions = ?,
            interval_days = ?,
            next_review_date = ?,
            review_stage = ?
        WHERE word_id = ? AND user_id = 'default_user' AND mode = ?
      `).bind(
        is_correct ? 1 : 0, 
        is_correct ? 0 : 1, 
        consecutiveCorrect,
        isMastered ? 1 : 0,
        isMastered ? 1 : 0,
        srsData.easinessFactor,
        srsData.repetitions,
        srsData.intervalDays,
        srsData.nextReviewDate,
        reviewStage,
        word_id, 
        mode
      ).run()
      
      return c.json({ 
        success: true, 
        is_mastered: isMastered, 
        consecutive_correct: consecutiveCorrect,
        next_review_date: srsData.nextReviewDate,
        interval_days: srsData.intervalDays
      })
    } else {
      // 新規作成
      let isMastered = false
      let consecutiveCorrect = is_correct ? 1 : 0
      
      const srsData = calculateNextReview(2.5, 0, 0, quality)
      
      await DB.prepare(`
        INSERT INTO progress (
          word_id, user_id, correct_count, incorrect_count, consecutive_correct, 
          is_mastered, mode, easiness_factor, repetitions, interval_days, 
          next_review_date, review_stage
        )
        VALUES (?, 'default_user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        word_id, 
        is_correct ? 1 : 0, 
        is_correct ? 0 : 1, 
        consecutiveCorrect, 
        isMastered ? 1 : 0, 
        mode,
        srsData.easinessFactor,
        srsData.repetitions,
        srsData.intervalDays,
        srsData.nextReviewDate,
        0 // 新規
      ).run()
      
      return c.json({ 
        success: true, 
        is_mastered: isMastered, 
        consecutive_correct: consecutiveCorrect,
        next_review_date: srsData.nextReviewDate,
        interval_days: srsData.intervalDays
      })
    }
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// API: 統計情報の取得
app.get('/api/stats/:levelId', async (c) => {
  try {
    const { DB } = c.env
    const levelId = c.req.param('levelId')
    
    const result = await DB.prepare(`
      SELECT 
        COUNT(DISTINCT w.id) as total_words,
        COUNT(DISTINCT p.word_id) as practiced_words,
        SUM(p.correct_count) as total_correct,
        SUM(p.incorrect_count) as total_incorrect,
        COUNT(CASE WHEN p.is_mastered = 1 THEN 1 END) as mastered_words
      FROM words w
      LEFT JOIN progress p ON w.id = p.word_id AND p.user_id = 'default_user'
      WHERE w.level_id = ?
    `).bind(levelId).first()
    
    return c.json({ success: true, stats: result })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// API: グローバル習得統計の取得
app.get('/api/mastery/global', async (c) => {
  try {
    const { DB } = c.env
    
    const result = await DB.prepare(`
      SELECT 
        COUNT(DISTINCT CASE WHEN is_mastered = 1 THEN word_id END) as total_mastered
      FROM progress
      WHERE user_id = 'default_user'
    `).first()
    
    return c.json({ success: true, total_mastered: result.total_mastered || 0 })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// API: 級ごとの習得チェック
app.get('/api/mastery/level/:levelId', async (c) => {
  try {
    const { DB } = c.env
    const levelId = c.req.param('levelId')
    
    const result = await DB.prepare(`
      SELECT 
        COUNT(DISTINCT w.id) as total_words,
        COUNT(DISTINCT CASE WHEN p.is_mastered = 1 THEN p.word_id END) as mastered_words
      FROM words w
      LEFT JOIN progress p ON w.id = p.word_id AND p.user_id = 'default_user'
      WHERE w.level_id = ?
    `).bind(levelId).first()
    
    const isComplete = result.total_words > 0 && result.total_words === result.mastered_words
    
    return c.json({ 
      success: true, 
      total_words: result.total_words || 0,
      mastered_words: result.mastered_words || 0,
      is_complete: isComplete
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// API: 級の進捗をリセット
app.post('/api/reset-level-progress', async (c) => {
  try {
    const { DB } = c.env
    const { level_id } = await c.req.json()
    
    // その級の全単語IDを取得
    const words = await DB.prepare(`
      SELECT id FROM words WHERE level_id = ?
    `).bind(level_id).all()
    
    // 進捗をリセット
    for (const word of words.results) {
      await DB.prepare(`
        UPDATE progress 
        SET consecutive_correct = 0, 
            is_mastered = 0, 
            mastered_at = NULL
        WHERE word_id = ? AND user_id = 'default_user'
      `).bind(word.id).run()
    }
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ========== 管理画面API ==========

// Basic認証ミドルウェア（管理API用）
app.use('/api/admin/*', async (c, next) => {
  const username = c.env.ADMIN_USERNAME || 'admin'
  const password = c.env.ADMIN_PASSWORD || 'password'
  
  const auth = basicAuth({
    username,
    password,
    realm: '管理API',
    hashFunction: (m: string) => m,
  })
  
  return auth(c, next)
})

// API: 全単語の取得（管理画面用）
app.get('/api/admin/words', async (c) => {
  try {
    const { DB } = c.env
    const levelId = c.req.query('level_id')
    const limit = c.req.query('limit') || '100'
    const offset = c.req.query('offset') || '0'
    
    let query = `
      SELECT w.*, l.display_name as level_name
      FROM words w
      LEFT JOIN eiken_levels l ON w.level_id = l.id
    `
    
    if (levelId) {
      query += ` WHERE w.level_id = ${levelId}`
    }
    
    query += ` ORDER BY w.level_id DESC, w.id DESC LIMIT ${limit} OFFSET ${offset}`
    
    const result = await DB.prepare(query).all()
    
    // 総数も取得
    let countQuery = 'SELECT COUNT(*) as total FROM words'
    if (levelId) {
      countQuery += ` WHERE level_id = ${levelId}`
    }
    const countResult = await DB.prepare(countQuery).first()
    
    return c.json({ 
      success: true, 
      words: result.results,
      total: countResult.total
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// API: 単語の追加
app.post('/api/admin/words', async (c) => {
  try {
    const { DB } = c.env
    const { english, japanese, level_id, part_of_speech, example_sentence } = await c.req.json()
    
    if (!english || !japanese || !level_id) {
      return c.json({ success: false, error: '必須項目が不足しています' }, 400)
    }
    
    const result = await DB.prepare(`
      INSERT INTO words (english, japanese, level_id, part_of_speech, example_sentence)
      VALUES (?, ?, ?, ?, ?)
    `).bind(english, japanese, level_id, part_of_speech || null, example_sentence || null).run()
    
    return c.json({ success: true, id: result.meta.last_row_id })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// API: 単語の更新
app.put('/api/admin/words/:id', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    const { english, japanese, level_id, part_of_speech, example_sentence } = await c.req.json()
    
    if (!english || !japanese || !level_id) {
      return c.json({ success: false, error: '必須項目が不足しています' }, 400)
    }
    
    await DB.prepare(`
      UPDATE words 
      SET english = ?, japanese = ?, level_id = ?, part_of_speech = ?, example_sentence = ?
      WHERE id = ?
    `).bind(english, japanese, level_id, part_of_speech || null, example_sentence || null, id).run()
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// API: 単語の削除
app.delete('/api/admin/words/:id', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    
    await DB.prepare('DELETE FROM words WHERE id = ?').bind(id).run()
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// API: CSV一括インポート
app.post('/api/admin/import-csv', async (c) => {
  try {
    const { DB } = c.env
    const { csv_data } = await c.req.json()
    
    if (!csv_data) {
      return c.json({ success: false, error: 'CSVデータが不足しています' }, 400)
    }
    
    // CSVをパース - 改善版（引用符対応）
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        const nextChar = line[i + 1]
        
        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // エスケープされた引用符
            current += '"'
            i++
          } else {
            // 引用符の開始/終了
            inQuotes = !inQuotes
          }
        } else if (char === ',' && !inQuotes) {
          // フィールドの区切り
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      
      result.push(current.trim())
      return result
    }
    
    const lines = csv_data.trim().split(/\r?\n/)
    let successCount = 0
    let errorCount = 0
    const errors: string[] = []
    
    // ヘッダー行をスキップ（1行目）
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      try {
        const parts = parseCSVLine(line)
        
        if (parts.length < 3) {
          errorCount++
          errors.push(`行${i + 1}: データが不足しています（最低3列必要: 英単語,日本語,レベルID）`)
          continue
        }
        
        const english = parts[0]?.trim()
        const japanese = parts[1]?.trim()
        const levelIdStr = parts[2]?.trim()
        const part_of_speech = parts[3]?.trim() || null
        const example_sentence = parts[4]?.trim() || null
        
        if (!english || !japanese || !levelIdStr) {
          errorCount++
          errors.push(`行${i + 1}: 必須項目が空です`)
          continue
        }
        
        const level_id = parseInt(levelIdStr)
        if (isNaN(level_id) || level_id < -1 || level_id > 5) {
          errorCount++
          errors.push(`行${i + 1}: レベルIDが無効です（5=5級, 4=4級, 3=3級, 2=準2級, 1=2級, 0=準1級, -1=1級）`)
          continue
        }
        
        await DB.prepare(`
          INSERT INTO words (english, japanese, level_id, part_of_speech, example_sentence)
          VALUES (?, ?, ?, ?, ?)
        `).bind(english, japanese, level_id, part_of_speech, example_sentence).run()
        
        successCount++
      } catch (error) {
        errorCount++
        errors.push(`行${i + 1}: ${String(error)}`)
      }
    }
    
    return c.json({ 
      success: true, 
      imported: successCount,
      errors: errorCount,
      error_details: errors
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// 管理画面ページ
app.get('/admin', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>単語管理画面 - Eigo Bubble</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50 min-h-screen">
        <div class="container mx-auto px-4 py-8">
            <header class="mb-8">
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-3xl font-bold text-gray-800">
                            <i class="fas fa-cog mr-2"></i>
                            単語管理画面
                        </h1>
                        <p class="text-gray-600 mt-1">単語の追加・編集・削除ができます</p>
                    </div>
                    <a href="/" class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg transition">
                        <i class="fas fa-arrow-left mr-2"></i>練習画面に戻る
                    </a>
                </div>
            </header>

            <!-- 統計情報 -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div class="bg-white rounded-lg shadow p-4">
                    <div class="text-2xl font-bold text-indigo-600" id="total-words">0</div>
                    <div class="text-sm text-gray-600">総単語数</div>
                </div>
                <div class="bg-white rounded-lg shadow p-4">
                    <div class="text-2xl font-bold text-green-600" id="level5-count">0</div>
                    <div class="text-sm text-gray-600">5級</div>
                </div>
                <div class="bg-white rounded-lg shadow p-4">
                    <div class="text-2xl font-bold text-blue-600" id="level3-count">0</div>
                    <div class="text-sm text-gray-600">3級</div>
                </div>
                <div class="bg-white rounded-lg shadow p-4">
                    <div class="text-2xl font-bold text-purple-600" id="level1-count">0</div>
                    <div class="text-sm text-gray-600">1級</div>
                </div>
            </div>

            <!-- タブメニュー -->
            <div class="bg-white rounded-lg shadow mb-6">
                <div class="border-b border-gray-200">
                    <nav class="flex">
                        <button id="tab-list" class="px-6 py-4 text-indigo-600 border-b-2 border-indigo-600 font-medium">
                            <i class="fas fa-list mr-2"></i>単語一覧
                        </button>
                        <button id="tab-add" class="px-6 py-4 text-gray-600 hover:text-gray-800 font-medium">
                            <i class="fas fa-plus mr-2"></i>単語追加
                        </button>
                        <button id="tab-import" class="px-6 py-4 text-gray-600 hover:text-gray-800 font-medium">
                            <i class="fas fa-file-import mr-2"></i>CSV一括インポート
                        </button>
                    </nav>
                </div>
            </div>

            <!-- 単語一覧タブ -->
            <div id="content-list" class="bg-white rounded-lg shadow p-6">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold text-gray-800">単語一覧</h2>
                    <div class="flex gap-2">
                        <select id="filter-level" class="border border-gray-300 rounded px-4 py-2">
                            <option value="">全ての級</option>
                            <option value="5">5級</option>
                            <option value="4">4級</option>
                            <option value="3">3級</option>
                            <option value="2">準2級</option>
                            <option value="1">2級</option>
                            <option value="0">準1級</option>
                            <option value="-1">1級</option>
                        </select>
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">英語</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日本語</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">級</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">品詞</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                            </tr>
                        </thead>
                        <tbody id="words-table" class="bg-white divide-y divide-gray-200">
                            <!-- 単語リストがここに表示されます -->
                        </tbody>
                    </table>
                </div>

                <div class="mt-4 flex justify-center">
                    <button id="load-more" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg transition">
                        もっと読み込む
                    </button>
                </div>
            </div>

            <!-- 単語追加タブ -->
            <div id="content-add" class="bg-white rounded-lg shadow p-6 hidden">
                <h2 class="text-xl font-bold text-gray-800 mb-4">単語を追加</h2>
                <form id="add-word-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">英単語 *</label>
                        <input type="text" id="add-english" required class="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="例: beautiful">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">日本語訳 *</label>
                        <input type="text" id="add-japanese" required class="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="例: 美しい">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">級 *</label>
                        <select id="add-level" required class="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="">選択してください</option>
                            <option value="5">5級</option>
                            <option value="4">4級</option>
                            <option value="3">3級</option>
                            <option value="2">準2級</option>
                            <option value="1">2級</option>
                            <option value="0">準1級</option>
                            <option value="-1">1級</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">品詞</label>
                        <input type="text" id="add-part" class="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="例: 形容詞">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">例文</label>
                        <textarea id="add-example" rows="3" class="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="例文を入力（任意）"></textarea>
                    </div>
                    <div class="flex gap-4">
                        <button type="submit" class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg transition">
                            <i class="fas fa-plus mr-2"></i>追加
                        </button>
                        <button type="button" id="clear-form" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg transition">
                            クリア
                        </button>
                    </div>
                </form>
                <div id="add-message" class="mt-4"></div>
            </div>

            <!-- CSV一括インポートタブ -->
            <div id="content-import" class="bg-white rounded-lg shadow p-6 hidden">
                <h2 class="text-xl font-bold text-gray-800 mb-4">CSV一括インポート</h2>
                
                <div class="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
                    <h3 class="font-bold text-blue-900 mb-2">
                        <i class="fas fa-info-circle mr-2"></i>CSVフォーマット
                    </h3>
                    <p class="text-sm text-blue-800 mb-2">以下の形式でCSVデータを入力してください：</p>
                    <code class="block bg-white p-3 rounded text-sm overflow-x-auto">
                        english,japanese,level_id,part_of_speech,example_sentence<br>
                        beautiful,美しい,4,形容詞,She is beautiful.<br>
                        interesting,興味深い,4,形容詞,<br>
                        difficult,難しい,3,形容詞,This is difficult.
                    </code>
                    <div class="mt-3 text-xs text-blue-700">
                        <p class="font-bold mb-1">レベルIDの指定:</p>
                        <p>5=5級, 4=4級, 3=3級, 2=準2級, 1=2級, 0=準1級, -1=1級</p>
                        <p class="font-bold mt-2 mb-1">注意事項:</p>
                        <ul class="list-disc ml-4">
                            <li>1行目はヘッダー行（スキップされます）</li>
                            <li>必須項目: 英単語, 日本語, レベルID</li>
                            <li>品詞と例文は省略可能</li>
                            <li>カンマやダブルクォートを含む場合はダブルクォートで囲んでください</li>
                        </ul>
                    </div>
                </div>

                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">CSVデータ</label>
                    <textarea id="csv-input" rows="12" class="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm" placeholder="CSVデータを貼り付けてください（Excelからコピーも可能）"></textarea>
                </div>

                <div class="flex gap-3 mb-4">
                    <button id="import-csv-btn" class="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition">
                        <i class="fas fa-file-import mr-2"></i>インポート開始
                    </button>
                    <button id="clear-csv-btn" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg transition">
                        <i class="fas fa-eraser mr-2"></i>クリア
                    </button>
                    <button id="sample-csv-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition">
                        <i class="fas fa-file-alt mr-2"></i>サンプルCSVを挿入
                    </button>
                </div>

                <div id="import-result" class="mt-4"></div>
            </div>
        </div>

        <!-- 編集モーダル -->
        <div id="edit-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-gray-800">単語を編集</h3>
                    <button id="close-modal" class="text-gray-500 hover:text-gray-700">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>
                <form id="edit-word-form" class="space-y-4">
                    <input type="hidden" id="edit-id">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">英単語 *</label>
                        <input type="text" id="edit-english" required class="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">日本語訳 *</label>
                        <input type="text" id="edit-japanese" required class="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">級 *</label>
                        <select id="edit-level" required class="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="5">5級</option>
                            <option value="4">4級</option>
                            <option value="3">3級</option>
                            <option value="2">準2級</option>
                            <option value="1">2級</option>
                            <option value="0">準1級</option>
                            <option value="-1">1級</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">品詞</label>
                        <input type="text" id="edit-part" class="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">例文</label>
                        <textarea id="edit-example" rows="3" class="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"></textarea>
                    </div>
                    <div class="flex gap-4">
                        <button type="submit" class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg transition">
                            <i class="fas fa-save mr-2"></i>保存
                        </button>
                        <button type="button" id="cancel-edit" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg transition">
                            キャンセル
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/admin.js"></script>
    </body>
    </html>
  `)
})

// 問い合わせページ
app.get('/contact', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>お問い合わせ - Eigo Bubble</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50">
        <div class="container mx-auto px-4 py-8 max-w-2xl">
            <header class="mb-8">
                <a href="/" class="text-indigo-600 hover:text-indigo-800 transition inline-block mb-4">
                    <i class="fas fa-arrow-left mr-2"></i>トップページに戻る
                </a>
                <h1 class="text-3xl font-bold text-gray-800 mb-2">お問い合わせ</h1>
                <p class="text-gray-600">ご質問やご意見がございましたら、以下のフォームよりお気軽にお問い合わせください。</p>
            </header>

            <div class="bg-white rounded-lg shadow p-8">
                <form id="contact-form" class="space-y-6">
                    <div>
                        <label for="name" class="block text-sm font-medium text-gray-700 mb-2">
                            お名前 <span class="text-red-500">*</span>
                        </label>
                        <input 
                            type="text" 
                            id="name" 
                            name="name" 
                            required 
                            class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="山田 太郎"
                        >
                    </div>

                    <div>
                        <label for="email" class="block text-sm font-medium text-gray-700 mb-2">
                            メールアドレス <span class="text-red-500">*</span>
                        </label>
                        <input 
                            type="email" 
                            id="email" 
                            name="email" 
                            required 
                            class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="example@example.com"
                        >
                    </div>

                    <div>
                        <label for="subject" class="block text-sm font-medium text-gray-700 mb-2">
                            件名 <span class="text-red-500">*</span>
                        </label>
                        <input 
                            type="text" 
                            id="subject" 
                            name="subject" 
                            required 
                            class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="お問い合わせの件名"
                        >
                    </div>

                    <div>
                        <label for="message" class="block text-sm font-medium text-gray-700 mb-2">
                            お問い合わせ内容 <span class="text-red-500">*</span>
                        </label>
                        <textarea 
                            id="message" 
                            name="message" 
                            required 
                            rows="8"
                            class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="お問い合わせ内容をご記入ください"
                        ></textarea>
                    </div>

                    <div id="form-message" class="hidden"></div>

                    <div class="flex gap-4">
                        <button 
                            type="submit" 
                            id="submit-btn"
                            class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg transition flex-1 font-medium"
                        >
                            <i class="fas fa-paper-plane mr-2"></i>送信する
                        </button>
                        <button 
                            type="button" 
                            onclick="document.getElementById('contact-form').reset()"
                            class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-3 rounded-lg transition"
                        >
                            <i class="fas fa-redo mr-2"></i>リセット
                        </button>
                    </div>
                </form>
            </div>

            <div class="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h2 class="text-lg font-bold text-blue-900 mb-2">
                    <i class="fas fa-info-circle mr-2"></i>お問い合わせについて
                </h2>
                <ul class="text-sm text-blue-800 space-y-1">
                    <li>• お問い合わせには通常1〜3営業日以内に返信いたします。</li>
                    <li>• 内容によっては返信にお時間をいただく場合がございます。</li>
                    <li>• 迷惑メールフォルダもご確認ください。</li>
                </ul>
            </div>
        </div>

        <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
        <script type="text/javascript">
            // EmailJS初期化
            (function(){
                emailjs.init({
                    publicKey: "0lyZ5ouU9p9o_nvGq",
                });
            })();

            document.getElementById('contact-form').addEventListener('submit', function(event) {
                event.preventDefault();
                
                const submitBtn = document.getElementById('submit-btn');
                const formMessage = document.getElementById('form-message');
                
                // ボタンを無効化
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>送信中...';
                
                // フォームデータを取得
                const name = document.getElementById('name').value;
                const email = document.getElementById('email').value;
                const subject = document.getElementById('subject').value;
                const message = document.getElementById('message').value;
                
                // EmailJSで直接送信
                emailjs.send('service_yq3kwqo', 'template_7jrr9wj', {
                    to_name: 'Eigo Bubble',
                    from_name: name,
                    from_email: email,
                    reply_to: email,
                    subject: subject,
                    message: message
                })
                .then(function(response) {
                    formMessage.className = 'bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg';
                    formMessage.innerHTML = '<i class="fas fa-check-circle mr-2"></i>お問い合わせを送信しました。ありがとうございます！';
                    formMessage.classList.remove('hidden');
                    document.getElementById('contact-form').reset();
                }, function(error) {
                    formMessage.className = 'bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg';
                    formMessage.innerHTML = '<i class="fas fa-exclamation-circle mr-2"></i>送信に失敗しました。しばらくしてから再度お試しください。<br><small>エラー: ' + error.text + '</small>';
                    formMessage.classList.remove('hidden');
                    console.error('EmailJS Error:', error);
                })
                .finally(function() {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>送信する';
                });
            });
        </script>
    </body>
    </html>
  `)
})

// 利用規約ページ
app.get('/terms', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>利用規約 - Eigo Bubble</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50">
        <div class="container mx-auto px-4 py-8 max-w-4xl">
            <header class="mb-8">
                <a href="/" class="text-indigo-600 hover:text-indigo-800 transition inline-block mb-4">
                    <i class="fas fa-arrow-left mr-2"></i>トップページに戻る
                </a>
                <h1 class="text-3xl font-bold text-gray-800 mb-2">利用規約</h1>
                <p class="text-gray-600">最終更新日: 2025年1月17日</p>
            </header>

            <div class="bg-white rounded-lg shadow p-8 space-y-6">
                <section>
                    <h2 class="text-xl font-bold text-gray-800 mb-3">第1条（適用）</h2>
                    <p class="text-gray-700 leading-relaxed">
                        本規約は、Eigo Bubble（以下「本サービス」といいます）の利用に関する条件を、本サービスを利用するすべてのユーザー（以下「ユーザー」といいます）と本サービス提供者との間で定めるものです。ユーザーは、本サービスを利用することにより、本規約に同意したものとみなされます。
                    </p>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-800 mb-3">第2条（サービス内容）</h2>
                    <p class="text-gray-700 leading-relaxed">
                        本サービスは、英検5級から1級までの英単語をタイピング練習を通じて学習できるオンライン学習プラットフォームです。以下の機能を提供します：
                    </p>
                    <ul class="list-disc list-inside text-gray-700 mt-2 space-y-1 ml-4">
                        <li>英単語タイピング練習機能</li>
                        <li>学習進捗の追跡・記録機能</li>
                        <li>間違えた単語の自動復習機能</li>
                        <li>学習統計の表示機能</li>
                    </ul>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-800 mb-3">第3条（利用登録）</h2>
                    <p class="text-gray-700 leading-relaxed">
                        本サービスは現在、利用登録なしで誰でも無料で利用できます。ただし、学習データはブラウザのローカルストレージに保存されるため、ブラウザのデータを削除すると学習記録が失われる可能性があります。
                    </p>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-800 mb-3">第4条（禁止事項）</h2>
                    <p class="text-gray-700 leading-relaxed mb-2">ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません：</p>
                    <ul class="list-disc list-inside text-gray-700 space-y-1 ml-4">
                        <li>法令または公序良俗に違反する行為</li>
                        <li>犯罪行為に関連する行為</li>
                        <li>本サービスの運営を妨害する行為</li>
                        <li>本サービスのサーバーやネットワークに過度な負荷をかける行為</li>
                        <li>本サービスのセキュリティを脅かす行為</li>
                        <li>不正アクセス行為</li>
                        <li>本サービスの内容を無断で複製、転載、配布する行為</li>
                        <li>その他、本サービス提供者が不適切と判断する行為</li>
                    </ul>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-800 mb-3">第5条（サービスの停止・変更）</h2>
                    <p class="text-gray-700 leading-relaxed">
                        本サービス提供者は、以下の場合、ユーザーへの事前通知なく本サービスの全部または一部の提供を停止または中断することができるものとします：
                    </p>
                    <ul class="list-disc list-inside text-gray-700 mt-2 space-y-1 ml-4">
                        <li>本サービスに係るシステムの保守点検または更新を行う場合</li>
                        <li>地震、落雷、火災、停電等の不可抗力により本サービスの提供が困難となった場合</li>
                        <li>その他、本サービス提供者が本サービスの提供が困難と判断した場合</li>
                    </ul>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-800 mb-3">第6条（免責事項）</h2>
                    <p class="text-gray-700 leading-relaxed space-y-2">
                        本サービス提供者は、本サービスに関して、以下の事項について一切の責任を負いません：
                    </p>
                    <ul class="list-disc list-inside text-gray-700 mt-2 space-y-1 ml-4">
                        <li>本サービスの内容の正確性、完全性、有用性</li>
                        <li>本サービスの利用によりユーザーに生じた損害</li>
                        <li>ユーザーの学習データの消失</li>
                        <li>本サービスの中断、停止、終了により生じた損害</li>
                        <li>ユーザーの端末環境による不具合</li>
                    </ul>
                    <p class="text-gray-700 leading-relaxed mt-3">
                        本サービスは「現状のまま」提供されるものであり、本サービス提供者は明示・黙示を問わずいかなる保証も行いません。
                    </p>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-800 mb-3">第7条（知的財産権）</h2>
                    <p class="text-gray-700 leading-relaxed">
                        本サービスに含まれるコンテンツ（文章、画像、プログラム等）の知的財産権は、本サービス提供者または正当な権利者に帰属します。ユーザーは、本サービス提供者の事前の許諾なく、これらのコンテンツを複製、転載、配布等することはできません。
                    </p>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-800 mb-3">第8条（個人情報の取扱い）</h2>
                    <p class="text-gray-700 leading-relaxed">
                        本サービスは現在、ユーザーの個人情報を収集していません。学習データはユーザーのブラウザのローカルストレージにのみ保存され、サーバーには送信されません。
                    </p>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-800 mb-3">第9条（規約の変更）</h2>
                    <p class="text-gray-700 leading-relaxed">
                        本サービス提供者は、必要に応じて本規約を変更することができます。規約を変更した場合は、本サービス上で告知するものとし、変更後にユーザーが本サービスを利用した場合、変更後の規約に同意したものとみなされます。
                    </p>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-800 mb-3">第10条（準拠法・管轄裁判所）</h2>
                    <p class="text-gray-700 leading-relaxed">
                        本規約の解釈にあたっては、日本法を準拠法とします。本サービスに関して紛争が生じた場合には、本サービス提供者の所在地を管轄する裁判所を専属的合意管轄裁判所とします。
                    </p>
                </section>

                <div class="border-t pt-6 mt-8">
                    <p class="text-gray-600 text-sm">以上</p>
                </div>
            </div>

            <div class="text-center mt-8">
                <a href="/" class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg transition inline-block">
                    <i class="fas fa-home mr-2"></i>トップページに戻る
                </a>
            </div>
        </div>
    </body>
    </html>
  `)
})

// メインページ
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Eigo Bubble — 英単語タイピング学習</title>
        <meta name="description" content="Eigo Bubbleは、学習追跡とスマート復習で英検5級〜1級の単語をタイピング練習しながらマスターできる学習アプリです。間違えた単語を自動分析し、効率的に再出題。連続二回正解で習得カウント。">
        <meta name="keywords" content="英語タイピング, 単語学習, 学習追跡, スマート復習, 英検, タイピング練習, 英語学習アプリ">
        <meta property="og:title" content="Eigo Bubble — 英単語タイピング学習">
        <meta property="og:description" content="学習追跡とスマート復習で英検単語をマスター">
        <meta property="og:type" content="website">
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/styles.css" rel="stylesheet">
    </head>
    <body>
        <!-- 浮遊するシャボン玉 -->
        <div class="floating-bubble bubble-1"></div>
        <div class="floating-bubble bubble-2"></div>
        <div class="floating-bubble bubble-3"></div>

        <div class="main-container">
            <header class="app-header">
                <h1 class="app-title">
                    <i class="fas fa-graduation-cap"></i>
                    Eigo Bubble
                </h1>
                <p class="text-2xl font-bold text-white mt-2">英単語タイピング学習</p>
                <div>
                    <a href="/admin" class="text-indigo-600 hover:text-indigo-800 transition text-sm">
                        <i class="fas fa-cog mr-2"></i>管理画面
                    </a>
                </div>
            </header>

            <!-- 3つの機能紹介 -->
            <div class="mb-8 max-w-2xl mx-auto space-y-3">
                <div class="flex items-start gap-3 text-white">
                    <i class="fas fa-chart-line text-blue-400 text-xl mt-1"></i>
                    <div>
                        <span class="font-semibold">学習追跡：</span>進捗が自動で保存され、毎日の成果を見える化します。
                    </div>
                </div>
                <div class="flex items-start gap-3 text-white">
                    <i class="fas fa-brain text-purple-400 text-xl mt-1"></i>
                    <div>
                        <span class="font-semibold">スマート復習：</span>間違えた単語を自動分析し、効率的に再出題します。
                    </div>
                </div>
                <div class="flex items-start gap-3 text-white">
                    <i class="fas fa-keyboard text-green-400 text-xl mt-1"></i>
                    <div>
                        <span class="font-semibold">タイピング練習：</span>単語を連続二回正解で習得カウントされる楽しい練習モードです。
                    </div>
                </div>
            </div>

            <!-- 統計ダッシュボード -->
            <div class="stats-dashboard">
                    <h2 class="text-xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-chart-line mr-2"></i>学習統計
                    </h2>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <!-- 今日の正解数 -->
                        <div class="text-center">
                            <div class="text-sm text-gray-600 mb-2">今日の正解数</div>
                            <div class="text-4xl font-bold text-green-600 mb-2">
                                <span id="today-correct-count">0</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2">
                                <div id="today-progress-bar" class="bg-green-500 h-2 rounded-full transition-all duration-500 ease-out" style="width: 0%"></div>
                            </div>
                            <div class="text-xs text-gray-500 mt-1">目標: <span id="today-target">50</span>問</div>
                        </div>

                        <!-- 単語習得数 -->
                        <div class="text-center">
                            <div class="text-sm text-gray-600 mb-2">単語習得数</div>
                            <div class="text-4xl font-bold text-blue-600 mb-2">
                                <span id="total-correct-count">0</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2">
                                <div id="total-progress-bar" class="bg-blue-500 h-2 rounded-full transition-all duration-500 ease-out" style="width: 0%"></div>
                            </div>
                            <div class="text-xs text-gray-500 mt-1">次のマイルストーン: <span id="total-milestone">100</span>語</div>
                        </div>

                        <!-- 連続学習日数 -->
                        <div class="text-center">
                            <div class="text-sm text-gray-600 mb-2">連続学習日数</div>
                            <div class="text-4xl font-bold text-purple-600 mb-2">
                                <span id="streak-count">0</span>
                                <span class="text-xl">日</span>
                            </div>
                            <div class="text-xs text-gray-500 mt-1">
                                <i class="fas fa-fire text-orange-500"></i> 継続は力なり！
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 級選択画面 -->
            <div id="level-selection">
                <h3 class="text-2xl font-bold text-white mb-6 text-center">
                    <i class="fas fa-list mr-2"></i>
                    級を選択してください
                </h3>
                <div id="levels-list" class="level-grid">
                    <!-- 級リストがここに表示されます -->
                </div>
            </div>

            <!-- 難易度選択画面 -->
            <div id="difficulty-selection" class="max-w-3xl mx-auto hidden">
                <button id="back-to-levels" class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg mb-6 transition">
                    <i class="fas fa-arrow-left mr-2"></i>級選択に戻る
                </button>
                <h3 class="text-2xl font-bold text-white mb-6 text-center">
                    <i class="fas fa-gamepad mr-2"></i>
                    モードを選択してください
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- 挑戦モード -->
                    <div id="challenge-mode-card" class="bg-white rounded-xl shadow-lg p-8 cursor-pointer hover:shadow-2xl transition transform hover:-translate-y-1">
                        <div class="text-center">
                            <div class="bg-red-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <i class="fas fa-fire text-4xl text-red-600"></i>
                            </div>
                            <h4 class="text-2xl font-bold text-gray-800 mb-3">挑戦モード</h4>
                            <p class="text-gray-600 mb-4">頭文字のヒントのみ！<br>本気で覚えたい人向け</p>
                            <div class="bg-gray-100 rounded-lg p-4 text-left">
                                <div class="text-sm text-gray-700 space-y-2">
                                    <div><i class="fas fa-check text-green-600 mr-2"></i>頭文字 + アンダースコア</div>
                                    <div><i class="fas fa-check text-green-600 mr-2"></i>日本語訳なし</div>
                                    <div><i class="fas fa-check text-green-600 mr-2"></i>集中力が必要</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 練習モード -->
                    <div id="practice-mode-card" class="bg-white rounded-xl shadow-lg p-8 cursor-pointer hover:shadow-2xl transition transform hover:-translate-y-1">
                        <div class="text-center">
                            <div class="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <i class="fas fa-graduation-cap text-4xl text-blue-600"></i>
                            </div>
                            <h4 class="text-2xl font-bold text-gray-800 mb-3">練習モード</h4>
                            <p class="text-gray-600 mb-4">音声と日本語でサポート！<br>楽しく学びたい人向け</p>
                            <div class="bg-gray-100 rounded-lg p-4 text-left">
                                <div class="text-sm text-gray-700 space-y-2">
                                    <div><i class="fas fa-check text-green-600 mr-2"></i>1文字だけ空欄</div>
                                    <div><i class="fas fa-check text-green-600 mr-2"></i>日本語訳を表示</div>
                                    <div><i class="fas fa-check text-green-600 mr-2"></i>自動音声再生</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- タイピング練習画面 -->
            <div id="practice-screen" class="max-w-4xl mx-auto hidden">
                <div class="practice-card p-6 mb-6">
                    <div class="flex justify-between items-center mb-6">
                        <button id="back-button" class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition">
                            <i class="fas fa-arrow-left mr-2"></i>戻る
                        </button>
                        <div class="text-center">
                            <h2 id="current-level" class="text-2xl font-bold text-indigo-900"></h2>
                            <p id="progress-text" class="text-gray-600"></p>
                        </div>
                        <div class="flex gap-2">
                            <button id="audio-mode-btn" class="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg transition">
                                <i class="fas fa-volume-up mr-2"></i>音声モード
                            </button>
                            <button id="text-mode-btn" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition">
                                <i class="fas fa-keyboard mr-2"></i>テキストモード
                            </button>
                        </div>
                    </div>

                    <!-- 統計情報 -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div class="bg-green-50 p-4 rounded-lg text-center">
                            <div class="text-3xl font-bold text-green-600" id="correct-count">0</div>
                            <div class="text-sm text-gray-600">正解</div>
                        </div>
                        <div class="bg-red-50 p-4 rounded-lg text-center">
                            <div class="text-3xl font-bold text-red-600" id="incorrect-count">0</div>
                            <div class="text-sm text-gray-600">不正解</div>
                        </div>
                        <div class="bg-blue-50 p-4 rounded-lg text-center">
                            <div class="text-3xl font-bold text-blue-600" id="accuracy">0%</div>
                            <div class="text-sm text-gray-600">正答率</div>
                        </div>
                        <div class="bg-purple-50 p-4 rounded-lg text-center">
                            <div class="text-3xl font-bold text-purple-600" id="remaining">10</div>
                            <div class="text-sm text-gray-600">残り</div>
                        </div>
                    </div>

                    <!-- 問題表示エリア -->
                    <div class="bg-gradient-to-r from-indigo-50 to-purple-50 p-8 rounded-lg mb-6">
                        <div class="text-center mb-6">
                            <div id="question-area" class="text-4xl font-bold text-indigo-900 mb-4">
                                <!-- 日本語訳または音声ボタン -->
                            </div>
                            <div id="part-of-speech" class="text-sm text-gray-600 mb-2"></div>
                        </div>

                        <div class="max-w-md mx-auto">
                            <!-- ヒント表示（単語の長さとアンダースコア） -->
                            <div id="word-hint" class="text-center text-2xl font-mono mb-2 h-8"></div>
                            
                            <div class="input-container">
                                <div id="ghost-text" class="ghost-text"></div>
                                <input 
                                    type="text" 
                                    id="answer-input" 
                                    class="glass-input w-full text-2xl text-center px-6 py-4 focus:outline-none transition typing-input"
                                    placeholder="英単語を入力..."
                                    autocomplete="off"
                                    spellcheck="false"
                                />
                            </div>
                            <div id="feedback" class="text-center mt-4 text-lg font-semibold h-8"></div>
                        </div>
                    </div>

                    <div class="text-center">
                        <button id="skip-button" class="bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-3 rounded-lg transition">
                            <i class="fas fa-forward mr-2"></i>スキップ
                        </button>
                    </div>
                </div>
            </div>

            <!-- 結果画面 -->
            <div id="result-screen" class="max-w-4xl mx-auto hidden">
                <div class="practice-card p-8 text-center">
                    <h2 class="text-3xl font-bold text-indigo-900 mb-6">
                        <i class="fas fa-trophy mr-2"></i>お疲れ様でした！
                    </h2>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div class="bg-green-50 p-6 rounded-lg">
                            <div class="text-4xl font-bold text-green-600" id="result-correct">0</div>
                            <div class="text-gray-600">正解</div>
                        </div>
                        <div class="bg-red-50 p-6 rounded-lg">
                            <div class="text-4xl font-bold text-red-600" id="result-incorrect">0</div>
                            <div class="text-gray-600">不正解</div>
                        </div>
                        <div class="bg-blue-50 p-6 rounded-lg">
                            <div class="text-4xl font-bold text-blue-600" id="result-accuracy">0%</div>
                            <div class="text-gray-600">正答率</div>
                        </div>
                    </div>
                    
                    <!-- 間違えた単語の復習メッセージ -->
                    <div id="wrong-words-info" class="mb-6 text-orange-600 font-semibold hidden"></div>
                    
                    <div class="flex flex-col gap-4 items-center">
                        <button id="continue-review-button" class="bg-orange-600 hover:bg-orange-700 text-white px-8 py-3 rounded-lg transition hidden">
                            <i class="fas fa-arrow-right mr-2"></i>間違えた単語を復習する
                        </button>
                        <div class="flex gap-4">
                            <button id="retry-button" class="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg transition">
                                <i class="fas fa-redo mr-2"></i>もう一度
                            </button>
                            <button id="back-to-menu-button" class="bg-gray-500 hover:bg-gray-600 text-white px-8 py-3 rounded-lg transition">
                                <i class="fas fa-home mr-2"></i>メニューに戻る
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- フッター -->
        <footer class="app-footer">
            <div class="mb-2 space-x-4">
                <a href="/terms" class="text-white hover:text-gray-200 transition text-sm">
                    <i class="fas fa-file-contract mr-1"></i>利用規約
                </a>
                <a href="/contact" class="text-white hover:text-gray-200 transition text-sm">
                    <i class="fas fa-envelope mr-1"></i>お問い合わせ
                </a>
            </div>
            <p>&copy; 2025 Eigo Bubble. All rights reserved.</p>
        </footer>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

export default app
