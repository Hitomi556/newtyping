-- 間隔反復学習（SRS）用のフィールドを追加

-- progressテーブルに新しいカラムを追加（デフォルト値なしで追加）
ALTER TABLE progress ADD COLUMN easiness_factor REAL;
ALTER TABLE progress ADD COLUMN repetitions INTEGER;
ALTER TABLE progress ADD COLUMN interval_days INTEGER;
ALTER TABLE progress ADD COLUMN next_review_date DATETIME;
ALTER TABLE progress ADD COLUMN review_stage INTEGER;

-- 既存レコードに初期値を設定
UPDATE progress SET easiness_factor = 2.5 WHERE easiness_factor IS NULL;
UPDATE progress SET repetitions = 0 WHERE repetitions IS NULL;
UPDATE progress SET interval_days = 0 WHERE interval_days IS NULL;
UPDATE progress SET next_review_date = CURRENT_TIMESTAMP WHERE next_review_date IS NULL;
UPDATE progress SET review_stage = 0 WHERE review_stage IS NULL;

-- インデックスを追加（復習期限が来た単語を効率的に検索するため）
CREATE INDEX IF NOT EXISTS idx_progress_next_review ON progress(next_review_date, review_stage);
CREATE INDEX IF NOT EXISTS idx_progress_review_stage ON progress(review_stage);
