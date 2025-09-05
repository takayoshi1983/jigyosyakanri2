// 🎉 達成時エフェクト統合ガイド - 7種類拡張版
// 事業者管理アプリに7種類のランダムエフェクトを統合するためのコード

// ==========================================
// 1. CSS スタイル（既存のCSSに追加）
// ==========================================

const ENHANCED_ACHIEVEMENT_EFFECTS_CSS = `
/* エフェクト用のオーバーレイ */
.effect-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 1000;
}

/* === 既存エフェクト === */
/* 1. 紙吹雪エフェクト */
.confetti {
    position: absolute;
    animation: confetti-fall 3s linear forwards;
}

@keyframes confetti-fall {
    0% {
        transform: translateY(-100vh) rotate(0deg);
        opacity: 1;
    }
    100% {
        transform: translateY(100vh) rotate(360deg);
        opacity: 0;
    }
}

/* 2. 神々しい光エフェクト */
.divine-light {
    position: absolute;
    top: -50px;
    left: 50%;
    transform: translateX(-50%);
    width: 200px;
    height: 100vh;
    background: linear-gradient(to bottom, 
        rgba(255, 215, 0, 0.8) 0%, 
        rgba(255, 215, 0, 0.4) 50%, 
        rgba(255, 215, 0, 0) 100%);
    animation: divine-beam 3s ease-in-out forwards;
    filter: blur(2px);
}

@keyframes divine-beam {
    0% {
        opacity: 0;
        transform: translateX(-50%) scaleY(0);
    }
    30% {
        opacity: 1;
        transform: translateX(-50%) scaleY(1);
    }
    100% {
        opacity: 0;
        transform: translateX(-50%) scaleY(1);
    }
}

/* 3. Good!の指エフェクト */
.thumbs-up {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    font-size: 120px;
    animation: thumbs-appear 2.5s ease-out forwards;
}

@keyframes thumbs-appear {
    0% {
        transform: translate(-50%, -50%) scale(0) rotate(-180deg);
        opacity: 0;
    }
    50% {
        transform: translate(-50%, -50%) scale(1.2) rotate(0deg);
        opacity: 1;
    }
    100% {
        transform: translate(-50%, -50%) scale(1) rotate(0deg);
        opacity: 0;
    }
}

/* 4. くす玉+ハトエフェクト */
.kusudama-ball {
    position: absolute;
    top: 20%;
    left: 50%;
    transform: translateX(-50%);
    width: 80px;
    height: 80px;
    background: radial-gradient(circle, #ff69b4, #ff1493);
    border-radius: 50%;
    animation: kusudama-drop 1s ease-in forwards;
}

.kusudama-piece {
    position: absolute;
    animation: kusudama-burst 2s ease-out forwards;
}

.kusudama-dove {
    position: absolute;
    font-size: 25px;
    animation: kusudama-dove-fly 3s ease-out forwards;
}

@keyframes kusudama-drop {
    0% {
        transform: translateX(-50%) translateY(-100px);
    }
    100% {
        transform: translateX(-50%) translateY(0px);
    }
}

@keyframes kusudama-burst {
    0% {
        transform: translate(0, 0) scale(1);
        opacity: 1;
    }
    100% {
        transform: translate(var(--bx), var(--by)) scale(0.3);
        opacity: 0;
    }
}

@keyframes kusudama-dove-fly {
    0% {
        transform: translate(0, 0) scale(0) rotate(0deg);
        opacity: 0;
    }
    20% {
        transform: translate(0, 0) scale(1) rotate(0deg);
        opacity: 1;
    }
    100% {
        transform: translate(var(--dx), var(--dy)) scale(0.8) rotate(var(--rotation));
        opacity: 0;
    }
}

/* === 新しいエフェクト === */
/* 5. 🎵 音符ダンスエフェクト */
.musical-note {
    position: absolute;
    font-size: 30px;
    animation: note-dance 3s ease-in-out forwards;
    transform-origin: center;
}

@keyframes note-dance {
    0% {
        transform: translate(0, 0) scale(0) rotate(0deg);
        opacity: 0;
    }
    15% {
        transform: translate(0, 0) scale(1.2) rotate(0deg);
        opacity: 1;
    }
    25% {
        transform: translate(20px, -30px) scale(1) rotate(15deg);
    }
    50% {
        transform: translate(-15px, -60px) scale(1.1) rotate(-10deg);
    }
    75% {
        transform: translate(25px, -90px) scale(0.9) rotate(20deg);
    }
    100% {
        transform: translate(0, -120px) scale(0.5) rotate(0deg);
        opacity: 0;
    }
}

/* 6. 🎪 サーカス風船エフェクト */
.circus-balloon {
    position: absolute;
    font-size: 35px;
    animation: balloon-rise 4s ease-out forwards;
    transform-origin: center bottom;
}

.balloon-string {
    position: absolute;
    width: 2px;
    background: linear-gradient(to bottom, #333, transparent);
    animation: string-sway 4s ease-in-out forwards;
    transform-origin: top center;
}

@keyframes balloon-rise {
    0% {
        transform: translateY(100vh) scale(0.8);
        opacity: 0;
    }
    10% {
        opacity: 1;
    }
    90% {
        opacity: 1;
    }
    100% {
        transform: translateY(-100px) scale(1.2);
        opacity: 0;
    }
}

@keyframes string-sway {
    0%, 100% {
        transform: rotate(0deg);
    }
    25% {
        transform: rotate(3deg);
    }
    75% {
        transform: rotate(-3deg);
    }
}

/* 7. 🏆 トロフィー授与エフェクト */
.trophy-award {
    position: absolute;
    top: -100px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 80px;
    animation: trophy-descend 3s ease-out forwards;
}

.trophy-glow {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 150px;
    height: 150px;
    background: radial-gradient(circle, rgba(255, 215, 0, 0.3), transparent);
    border-radius: 50%;
    animation: trophy-glow-pulse 2s infinite;
}

@keyframes trophy-descend {
    0% {
        transform: translateX(-50%) translateY(-100px) scale(0.5);
        opacity: 0;
    }
    30% {
        transform: translateX(-50%) translateY(20vh) scale(1.2);
        opacity: 1;
    }
    70% {
        transform: translateX(-50%) translateY(20vh) scale(1);
        opacity: 1;
    }
    100% {
        transform: translateX(-50%) translateY(20vh) scale(0.8);
        opacity: 0;
    }
}

@keyframes trophy-glow-pulse {
    0%, 100% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 0.5;
    }
    50% {
        transform: translate(-50%, -50%) scale(1.5);
        opacity: 0.8;
    }
}

.sparkle {
    position: absolute;
    animation: sparkle 1.5s ease-out forwards;
}

@keyframes sparkle {
    0% {
        transform: scale(0) rotate(0deg);
        opacity: 1;
    }
    50% {
        transform: scale(1) rotate(180deg);
        opacity: 1;
    }
    100% {
        transform: scale(0) rotate(360deg);
        opacity: 0;
    }
}
`;

