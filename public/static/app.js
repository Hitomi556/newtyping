// Eigo Bubble - メインアプリケーションロジック

// グローバル変数
let currentLevel = null;
let currentWords = [];
let currentWordIndex = 0;
let correctCount = 0;
let incorrectCount = 0;
let wrongWords = [];
let isReviewMode = false;
let currentMode = 'text'; // 'text' または 'audio'
let mistakeMade = false; // 途中でミスがあったかどうかを記録

// ローカルストレージキー
const STORAGE_KEYS = {
    TODAY_CORRECT: 'today_correct_count',
    TODAY_DATE: 'today_date',
    TOTAL_CORRECT: 'total_correct_count',
    STREAK: 'streak_data',
    STARTED_LEVELS: 'started_levels' // 学習開始済み級のリスト
};

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    loadLevels();
    updateStatsDisplay();
    setupEventListeners();
});

// イベントリスナー設定
function setupEventListeners() {
    // 戻るボタン
    document.getElementById('back-button')?.addEventListener('click', backToLevelSelection);
    
    // スキップボタン
    document.getElementById('skip-button')?.addEventListener('click', skipQuestion);
    
    // 答え入力
    const answerInput = document.getElementById('answer-input');
    if (answerInput) {
        answerInput.addEventListener('input', handleInput);
        answerInput.addEventListener('keypress', handleKeypress);
    }
    
    // 結果画面のボタン
    document.getElementById('retry-button')?.addEventListener('click', retryLevel);
    document.getElementById('back-to-menu-button')?.addEventListener('click', backToLevelSelection);
    document.getElementById('continue-review-button')?.addEventListener('click', startReview);
    
    // モード切替ボタン
    document.getElementById('text-mode-btn')?.addEventListener('click', () => switchMode('text'));
    document.getElementById('audio-mode-btn')?.addEventListener('click', () => switchMode('audio'));
}

// 級一覧を読み込み
async function loadLevels() {
    try {
        const response = await axios.get('/api/levels');
        if (response.data.success) {
            displayLevels(response.data.levels);
        }
    } catch (error) {
        console.error('級一覧の読み込みエラー:', error);
        alert('級一覧の読み込みに失敗しました');
    }
}

// 級一覧を表示（復習予定数付き）
async function displayLevels(levels) {
    const levelsList = document.getElementById('levels-list');
    levelsList.innerHTML = '';
    
    // 学習開始済み級のリストを取得
    const startedLevels = getStartedLevels();
    
    for (const level of levels) {
        const card = document.createElement('div');
        card.className = 'level-card';
        card.onclick = () => startLevel(level);
        
        const badgeColors = {
            5: 'bg-green-500',
            4: 'bg-blue-500',
            3: 'bg-yellow-500',
            2: 'bg-orange-500',
            1: 'bg-red-500',
            0: 'bg-purple-500',
            '-1': 'bg-pink-500'
        };
        
        // 学習開始済みの級のみ復習予定数を取得して表示
        let reviewInfo = '';
        if (startedLevels.includes(level.id)) {
            let dueCount = 0;
            try {
                const response = await axios.get(`/api/review-due/${level.id}`);
                if (response.data.success) {
                    dueCount = response.data.due_count;
                }
            } catch (error) {
                console.error('復習予定数の取得エラー:', error);
            }
            
            if (dueCount > 0) {
                reviewInfo = `
                    <div class="text-sm text-orange-600 font-bold mb-1">
                        <i class="fas fa-clock mr-1"></i>復習予定: ${dueCount}語
                    </div>
                `;
            }
        }
        
        card.innerHTML = `
            <div class="level-badge ${badgeColors[level.id]} text-white">
                ${level.display_name}
            </div>
            <div class="text-2xl font-bold text-gray-800 mb-2">
                ${level.word_count || 0}語
            </div>
            ${reviewInfo}
            <div class="text-sm text-gray-600">
                クリックして開始
            </div>
        `;
        
        levelsList.appendChild(card);
    }
}

// 級を開始
async function startLevel(level) {
    currentLevel = level;
    isReviewMode = false;
    wrongWords = [];
    
    // 学習開始済み級リストに追加
    markLevelAsStarted(level.id);
    
    try {
        const response = await axios.get(`/api/quiz/${level.id}?count=10`);
        if (response.data.success && response.data.words.length > 0) {
            currentWords = response.data.words;
            currentWordIndex = 0;
            correctCount = 0;
            incorrectCount = 0;
            
            showPracticeScreen();
            displayQuestion();
        } else {
            alert('この級にはまだ単語が登録されていません');
        }
    } catch (error) {
        console.error('単語の読み込みエラー:', error);
        alert('単語の読み込みに失敗しました');
    }
}

