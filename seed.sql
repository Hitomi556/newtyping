-- サンプル単語データ（5級）
INSERT OR IGNORE INTO words (english, japanese, level_id, part_of_speech, example_sentence) VALUES
  ('hello', 'こんにちは', 5, '間投詞', 'Hello, how are you?'),
  ('cat', '猫', 5, '名詞', 'I have a cat.'),
  ('dog', '犬', 5, '名詞', 'This is my dog.'),
  ('book', '本', 5, '名詞', 'I read a book.'),
  ('apple', 'りんご', 5, '名詞', 'I like apples.'),
  ('happy', '幸せな', 5, '形容詞', 'I am happy.'),
  ('big', '大きい', 5, '形容詞', 'This is a big house.'),
  ('small', '小さい', 5, '形容詞', 'That is a small car.'),
  ('eat', '食べる', 5, '動詞', 'I eat breakfast.'),
  ('run', '走る', 5, '動詞', 'I run every day.');

-- サンプル単語データ（4級）
INSERT OR IGNORE INTO words (english, japanese, level_id, part_of_speech, example_sentence) VALUES
  ('beautiful', '美しい', 4, '形容詞', 'She is beautiful.'),
  ('interesting', '興味深い', 4, '形容詞', 'This book is interesting.'),
  ('difficult', '難しい', 4, '形容詞', 'This problem is difficult.'),
  ('important', '重要な', 4, '形容詞', 'This is important.'),
  ('different', '異なる', 4, '形容詞', 'This is different from that.'),
  ('understand', '理解する', 4, '動詞', 'I understand the question.'),
  ('remember', '覚えている', 4, '動詞', 'I remember your name.'),
  ('forget', '忘れる', 4, '動詞', "Don't forget to bring your book."),
  ('receive', '受け取る', 4, '動詞', 'I received your letter.'),
  ('believe', '信じる', 4, '動詞', 'I believe in you.');

-- サンプル単語データ（3級）
INSERT OR IGNORE INTO words (english, japanese, level_id, part_of_speech, example_sentence) VALUES
  ('however', 'しかしながら', 3, '副詞', 'I like it. However, it is expensive.'),
  ('therefore', 'それゆえに', 3, '副詞', 'He was sick. Therefore, he stayed home.'),
  ('although', 'だけれども', 3, '接続詞', 'Although it was raining, we went out.'),
  ('experience', '経験', 3, '名詞', 'I have no experience in teaching.'),
  ('environment', '環境', 3, '名詞', 'We need to protect the environment.'),
  ('consider', '考慮する', 3, '動詞', 'Please consider my opinion.'),
  ('improve', '改善する', 3, '動詞', 'I want to improve my English.'),
  ('achieve', '達成する', 3, '動詞', 'I achieved my goal.'),
  ('develop', '発展させる', 3, '動詞', 'He developed a new method.'),
  ('require', '必要とする', 3, '動詞', 'This job requires experience.');
