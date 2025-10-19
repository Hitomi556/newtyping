// Eigo Bubble - 管理画面ロジック

let currentOffset = 0;
const LIMIT = 100;
let currentFilterLevel = '';

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    loadStats();
    loadWords();
    setupEventListeners();
});

// イベントリスナー設定
function setupEventListeners() {
    // タブ切替
    document.getElementById('tab-list')?.addEventListener('click', () => showTab('list'));
    document.getElementById('tab-add')?.addEventListener('click', () => showTab('add'));
    document.getElementById('tab-import')?.addEventListener('click', () => showTab('import'));
    
    // 単語追加フォーム
    document.getElementById('add-word-form')?.addEventListener('submit', handleAddWord);
    document.getElementById('clear-form')?.addEventListener('click', clearAddForm);
    
    // 単語編集フォーム
    document.getElementById('edit-word-form')?.addEventListener('submit', handleEditWord);
    document.getElementById('close-modal')?.addEventListener('click', closeEditModal);
    document.getElementById('cancel-edit')?.addEventListener('click', closeEditModal);
    
    // CSVインポート
    document.getElementById('import-csv-btn')?.addEventListener('click', handleImportCSV);
    
    // フィルター変更
    document.getElementById('filter-level')?.addEventListener('change', handleFilterChange);
    
    // もっと読み込む
    document.getElementById('load-more')?.addEventListener('click', loadMoreWords);
}

// タブ表示切替
function showTab(tab) {
    // タブボタンのスタイル更新
    const tabs = ['list', 'add', 'import'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        const content = document.getElementById(`content-${t}`);
        
        if (t === tab) {
            btn.classList.add('text-indigo-600', 'border-b-2', 'border-indigo-600');
            btn.classList.remove('text-gray-600');
            content.classList.remove('hidden');
        } else {
            btn.classList.remove('text-indigo-600', 'border-b-2', 'border-indigo-600');
            btn.classList.add('text-gray-600');
            content.classList.add('hidden');
        }
    });
}

// 統計情報の読み込み
async function loadStats() {
    try {
        const response = await axios.get('/api/admin/words');
        if (response.data.success) {
            document.getElementById('total-words').textContent = response.data.total || 0;
        }
        
        // 級ごとの単語数
        const levels = [5, 3, -1];
        for (const level of levels) {
            const res = await axios.get(`/api/admin/words?level_id=${level}`);
            if (res.data.success) {
                const elementId = level === 5 ? 'level5-count' : level === 3 ? 'level3-count' : 'level1-count';
                document.getElementById(elementId).textContent = res.data.total || 0;
            }
        }
    } catch (error) {
        console.error('統計情報の読み込みエラー:', error);
    }
}

// 単語一覧の読み込み
async function loadWords(reset = false) {
    if (reset) {
        currentOffset = 0;
        document.getElementById('words-table').innerHTML = '';
    }
    
    try {
        let url = `/api/admin/words?limit=${LIMIT}&offset=${currentOffset}`;
        if (currentFilterLevel) {
            url += `&level_id=${currentFilterLevel}`;
        }
        
        const response = await axios.get(url);
        if (response.data.success) {
            displayWords(response.data.words);
            currentOffset += response.data.words.length;
        }
    } catch (error) {
        console.error('単語一覧の読み込みエラー:', error);
        alert('単語一覧の読み込みに失敗しました');
    }
}