// 練習画面を表示
function showPracticeScreen() {
    document.getElementById('level-selection').classList.add('hidden');
    document.getElementById('practice-screen').classList.remove('hidden');
    document.getElementById('result-screen').classList.add('hidden');
    
    document.getElementById('current-level').textContent = currentLevel.display_name;
    updateProgress();
}

// 問題を表示
function displayQuestion() {
    if (currentWordIndex >= currentWords.length) {
        showResults();
        return;
    }
    
    const word = currentWords[currentWordIndex];
    const answerInput = document.getElementById('answer-input');
    const questionArea = document.getElementById('question-area');
    const partOfSpeech = document.getElementById('part-of-speech');
    const ghostText = document.getElementById('ghost-text');
    const feedback = document.getElementById('feedback');
    const wordHint = document.getElementById('word-hint');
    
    // リセット
    answerInput.value = '';
    answerInput.disabled = false;
    answerInput.focus();
    feedback.textContent = '';
    ghostText.textContent = word.english;
    mistakeMade = false; // 新しい単語なのでミスフラグをリセット
    
    // 単語のヒント表示を生成（最初の1文字を薄く、残りはアンダースコア）
    const firstChar = word.english.charAt(0);
    const underscores = '_'.repeat(word.english.length - 1);
    wordHint.innerHTML = `<span style="color: rgba(100, 100, 100, 0.3); letter-spacing: 2px;">${firstChar}</span><span style="letter-spacing: 2px;">${underscores}</span>`;
    
    // モードに応じて表示を変更
    if (currentMode === 'text') {
        questionArea.innerHTML = `<div class="text-4xl font-bold">${word.japanese}</div>`;
    } else {
        questionArea.innerHTML = `
            <button onclick="speakWord('${word.english}')" class="bg-purple-500 hover:bg-purple-600 text-white px-8 py-4 rounded-lg text-2xl transition">
                <i class="fas fa-volume-up mr-3"></i>英語を聞く
            </button>
        `;
        // 音声モードの場合、自動的に最初の一度読み上げる
        setTimeout(() => speakWord(word.english), 300);
    }
    
    partOfSpeech.textContent = word.part_of_speech ? `（${word.part_of_speech}）` : '';
    
    updateProgress();
}

// 入力処理
function handleInput(e) {
    const input = e.target.value.toLowerCase().trim();
    const word = currentWords[currentWordIndex];
    const correctAnswer = word.english.toLowerCase();
    
    // ゴーストテキストの更新
    const ghostText = document.getElementById('ghost-text');
    if (input && correctAnswer.startsWith(input)) {
        ghostText.textContent = correctAnswer;
        ghostText.style.color = 'rgba(0, 200, 0, 0.3)';
        
        // 完全一致したら自動的に次へ
        if (input === correctAnswer) {
            checkAnswer();
        }
    } else if (input) {
        // 間違った入力があった場合、ミスフラグを立てる
        mistakeMade = true;
        ghostText.textContent = correctAnswer;
        ghostText.style.color = 'rgba(255, 0, 0, 0.3)';
    } else {
        ghostText.textContent = correctAnswer;
        ghostText.style.color = 'rgba(0, 0, 0, 0.2)';
    }
    
    // ヒント表示の動的更新
    updateWordHint(input, correctAnswer);
}

// Enterキー処理
function handleKeypress(e) {
    if (e.key === 'Enter') {
        checkAnswer();
    }
}

// 答えをチェック
async function checkAnswer() {
    const answerInput = document.getElementById('answer-input');
    const userAnswer = answerInput.value.toLowerCase().trim();
    const word = currentWords[currentWordIndex];
    const correctAnswer = word.english.toLowerCase();
    const feedback = document.getElementById('feedback');
    
    if (!userAnswer) return;
    
    answerInput.disabled = true;
    
    // 最終的な入力が正しくても、途中でミスがあった場合は不正解とする
    const isCorrect = userAnswer === correctAnswer && !mistakeMade;
    
    if (isCorrect) {
        correctCount++;
        feedback.textContent = '正解！ ✓';
        feedback.className = 'text-center mt-4 text-lg font-semibold h-8 feedback-correct';
        
        // 今日の正解数を更新
        updateTodayCorrectCount();
    } else {
        incorrectCount++;
        wrongWords.push(word);
        if (mistakeMade && userAnswer === correctAnswer) {
            feedback.textContent = `途中でミスがありました... 正解: ${word.english}`;
        } else {
            feedback.textContent = `不正解... 正解: ${word.english}`;
        }
        feedback.className = 'text-center mt-4 text-lg font-semibold h-8 feedback-incorrect';
    }
    
    // 進捗を保存
    await saveProgress(word.id, isCorrect);
    
    // 次の問題へ
    setTimeout(() => {
        currentWordIndex++;
        displayQuestion();
    }, 1500);
}

