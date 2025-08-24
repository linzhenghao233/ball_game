document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const fileInput = document.getElementById('fileInput');
    const startButton = document.getElementById('startButton');
    const maxBallsInput = document.getElementById('maxBallsInput');
    const wordsContainer = document.getElementById('wordsContainer');
    const defsContainer = document.getElementById('defsContainer');
    const matchedCountSpan = document.getElementById('matchedCount');
    const totalCountSpan = document.getElementById('totalCount');
    const scoreSpan = document.getElementById('score');
    const highScoreSpan = document.getElementById('highScore');
    const comboDisplay = document.getElementById('comboDisplay');

    // --- 音频系统：已换回简单的 <audio> 标签方案 ---
    const selectSound = document.getElementById('selectSound');
    const matchSound = document.getElementById('matchSound');
    const errorSound = document.getElementById('errorSound');
    const comboSound = document.getElementById('comboSound');
    const winSound = document.getElementById('winSound');
    let isAudioUnlocked = false;

    // 自适应尺寸的配置
    const RESPONSIVE_SIZES = {
        minPixel: 90,
        maxPixel: 140,
        minVmin: 9,
        maxVmin: 13,
    };

    // Game State
    let masterWordList = [], wordPool = [], selectedWord = null, selectedDef = null;
    let matchedPairs = 0, score = 0, combo = 0, isProcessing = false;
    let highScore = localStorage.getItem('wordGameHighScore') || 0;

    // --- Setup ---
    highScoreSpan.textContent = highScore;
    fileInput.addEventListener('change', handleFileSelect);
    startButton.addEventListener('click', startGame);
    
    // --- 音频辅助函数 ---
    function playSound(sound) {
        if (sound) {
            sound.currentTime = 0;
            sound.play();
        }
    }
    
    function unlockAudio() {
        if (isAudioUnlocked) return;
        console.log("Unlocking audio...");
        const sounds = [selectSound, matchSound, errorSound, comboSound, winSound];
        sounds.forEach(sound => {
            if (sound) {
                sound.play();
                sound.pause();
                sound.currentTime = 0;
            }
        });
        isAudioUnlocked = true;
    }

    // --- File & Game Initialization ---
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            masterWordList = parseTxt(e.target.result);
            if (masterWordList.length > 0) {
                startButton.disabled = false;
                totalCountSpan.textContent = masterWordList.length;
                matchedCountSpan.textContent = 0;
                alert(`${masterWordList.length} 对单词已成功加载!`);
            } else {
                startButton.disabled = true;
                totalCountSpan.textContent = 0;
            }
        };
        reader.readAsText(file);
    }

    function parseTxt(text) {
        const lines = text.split('\n').filter(line => line.trim() !== '' && !line.trim().startsWith('#'));
        const parsedData = [];
        lines.forEach((line, index) => {
            const randomVmin = Math.random() * (RESPONSIVE_SIZES.maxVmin - RESPONSIVE_SIZES.minVmin) + RESPONSIVE_SIZES.minVmin;
            const sizeString = `clamp(${RESPONSIVE_SIZES.minPixel}px, ${randomVmin.toFixed(2)}vmin, ${RESPONSIVE_SIZES.maxPixel}px)`;
            let parts;
            if (line.includes('|')) {
                parts = line.split('|').map(p => p.trim());
                if (parts.length >= 2) parsedData.push({ id: index, word: parts[1], def: parts[0], hint: parts[2] || '', size: sizeString });
            } else {
                parts = line.split(/[\s\t:=]+/).filter(part => part);
                if (parts.length >= 2) parsedData.push({ id: index, word: parts[0].trim(), def: parts.slice(1).join(' ').trim(), hint: '', size: sizeString });
            }
        });
        return parsedData;
    }

    function startGame() {
        unlockAudio(); // 在游戏开始时解锁音频
        score = 0; combo = 0; updateScore(0); matchedPairs = 0;
        selectedWord = null; selectedDef = null; isProcessing = false;
        wordPool = shuffle([...masterWordList]);
        updateProgress();
        wordsContainer.innerHTML = '';
        defsContainer.innerHTML = '';
        refillBalls();
    }

    // --- Core Gameplay Loop ---
    function refillBalls() {
        const maxBalls = parseInt(maxBallsInput.value) || 10;
        const currentBalls = wordsContainer.children.length + defsContainer.children.length;
        const pairsToCreate = (maxBalls - currentBalls) / 2;
        for (let i = 0; i < pairsToCreate; i++) {
            if (wordPool.length > 0) {
                const item = wordPool.pop();
                createSinglePairOfBalls(item);
            }
        }
    }

    function createSinglePairOfBalls(item) {
        const sizeString = item.size;
        const wordBall = document.createElement('div');
        wordBall.className = 'ball word-ball';
        wordBall.dataset.id = item.id;
        wordBall.textContent = item.word;
        wordBall.style.width = sizeString;
        wordBall.style.height = sizeString;
        placeBall(wordBall, wordsContainer, RESPONSIVE_SIZES.maxPixel);
        const defBall = document.createElement('div');
        defBall.className = 'ball def-ball';
        defBall.dataset.id = item.id;
        defBall.textContent = item.def;
        defBall.style.width = sizeString;
        defBall.style.height = sizeString;
        placeBall(defBall, defsContainer, RESPONSIVE_SIZES.maxPixel);
        wordsContainer.appendChild(wordBall);
        defsContainer.appendChild(defBall);
    }

    function placeBall(ball, container, safetySize) {
        const containerRect = container.getBoundingClientRect();
        if (containerRect.width === 0) return;
        const existingBalls = Array.from(container.children).map(child => ({
            left: parseFloat(child.style.left),
            top: parseFloat(child.style.top),
        }));
        let pos, attempts = 0;
        const margin = 10;
        do {
            pos = {
                left: Math.random() * (containerRect.width - safetySize),
                top: Math.random() * (containerRect.height - safetySize)
            };
            attempts++;
        } while (isOverlapping(pos, safetySize, existingBalls, margin) && attempts < 200);
        ball.style.left = `${pos.left}px`;
        ball.style.top = `${pos.top}px`;
        ball.style.animationDelay = `${Math.random() * -10}s`;
        ball.addEventListener('click', handleBallClick);
    }

    function isOverlapping(newPos, newSafetySize, existingBalls, margin) {
        for (const existingBall of existingBalls) {
            const dx = (newPos.left + newSafetySize / 2) - (existingBall.left + newSafetySize / 2);
            const dy = (newPos.top + newSafetySize / 2) - (existingBall.top + newSafetySize / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < newSafetySize + margin) return true;
        }
        return false;
    }

    // --- Event Handling & State Update ---
    function handleBallClick(event) {
        if (isProcessing) return;
        playSound(selectSound);
        const clickedBall = event.currentTarget;
        const id = clickedBall.dataset.id;
        const isWord = clickedBall.classList.contains('word-ball');
        if (isWord) {
            if (selectedWord) selectedWord.element.classList.remove('selected');
            if (selectedWord?.element === clickedBall) {
                selectedWord = null; return;
            }
            selectedWord = { element: clickedBall, id: id };
            clickedBall.classList.add('selected');
        } else {
            if (selectedDef) selectedDef.element.classList.remove('selected');
            if (selectedDef?.element === clickedBall) {
                selectedDef = null; return;
            }
            selectedDef = { element: clickedBall, id: id };
            clickedBall.classList.add('selected');
        }
        checkForMatch();
    }

    function checkForMatch() {
        if (selectedWord && selectedDef) {
            if (selectedWord.id === selectedDef.id) {
                handleMatch(selectedWord.element, selectedDef.element, selectedWord.id);
            } else {
                handleMismatch(selectedWord.element, selectedDef.element);
            }
        }
    }

    function handleMatch(wordEl, defEl, id) {
        isProcessing = true;
        wordEl.classList.add('matched');
        defEl.classList.add('matched');
        combo++;
        const points = 100 * combo;
        updateScore(score + points);
        showCombo(combo);
        playSound(matchSound);
        if (combo > 1) playSound(comboSound);
        matchedPairs++;
        updateProgress();
        const matchedItem = masterWordList.find(item => item.id == id);
        if (matchedItem?.hint) showHint(matchedItem.hint);
        setTimeout(() => {
            wordEl.remove();
            defEl.remove();
            selectedWord = null;
            selectedDef = null;
            isProcessing = false;
            if (matchedPairs === masterWordList.length) {
                playSound(winSound);
                setTimeout(() => alert(`🎉 恭喜你，全部挑战成功！最终得分: ${score}`), 200);
            } else {
                refillBalls();
            }
        }, 500);
    }

    function handleMismatch(wordEl, defEl) {
        playSound(errorSound);
        combo = 0;
        showCombo(0);
        isProcessing = true;
        wordEl.classList.add('shake');
        defEl.classList.add('shake');
        wordEl.classList.remove('selected');
        defEl.classList.remove('selected');
        setTimeout(() => {
            wordEl.classList.remove('shake');
            defEl.classList.remove('shake');
            selectedWord = null;
            selectedDef = null;
            isProcessing = false;
        }, 500);
    }

    function updateScore(newScore) {
        score = newScore;
        scoreSpan.textContent = score;
        if (score > highScore) {
            highScore = score;
            highScoreSpan.textContent = highScore;
            localStorage.setItem('wordGameHighScore', highScore);
        }
    }

    function showCombo(count) {
        if (count > 1) {
            comboDisplay.textContent = `Combo x${count}!`;
            comboDisplay.classList.add('show');
            setTimeout(() => comboDisplay.classList.remove('show'), 500);
        } else {
            comboDisplay.classList.remove('show');
        }
    }

    function updateProgress() {
        matchedCountSpan.textContent = matchedPairs;
        totalCountSpan.textContent = masterWordList.length;
    }

    function showHint(hintText) {
        const toast = document.createElement('div');
        toast.classList.add('hint-toast');
        toast.textContent = `💡 记忆提示: ${hintText}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
});