// 単語一覧を表示
function displayWords(words) {
    const tbody = document.getElementById('words-table');
    
    words.forEach(word => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-4 py-3 text-sm text-gray-700">${word.id}</td>
            <td class="px-4 py-3 text-sm font-medium text-gray-900">${word.english}</td>
            <td class="px-4 py-3 text-sm text-gray-700">${word.japanese}</td>
            <td class="px-4 py-3 text-sm text-gray-700">${word.level_name || ''}</td>
            <td class="px-4 py-3 text-sm text-gray-700">${word.part_of_speech || '-'}</td>
            <td class="px-4 py-3 text-sm">
                <button onclick="editWord(${word.id})" class="text-blue-600 hover:text-blue-800 mr-3">
                    <i class="fas fa-edit"></i> 編集
                </button>
                <button onclick="deleteWord(${word.id})" class="text-red-600 hover:text-red-800">
                    <i class="fas fa-trash"></i> 削除
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// もっと読み込む
function loadMoreWords() {
    loadWords(false);
}

// フィルター変更
function handleFilterChange(e) {
    currentFilterLevel = e.target.value;
    loadWords(true);
}

// 単語追加
async function handleAddWord(e) {
    e.preventDefault();
    
    const data = {
        english: document.getElementById('add-english').value.trim(),
        japanese: document.getElementById('add-japanese').value.trim(),
        level_id: parseInt(document.getElementById('add-level').value),
        part_of_speech: document.getElementById('add-part').value.trim() || null,
        example_sentence: document.getElementById('add-example').value.trim() || null
    };
    
    try {
        const response = await axios.post('/api/admin/words', data);
        if (response.data.success) {
            showMessage('add-message', '単語を追加しました', 'success');
            clearAddForm();
            loadStats();
            loadWords(true);
        } else {
            showMessage('add-message', '追加に失敗しました: ' + response.data.error, 'error');
        }
    } catch (error) {
        console.error('単語追加エラー:', error);
        showMessage('add-message', '追加に失敗しました', 'error');
    }
}

// 追加フォームをクリア
function clearAddForm() {
    document.getElementById('add-word-form').reset();
    document.getElementById('add-message').innerHTML = '';
}

// 単語編集（モーダル表示）
async function editWord(id) {
    try {
        // 単語データを取得
        const response = await axios.get(`/api/admin/words`);
        const word = response.data.words.find(w => w.id === id);
        
        if (!word) {
            alert('単語が見つかりませんでした');
            return;
        }
        
        // フォームに値を設定
        document.getElementById('edit-id').value = word.id;
        document.getElementById('edit-english').value = word.english;
        document.getElementById('edit-japanese').value = word.japanese;
        document.getElementById('edit-level').value = word.level_id;
        document.getElementById('edit-part').value = word.part_of_speech || '';
        document.getElementById('edit-example').value = word.example_sentence || '';
        
        // モーダルを表示
        const modal = document.getElementById('edit-modal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } catch (error) {
        console.error('単語取得エラー:', error);
        alert('単語の取得に失敗しました');
    }
}

// 単語編集を保存
async function handleEditWord(e) {
    e.preventDefault();
    
    const id = document.getElementById('edit-id').value;
    const data = {
        english: document.getElementById('edit-english').value.trim(),
        japanese: document.getElementById('edit-japanese').value.trim(),
        level_id: parseInt(document.getElementById('edit-level').value),
        part_of_speech: document.getElementById('edit-part').value.trim() || null,
        example_sentence: document.getElementById('edit-example').value.trim() || null
    };
    
    try {
        const response = await axios.put(`/api/admin/words/${id}`, data);
        if (response.data.success) {
            alert('単語を更新しました');
            closeEditModal();
            loadWords(true);
        } else {
            alert('更新に失敗しました: ' + response.data.error);
        }
    } catch (error) {
        console.error('単語更新エラー:', error);
        alert('更新に失敗しました');
    }
}

// 編集モーダルを閉じる
function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// 単語削除
async function deleteWord(id) {
    if (!confirm('本当にこの単語を削除しますか？')) {
        return;
    }
    
    try {
        const response = await axios.delete(`/api/admin/words/${id}`);
        if (response.data.success) {
            alert('単語を削除しました');
            loadStats();
            loadWords(true);
        } else {
            alert('削除に失敗しました');
        }
    } catch (error) {
        console.error('単語削除エラー:', error);
        alert('削除に失敗しました');
    }
}

// CSVインポート
async function handleImportCSV() {
    const csvData = document.getElementById('csv-input').value.trim();
    
    if (!csvData) {
        alert('CSVデータを入力してください');
        return;
    }
    
    try {
        const response = await axios.post('/api/admin/import-csv', {
            csv_data: csvData
        });
        
        if (response.data.success) {
            const result = `
                <div class="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
                    <p class="font-bold mb-2">インポート完了</p>
                    <p>成功: ${response.data.imported}件</p>
                    <p>エラー: ${response.data.errors}件</p>
                    ${response.data.error_details.length > 0 ? `
                        <details class="mt-2">
                            <summary class="cursor-pointer">エラー詳細</summary>
                            <ul class="mt-2 text-sm">
                                ${response.data.error_details.map(e => `<li>- ${e}</li>`).join('')}
                            </ul>
                        </details>
                    ` : ''}
                </div>
            `;
            document.getElementById('import-result').innerHTML = result;
            document.getElementById('csv-input').value = '';
            loadStats();
            loadWords(true);
        } else {
            document.getElementById('import-result').innerHTML = `
                <div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                    <p>インポートに失敗しました: ${response.data.error}</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('CSVインポートエラー:', error);
        document.getElementById('import-result').innerHTML = `
            <div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                <p>インポートに失敗しました</p>
            </div>
        `;
    }
}

// メッセージ表示
function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    const bgColor = type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800';
    element.innerHTML = `
        <div class="${bgColor} border px-4 py-3 rounded-lg">
            ${message}
        </div>
    `;
    
    setTimeout(() => {
        element.innerHTML = '';
    }, 5000);
}

// グローバル関数として公開（HTMLから呼ばれる）
window.editWord = editWord;
window.deleteWord = deleteWord;