// スキップ
function skipQuestion() {
    const word = currentWords[currentWordIndex];
    incorrectCount++;
    wrongWords.push(word);
    
    const feedback = document.getElementById('feedback');
    feedback.textContent = `スキップ... 正解: ${word.english}`;
    feedback.className = 'text-center mt-4 text-lg font-semibold h-8 feedback-incorrect';
    
    // 進捗を保存（不正解として）
    saveProgress(word.id, false);
    
    setTimeout(() => {
        currentWordIndex++;
        displayQuestion();
    }, 1500);
}

// 進捗を更新
function updateProgress() {
    document.getElementById('correct-count').textContent = correctCount;
    document.getElementById('incorrect-count').textContent = incorrectCount;
    
    const total = correctCount + incorrectCount;
    const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    document.getElementById('accuracy').textContent = accuracy + '%';
    
    const remaining = currentWords.length - currentWordIndex;
    document.getElementById('remaining').textContent = remaining;
    
    document.getElementById('progress-text').textContent = 
        `${currentWordIndex + 1} / ${currentWords.length}`;
}

// 結果を表示
function showResults() {
    document.getElementById('practice-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.remove('hidden');
    
    document.getElementById('result-correct').textContent = correctCount;
    document.getElementById('result-incorrect').textContent = incorrectCount;
    
    const total = correctCount + incorrectCount;
    const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    document.getElementById('result-accuracy').textContent = accuracy + '%';
    
    // 間違えた単語がある場合
    const wrongWordsInfo = document.getElementById('wrong-words-info');
    const continueReviewButton = document.getElementById('continue-review-button');
    
    if (wrongWords.length > 0 && !isReviewMode) {
        wrongWordsInfo.textContent = `${wrongWords.length}個の単語を間違えました`;
        wrongWordsInfo.classList.remove('hidden');
        continueReviewButton.classList.remove('hidden');
    } else {
        wrongWordsInfo.classList.add('hidden');
        continueReviewButton.classList.add('hidden');
    }
}

// 間違えた単語を復習
function startReview() {
    if (wrongWords.length === 0) return;
    
    isReviewMode = true;
    currentWords = [...wrongWords];
    wrongWords = [];
    currentWordIndex = 0;
    correctCount = 0;
    incorrectCount = 0;
    
    showPracticeScreen();
    displayQuestion();
}

// もう一度
function retryLevel() {
    if (currentLevel) {
        startLevel(currentLevel);
    }
}

// 級選択に戻る
function backToLevelSelection() {
    document.getElementById('practice-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.add('hidden');
    document.getElementById('level-selection').classList.remove('hidden');
    
    currentLevel = null;
    currentWords = [];
    wrongWords = [];
    
    // 統計を更新
    updateStatsDisplay();
    loadLevels();
}

// モード切替
function switchMode(mode) {
    currentMode = mode;
    
    const textBtn = document.getElementById('text-mode-btn');
    const audioBtn = document.getElementById('audio-mode-btn');
    
    if (mode === 'text') {
        textBtn.classList.add('bg-blue-600');
        textBtn.classList.remove('bg-blue-500');
        audioBtn.classList.add('bg-purple-500');
        audioBtn.classList.remove('bg-purple-600');
    } else {
        audioBtn.classList.add('bg-purple-600');
        audioBtn.classList.remove('bg-purple-500');
        textBtn.classList.add('bg-blue-500');
        textBtn.classList.remove('bg-blue-600');
    }
    
    // 現在の問題を再表示
    if (currentWordIndex < currentWords.length) {
        displayQuestion();
    }
}

// ヒント表示の動的更新
function updateWordHint(input, correctAnswer) {
    const wordHint = document.getElementById('word-hint');
    if (!wordHint) return;
    
    let hintHTML = '';
    
    for (let i = 0; i < correctAnswer.length; i++) {
        if (i < input.length) {
            // 入力済みの部分は通常色で表示
            const isCorrect = input[i] === correctAnswer[i];
            const color = isCorrect ? 'rgba(0, 200, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)';
            hintHTML += `<span style="color: ${color}; letter-spacing: 2px;">${correctAnswer[i]}</span>`;
        } else if (i === 0) {
            // 最初の文字（未入力の場合）は薄いグレーで表示
            hintHTML += `<span style="color: rgba(100, 100, 100, 0.3); letter-spacing: 2px;">${correctAnswer[i]}</span>`;
        } else {
            // 残りはアンダースコア
            hintHTML += `<span style="letter-spacing: 2px;">_</span>`;
        }
    }
    
    wordHint.innerHTML = hintHTML;
}

// 音声読み上げ
function speakWord(text) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US'; // 英語（アメリカ）ネイティブ発音
        utterance.rate = 0.9; // 自然な速度
        speechSynthesis.speak(utterance);
    } else {
        alert('お使いのブラウザは音声機能に対応していません');
    }
}