// ==========================================
// 2. JavaScript エフェクト関数群（拡張版）
// ==========================================

class EnhancedAchievementEffects {
    constructor() {
        this.effectOverlay = null;
        this.initOverlay();
        this.effects = [
            this.triggerConfetti.bind(this),
            this.triggerDivineLight.bind(this),
            this.triggerThumbsUp.bind(this),
            this.triggerKusudama.bind(this),
            this.triggerMusicalNotes.bind(this),      // NEW
            this.triggerCircusBalloons.bind(this),    // NEW
            this.triggerTrophyAward.bind(this)        // NEW
        ];
    }

    // オーバーレイを初期化
    initOverlay() {
        if (!document.getElementById('achievement-effect-overlay')) {
            this.effectOverlay = document.createElement('div');
            this.effectOverlay.id = 'achievement-effect-overlay';
            this.effectOverlay.className = 'effect-overlay';
            document.body.appendChild(this.effectOverlay);
        } else {
            this.effectOverlay = document.getElementById('achievement-effect-overlay');
        }
    }

    // ランダムエフェクトを実行（7種類から）
    triggerRandomEffect() {
        const randomIndex = Math.floor(Math.random() * this.effects.length);
        this.effects[randomIndex]();
        
        console.log(\`🎉 達成エフェクト実行: \${randomIndex + 1}番目のエフェクト\`);
        return randomIndex; // どのエフェクトが実行されたか返す
    }

    // === 既存エフェクト ===
    // 1. 紙吹雪エフェクト
    triggerConfetti() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'];
        
        for (let i = 0; i < 100; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.width = Math.random() * 10 + 5 + 'px';
            confetti.style.height = confetti.style.width;
            confetti.style.animationDelay = Math.random() * 2 + 's';
            confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
            
            this.effectOverlay.appendChild(confetti);
            
            setTimeout(() => {
                if (confetti.parentNode) {
                    confetti.remove();
                }
            }, 5000);
        }
    }

    // 2. 神々しい光エフェクト
    triggerDivineLight() {
        // 光の柱
        for (let i = 0; i < 3; i++) {
            const light = document.createElement('div');
            light.className = 'divine-light';
            light.style.left = (40 + i * 10) + '%';
            light.style.animationDelay = i * 0.3 + 's';
            
            this.effectOverlay.appendChild(light);
            
            setTimeout(() => {
                if (light.parentNode) {
                    light.remove();
                }
            }, 4000);
        }

        // キラキラエフェクト
        for (let i = 0; i < 20; i++) {
            setTimeout(() => {
                const sparkle = document.createElement('div');
                sparkle.className = 'sparkle';
                sparkle.innerHTML = '✨';
                sparkle.style.left = Math.random() * 100 + 'vw';
                sparkle.style.top = Math.random() * 100 + 'vh';
                sparkle.style.fontSize = Math.random() * 20 + 15 + 'px';
                
                this.effectOverlay.appendChild(sparkle);
                
                setTimeout(() => {
                    if (sparkle.parentNode) {
                        sparkle.remove();
                    }
                }, 1500);
            }, i * 100);
        }
    }

    // 3. Good!の指エフェクト
    triggerThumbsUp() {
        const thumbs = document.createElement('div');
        thumbs.className = 'thumbs-up';
        thumbs.innerHTML = '👍';
        
        this.effectOverlay.appendChild(thumbs);
        
        // キラキラエフェクト周囲に追加
        for (let i = 0; i < 15; i++) {
            setTimeout(() => {
                const sparkle = document.createElement('div');
                sparkle.className = 'sparkle';
                sparkle.innerHTML = '✨';
                sparkle.style.left = (45 + Math.random() * 10) + '%';
                sparkle.style.top = (45 + Math.random() * 10) + '%';
                sparkle.style.fontSize = '20px';
                
                this.effectOverlay.appendChild(sparkle);
                
                setTimeout(() => {
                    if (sparkle.parentNode) {
                        sparkle.remove();
                    }
                }, 1500);
            }, i * 150);
        }
        
        setTimeout(() => {
            if (thumbs.parentNode) {
                thumbs.remove();
            }
        }, 2500);
    }

    // 4. くす玉+ハトエフェクト
    triggerKusudama() {
        const ball = document.createElement('div');
        ball.className = 'kusudama-ball';
        this.effectOverlay.appendChild(ball);
        
        setTimeout(() => {
            if (ball.parentNode) {
                ball.remove();
            }
            
            // 破片エフェクト
            const pieces = ['🎀', '🌸', '🎊', '✨', '💖', '🌟', '🎉'];
            
            for (let i = 0; i < 25; i++) {
                const piece = document.createElement('div');
                piece.className = 'kusudama-piece';
                piece.innerHTML = pieces[Math.floor(Math.random() * pieces.length)];
                piece.style.fontSize = Math.random() * 15 + 20 + 'px';
                piece.style.left = '50%';
                piece.style.top = '20%';
                
                const angle = (Math.random() * 2 - 1) * Math.PI;
                const distance = Math.random() * 300 + 100;
                const bx = Math.cos(angle) * distance;
                const by = Math.sin(angle) * distance + Math.random() * 200;
                
                piece.style.setProperty('--bx', bx + 'px');
                piece.style.setProperty('--by', by + 'px');
                
                this.effectOverlay.appendChild(piece);
                
                setTimeout(() => {
                    if (piece.parentNode) {
                        piece.remove();
                    }
                }, 2000);
            }

            // ハトが飛び出すエフェクト
            const doveCount = 4;
            for (let i = 0; i < doveCount; i++) {
                setTimeout(() => {
                    const dove = document.createElement('div');
                    dove.className = 'kusudama-dove';
                    dove.innerHTML = '🕊️';
                    dove.style.left = '50%';
                    dove.style.top = '20%';
                    
                    const flyAngle = (Math.random() * Math.PI) - (Math.PI / 2);
                    const flyDistance = Math.random() * 250 + 150;
                    const dx = Math.cos(flyAngle) * flyDistance;
                    const dy = Math.sin(flyAngle) * flyDistance - Math.random() * 100;
                    const rotation = Math.random() * 60 - 30;
                    
                    dove.style.setProperty('--dx', dx + 'px');
                    dove.style.setProperty('--dy', dy + 'px');
                    dove.style.setProperty('--rotation', rotation + 'deg');
                    
                    this.effectOverlay.appendChild(dove);
                    
                    setTimeout(() => {
                        if (dove.parentNode) {
                            dove.remove();
                        }
                    }, 3000);
                }, i * 200 + 300);
            }
        }, 1000);
    }

    // === NEW エフェクト ===
    // 5. 🎵 音符ダンスエフェクト
    triggerMusicalNotes() {
        const notes = ['🎵', '🎶', '♪', '♫', '🎼'];
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#feca57', '#ff9ff3'];
        
        for (let i = 0; i < 15; i++) {
            setTimeout(() => {
                const note = document.createElement('div');
                note.className = 'musical-note';
                note.innerHTML = notes[Math.floor(Math.random() * notes.length)];
                note.style.left = Math.random() * 80 + 10 + 'vw';
                note.style.top = Math.random() * 50 + 30 + 'vh';
                note.style.color = colors[Math.floor(Math.random() * colors.length)];
                note.style.fontSize = (Math.random() * 20 + 25) + 'px';
                
                this.effectOverlay.appendChild(note);
                
                setTimeout(() => {
                    if (note.parentNode) {
                        note.remove();
                    }
                }, 3000);
            }, i * 200);
        }
    }

    // 6. 🎪 サーカス風船エフェクト
    triggerCircusBalloons() {
        for (let i = 0; i < 8; i++) {
            setTimeout(() => {
                const balloon = document.createElement('div');
                balloon.className = 'circus-balloon';
                balloon.innerHTML = '🎈';
                balloon.style.left = Math.random() * 80 + 10 + 'vw';
                balloon.style.filter = \`hue-rotate(\${Math.random() * 360}deg)\`;
                balloon.style.fontSize = (Math.random() * 15 + 30) + 'px';
                
                // 風船の紐を追加
                const string = document.createElement('div');
                string.className = 'balloon-string';
                string.style.left = '50%';
                string.style.top = '100%';
                string.style.height = Math.random() * 50 + 30 + 'px';
                
                balloon.appendChild(string);
                this.effectOverlay.appendChild(balloon);
                
                setTimeout(() => {
                    if (balloon.parentNode) {
                        balloon.remove();
                    }
                }, 4000);
            }, i * 300);
        }
    }

    // 7. 🏆 トロフィー授与エフェクト
    triggerTrophyAward() {
        // グローエフェクト
        const glow = document.createElement('div');
        glow.className = 'trophy-glow';
        glow.style.top = '20vh';
        this.effectOverlay.appendChild(glow);
        
        // トロフィー
        const trophy = document.createElement('div');
        trophy.className = 'trophy-award';
        trophy.innerHTML = '🏆';
        
        this.effectOverlay.appendChild(trophy);
        
        // キラキラエフェクト
        for (let i = 0; i < 20; i++) {
            setTimeout(() => {
                const sparkle = document.createElement('div');
                sparkle.className = 'sparkle';
                sparkle.innerHTML = '✨';
                sparkle.style.left = (45 + Math.random() * 10) + '%';
                sparkle.style.top = (15 + Math.random() * 10) + '%';
                sparkle.style.fontSize = Math.random() * 15 + 15 + 'px';
                
                this.effectOverlay.appendChild(sparkle);
                
                setTimeout(() => {
                    if (sparkle.parentNode) {
                        sparkle.remove();
                    }
                }, 1500);
            }, i * 150);
        }
        
        setTimeout(() => {
            if (trophy.parentNode) {
                trophy.remove();
            }
            if (glow.parentNode) {
                glow.remove();
            }
        }, 3000);
    }

    // 特定のエフェクトを名前で実行
    triggerSpecificEffect(effectName) {
        const effectMap = {
            'confetti': this.triggerConfetti.bind(this),
            'divine': this.triggerDivineLight.bind(this),
            'thumbs': this.triggerThumbsUp.bind(this),
            'kusudama': this.triggerKusudama.bind(this),
            'musical': this.triggerMusicalNotes.bind(this),
            'balloons': this.triggerCircusBalloons.bind(this),
            'trophy': this.triggerTrophyAward.bind(this)
        };
        
        if (effectMap[effectName]) {
            effectMap[effectName]();
            return true;
        }
        return false;
    }
}

// ==========================================
// 3. 統合方法（7種類対応）
// ==========================================

/*
■ 統合手順:

1. CSS追加:
   - 上記の ENHANCED_ACHIEVEMENT_EFFECTS_CSS を既存のCSSファイルに追加

2. JavaScript初期化:
   - アプリ起動時に EnhancedAchievementEffects インスタンスを作成
   const achievementEffects = new EnhancedAchievementEffects();

3. 既存のエフェクト呼び出し部分を置き換え:
   
   【Before】
   triggerConfettiEffect();
   
   【After】
   achievementEffects.triggerRandomEffect();  // 7種類からランダム

4. 特定のエフェクトを呼び出したい場合:
   achievementEffects.triggerConfetti();           // 紙吹雪
   achievementEffects.triggerDivineLight();        // 神々しい光
   achievementEffects.triggerThumbsUp();           // Good!の指
   achievementEffects.triggerKusudama();           // くす玉+ハト
   achievementEffects.triggerMusicalNotes();       // 音符ダンス  ✨NEW
   achievementEffects.triggerCircusBalloons();     // サーカス風船 ✨NEW
   achievementEffects.triggerTrophyAward();        // トロフィー授与 ✨NEW

5. 名前指定での実行:
   achievementEffects.triggerSpecificEffect('musical');  // 音符ダンス
   achievementEffects.triggerSpecificEffect('balloons'); // サーカス風船
   achievementEffects.triggerSpecificEffect('trophy');   // トロフィー授与

■ 設定追加の提案:
   基本設定に「エフェクト種類」の選択肢を拡張:
   - すべてランダム（デフォルト）
   - 紙吹雪のみ
   - 神々しい光のみ
   - Good!の指のみ
   - くす玉+ハトのみ
   - 音符ダンスのみ      ✨NEW
   - サーカス風船のみ    ✨NEW
   - トロフィー授与のみ  ✨NEW

■ エフェクト特徴:
   🎵 音符ダンス: カラフルな音符がダンスするように舞い踊る
   🎪 サーカス風船: カラフルな風船が紐付きで画面下から上昇
   🏆 トロフィー授与: 金のトロフィーが降りてきて黄金に輝く

■ パフォーマンス考慮:
   - 各エフェクトは3-4秒で完了
   - DOM要素の適切な削除でメモリリーク防止
   - アニメーション終了後の自動クリーンアップ
*/

// ==========================================
// 4. 使用例（7種類対応）
// ==========================================

// インスタンス作成例
// const enhancedEffects = new EnhancedAchievementEffects();

// ランダムエフェクト実行例（7種類から）
// const executedEffect = enhancedEffects.triggerRandomEffect();

// 設定に応じたエフェクト実行例
// function executeAchievementEffect(effectType = 'random') {
//     switch(effectType) {
//         case 'confetti': enhancedEffects.triggerConfetti(); break;
//         case 'divine': enhancedEffects.triggerDivineLight(); break;
//         case 'thumbs': enhancedEffects.triggerThumbsUp(); break;
//         case 'kusudama': enhancedEffects.triggerKusudama(); break;
//         case 'musical': enhancedEffects.triggerMusicalNotes(); break;      // NEW
//         case 'balloons': enhancedEffects.triggerCircusBalloons(); break;   // NEW
//         case 'trophy': enhancedEffects.triggerTrophyAward(); break;        // NEW
//         case 'random':
//         default:
//             enhancedEffects.triggerRandomEffect();
//             break;
//     }
// }

export { EnhancedAchievementEffects, ENHANCED_ACHIEVEMENT_EFFECTS_CSS };