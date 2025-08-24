document.addEventListener('DOMContentLoaded', () => {
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

    const SIZE_PROFILES = {
        desktop: { minPixel: 90, maxPixel: 140, minVmin: 9, maxVmin: 13 },
        mobile: { minPixel: 60, maxPixel: 95, minVmin: 12, maxVmin: 16 }
    };

    const AudioManager = {
        audioContext: null, soundBuffers: {}, isLoaded: false,
        init() { try { this.audioContext = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { console.error("Web Audio API is not supported in this browser"); } },
        async loadSound(name, url) { if (!this.audioContext || this.soundBuffers[name]) return; try { const response = await fetch(url); const arrayBuffer = await response.arrayBuffer(); const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer); this.soundBuffers[name] = audioBuffer; } catch (e) { console.error(`Failed to load sound: ${name}`, e); } },
        async loadAll() { if (this.isLoaded || !this.audioContext) return; await Promise.all([ this.loadSound('select', 'audio/select.mp3'), this.loadSound('match', 'audio/match.mp3'), this.loadSound('error', 'audio/error.mp3'), this.loadSound('combo', 'audio/combo.mp3'), this.loadSound('win', 'audio/win.mp3') ]); this.isLoaded = true; console.log("All sounds loaded."); },
        play(name) { if (!this.audioContext || !this.soundBuffers[name]) return; if (this.audioContext.state === 'suspended') { this.audioContext.resume(); } const source = this.audioContext.createBufferSource(); source.buffer = this.soundBuffers[name]; source.connect(this.audioContext.destination); source.start(0); }
    };

    let masterWordList = [], wordPool = [], selectedWord = null, selectedDef = null;
    let matchedPairs = 0, score = 0, combo = 0, isProcessing = false;
    let highScore = localStorage.getItem('wordGameHighScore') || 0;

    highScoreSpan.textContent = highScore;
    fileInput.addEventListener('change', handleFileSelect);
    startButton.addEventListener('click', startGame);

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
        const activeSizes = window.innerWidth < 500 ? SIZE_PROFILES.mobile : SIZE_PROFILES.desktop;
        const lines = text.split('\n').filter(line => line.trim() !== '' && !line.trim().startsWith('#'));
        const parsedData = [];
        lines.forEach((line, index) => {
            const randomVmin = Math.random() * (activeSizes.maxVmin - activeSizes.minVmin) + activeSizes.minVmin;
            const sizeString = `clamp(${activeSizes.minPixel}px, ${randomVmin.toFixed(2)}vmin, ${activeSizes.maxPixel}px)`;
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

    async function startGame() {
        if (!AudioManager.audioContext) {
            AudioManager.init();
            await AudioManager.loadAll();
        }
        score = 0; combo = 0; updateScore(0); matchedPairs = 0;
        selectedWord = null; selectedDef = null; isProcessing = false;
        wordPool = shuffle([...masterWordList]);
        updateProgress();
        wordsContainer.innerHTML = '';
        defsContainer.innerHTML = '';
        refillBalls();
    }

    function refillBalls() {
        const maxBalls = parseInt(maxBallsInput.value) || 10;
        const currentBalls = wordsContainer.children.length + defsContainer.children.length;
        const pairsToCreate = (maxBalls - currentBalls) / 2;

        for (let i = 0; i < pairsToCreate; i++) {
            if (wordPool.length > 0) {
                const item = wordPool.pop();
                const success = createSinglePairOfBalls(item);
                if (!success) {
                    wordPool.push(item);
                    console.warn("Screen is full. Stopped adding new balls.");
                    break;
                }
            }
        }
        
        const finalBallCount = wordsContainer.children.length + defsContainer.children.length;
        maxBallsInput.value = finalBallCount;
    }

    function createSinglePairOfBalls(item) {
        const sizeString = item.size;
        const activeSizes = window.innerWidth < 500 ? SIZE_PROFILES.mobile : SIZE_PROFILES.desktop;
        
        const wordBall = document.createElement('div');
        wordBall.className = 'ball word-ball';
        wordBall.dataset.id = item.id;
        wordBall.textContent = item.word;
        wordBall.style.width = sizeString;
        wordBall.style.height = sizeString;
        
        const defBall = document.createElement('div');
        defBall.className = 'ball def-ball';
        defBall.dataset.id = item.id;
        defBall.textContent = item.def;
        defBall.style.width = sizeString;
        defBall.style.height = sizeString;

        const wordPosSuccess = placeBall(wordBall, wordsContainer, activeSizes.maxPixel);
        if (!wordPosSuccess) return false;
        
        const defPosSuccess = placeBall(defBall, defsContainer, activeSizes.maxPixel);
        if (!defPosSuccess) return false;

        wordsContainer.appendChild(wordBall);
        defsContainer.appendChild(defBall);
        return true;
    }

    function placeBall(ball, container, safetySize) {
        const containerRect = container.getBoundingClientRect();
        if (containerRect.width < safetySize || containerRect.height < safetySize) return false;

        const existingBalls = Array.from(container.children).map(child => ({
            left: parseFloat(child.style.left),
            top: parseFloat(child.style.top),
        }));
        
        let pos, attempts = 0;
        const maxAttempts = 200;
        const margin = 5;

        do {
            pos = {
                left: Math.random() * (containerRect.width - safetySize),
                top: Math.random() * (containerRect.height - safetySize)
            };
            attempts++;
            if (attempts >= maxAttempts) return false;
        } while (isOverlapping(pos, safetySize, existingBalls, margin));

        ball.style.left = `${pos.left}px`;
        ball.style.top = `${pos.top}px`;
        ball.style.animationDelay = `${Math.random() * -10}s`;
        ball.addEventListener('click', handleBallClick);
        return true;
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

    function handleBallClick(event) {
        if (isProcessing) return;
        AudioManager.play('select');
        const clickedBall = event.currentTarget;
        const id = clickedBall.dataset.id;
        const isWord = clickedBall.classList.contains('word-ball');
        if (isWord) {
            if (selectedWord) selectedWord.element.classList.remove('selected');
            if (selectedWord?.element === clickedBall) { selectedWord = null; return; }
            selectedWord = { element: clickedBall, id: id };
            clickedBall.classList.add('selected');
        } else {
            if (selectedDef) selectedDef.element.classList.remove('selected');
            if (selectedDef?.element === clickedBall) { selectedDef = null; return; }
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
        AudioManager.play('match');
        if (combo > 1) AudioManager.play('combo');
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
                AudioManager.play('win');
                setTimeout(() => alert(`🎉 恭喜你，全部挑战成功！最终得分: ${score}`), 200);
            } else {
                refillBalls();
            }
        }, 500);
    }

    function handleMismatch(wordEl, defEl) {
        AudioManager.play('error');
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