// 進捗を保存
async function saveProgress(wordId, isCorrect) {
    try {
        await axios.post('/api/progress', {
            word_id: wordId,
            is_correct: isCorrect,
            mode: currentMode
        });
    } catch (error) {
        console.error('進捗保存エラー:', error);
    }
}

// ========== 統計機能 ==========

// 学習開始済み級のリストを取得
function getStartedLevels() {
    const stored = localStorage.getItem(STORAGE_KEYS.STARTED_LEVELS);
    if (!stored) return [];
    try {
        return JSON.parse(stored);
    } catch (error) {
        console.error('学習開始済み級リストの読み込みエラー:', error);
        return [];
    }
}

// 級を学習開始済みとしてマーク
function markLevelAsStarted(levelId) {
    const startedLevels = getStartedLevels();
    if (!startedLevels.includes(levelId)) {
        startedLevels.push(levelId);
        localStorage.setItem(STORAGE_KEYS.STARTED_LEVELS, JSON.stringify(startedLevels));
    }
}

// 今日の正解数を更新
function updateTodayCorrectCount() {
    const today = new Date().toDateString();
    const storedDate = localStorage.getItem(STORAGE_KEYS.TODAY_DATE);
    
    let todayCount = 0;
    
    if (storedDate === today) {
        todayCount = parseInt(localStorage.getItem(STORAGE_KEYS.TODAY_CORRECT) || '0');
    }
    
    todayCount++;
    
    localStorage.setItem(STORAGE_KEYS.TODAY_CORRECT, todayCount.toString());
    localStorage.setItem(STORAGE_KEYS.TODAY_DATE, today);
    
    // 連続学習日数を更新
    updateStreak();
    
    // 表示を更新
    updateStatsDisplay();
}

// 連続学習日数を更新
function updateStreak() {
    const today = new Date().toDateString();
    const streakData = JSON.parse(localStorage.getItem(STORAGE_KEYS.STREAK) || '{"count": 0, "lastDate": null}');
    
    const lastDate = streakData.lastDate;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();
    
    if (lastDate === today) {
        // 今日は既にカウント済み
        return;
    } else if (lastDate === yesterdayStr) {
        // 昨日学習していた -> 連続
        streakData.count++;
        streakData.lastDate = today;
    } else if (!lastDate || lastDate !== today) {
        // 初回 or 途切れた
        streakData.count = 1;
        streakData.lastDate = today;
    }
    
    localStorage.setItem(STORAGE_KEYS.STREAK, JSON.stringify(streakData));
}

// 統計表示を更新
async function updateStatsDisplay() {
    // 今日の正解数
    const today = new Date().toDateString();
    const storedDate = localStorage.getItem(STORAGE_KEYS.TODAY_DATE);
    const todayCount = (storedDate === today) 
        ? parseInt(localStorage.getItem(STORAGE_KEYS.TODAY_CORRECT) || '0')
        : 0;
    
    document.getElementById('today-correct-count').textContent = todayCount;
    
    // 目標とプログレスバー
    const todayTarget = 50;
    document.getElementById('today-target').textContent = todayTarget;
    const todayProgress = Math.min((todayCount / todayTarget) * 100, 100);
    document.getElementById('today-progress-bar').style.width = todayProgress + '%';
    
    // 習得単語数（APIから取得）
    try {
        const response = await axios.get('/api/mastery/global');
        if (response.data.success) {
            const totalMastered = response.data.total_mastered || 0;
            document.getElementById('total-correct-count').textContent = totalMastered;
            
            // 次のマイルストーン
            const milestones = [100, 200, 500, 1000, 2000, 5000];
            const nextMilestone = milestones.find(m => m > totalMastered) || milestones[milestones.length - 1];
            document.getElementById('total-milestone').textContent = nextMilestone;
            
            const totalProgress = (totalMastered / nextMilestone) * 100;
            document.getElementById('total-progress-bar').style.width = totalProgress + '%';
        }
    } catch (error) {
        console.error('習得統計の取得エラー:', error);
    }
    
    // 連続学習日数
    const streakData = JSON.parse(localStorage.getItem(STORAGE_KEYS.STREAK) || '{"count": 0, "lastDate": null}');
    const lastDate = streakData.lastDate;
    const streakCount = (lastDate === today || lastDate === new Date(Date.now() - 86400000).toDateString()) 
        ? streakData.count 
        : 0;
    
    document.getElementById('streak-count').textContent = streakCount;
}
