-- 英検級テーブル
CREATE TABLE IF NOT EXISTS eiken_levels (
  id INTEGER PRIMARY KEY,
  level_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 英検級の初期データ
INSERT OR IGNORE INTO eiken_levels (id, level_name, display_name) VALUES
  (5, 'grade5', '5級'),
  (4, 'grade4', '4級'),
  (3, 'grade3', '3級'),
  (2, 'pre2', '準2級'),
  (1, 'grade2', '2級'),
  (0, 'pre1', '準1級'),
  (-1, 'grade1', '1級');

-- 単語テーブル
CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  english TEXT NOT NULL,
  japanese TEXT NOT NULL,
  level_id INTEGER NOT NULL,
  part_of_speech TEXT,
  example_sentence TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (level_id) REFERENCES eiken_levels(id)
);

-- 学習進捗テーブル
CREATE TABLE IF NOT EXISTS progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL,
  user_id TEXT NOT NULL DEFAULT 'default_user',
  correct_count INTEGER DEFAULT 0,
  incorrect_count INTEGER DEFAULT 0,
  consecutive_correct INTEGER DEFAULT 0,
  is_mastered INTEGER DEFAULT 0,
  mastered_at DATETIME,
  last_practiced DATETIME DEFAULT CURRENT_TIMESTAMP,
  mode TEXT DEFAULT 'text',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (word_id) REFERENCES words(id),
  UNIQUE(word_id, user_id, mode)
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_words_level_id ON words(level_id);
CREATE INDEX IF NOT EXISTS idx_progress_word_id ON progress(word_id);
CREATE INDEX IF NOT EXISTS idx_progress_user_id ON progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_is_mastered ON progress(is_mastered);
