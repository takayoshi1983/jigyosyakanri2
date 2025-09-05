// 🎉 達成時エフェクト統合ガイド
// 事業者管理アプリに6種類のランダムエフェクトを統合するためのコード

// ==========================================
// 1. CSS スタイル（既存のCSSに追加）
// ==========================================

const ACHIEVEMENT_EFFECTS_CSS = `
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

/* 1. 紙吹雪エフェクト（既存） */
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

/* 3. ハトの飛翔エフェクト */
.dove {
    position: absolute;
    font-size: 30px;
    animation: dove-fly 4s ease-out forwards;
}

@keyframes dove-fly {
    0% {
        transform: translate(0, 50vh) rotate(0deg);
        opacity: 1;
    }
    100% {
        transform: translate(200px, -100px) rotate(-15deg);
        opacity: 0;
    }
}

/* 4. Good!の指エフェクト */
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

/* 5. 星の爆発エフェクト */
.star {
    position: absolute;
    top: 50%;
    left: 50%;
    font-size: 24px;
    animation: star-burst 2s ease-out forwards;
}

@keyframes star-burst {
    0% {
        transform: translate(-50%, -50%) scale(0);
        opacity: 1;
    }
    100% {
        transform: translate(-50%, -50%) translate(var(--dx), var(--dy)) scale(0.5);
        opacity: 0;
    }
}

/* 6. くす玉割りエフェクト */
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

/* くす玉から飛び出すハト */
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
// 2. JavaScript エフェクト関数群
// ==========================================

class AchievementEffects {
    constructor() {
        this.effectOverlay = null;
        this.initOverlay();
        this.effects = [
            this.triggerConfetti.bind(this),
            this.triggerDivineLight.bind(this),
            this.triggerDoves.bind(this),
            this.triggerThumbsUp.bind(this),
            this.triggerStarBurst.bind(this),
            this.triggerKusudama.bind(this)
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

    // ランダムエフェクトを実行
    triggerRandomEffect() {
        const randomIndex = Math.floor(Math.random() * this.effects.length);
        this.effects[randomIndex]();
        
        console.log(`🎉 達成エフェクト実行: ${randomIndex + 1}番目のエフェクト`);
    }

    // 1. 紙吹雪エフェクト（既存改良版）
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

    // 3. ハトの飛翔エフェクト
    triggerDoves() {
        const doveCount = 5;
        
        for (let i = 0; i < doveCount; i++) {
            const dove = document.createElement('div');
            dove.className = 'dove';
            dove.innerHTML = '🕊️';
            dove.style.left = Math.random() * 30 + '%';
            dove.style.bottom = Math.random() * 30 + 20 + '%';
            dove.style.animationDelay = i * 0.3 + 's';
            dove.style.animationDuration = (Math.random() * 2 + 3) + 's';
            
            this.effectOverlay.appendChild(dove);
            
            setTimeout(() => {
                if (dove.parentNode) {
                    dove.remove();
                }
            }, 5000);
        }
    }

    // 4. Good!の指エフェクト
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

    // 5. 星の爆発エフェクト
    triggerStarBurst() {
        const starCount = 12;
        
        for (let i = 0; i < starCount; i++) {
            const star = document.createElement('div');
            star.className = 'star';
            star.innerHTML = '⭐';
            
            const angle = (i / starCount) * 2 * Math.PI;
            const distance = 150 + Math.random() * 100;
            const dx = Math.cos(angle) * distance;
            const dy = Math.sin(angle) * distance;
            
            star.style.setProperty('--dx', dx + 'px');
            star.style.setProperty('--dy', dy + 'px');
            
            this.effectOverlay.appendChild(star);
            
            setTimeout(() => {
                if (star.parentNode) {
                    star.remove();
                }
            }, 2000);
        }
    }

    // 6. くす玉割りエフェクト（ハト追加版）
    triggerKusudama() {
        // くす玉のボール
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

            // 🕊️ ハトが飛び出すエフェクト（くす玉から）
            const doveCount = 4;  // くす玉から出るハトの数
            
            for (let i = 0; i < doveCount; i++) {
                setTimeout(() => {
                    const dove = document.createElement('div');
                    dove.className = 'kusudama-dove';
                    dove.innerHTML = '🕊️';
                    dove.style.left = '50%';  // くす玉の位置から開始
                    dove.style.top = '20%';
                    
                    // ランダムな飛行方向を設定
                    const flyAngle = (Math.random() * Math.PI) - (Math.PI / 2); // 上半分の円弧
                    const flyDistance = Math.random() * 250 + 150;
                    const dx = Math.cos(flyAngle) * flyDistance;
                    const dy = Math.sin(flyAngle) * flyDistance - Math.random() * 100; // 上向きに飛ぶ
                    const rotation = Math.random() * 60 - 30; // ±30度の回転
                    
                    dove.style.setProperty('--dx', dx + 'px');
                    dove.style.setProperty('--dy', dy + 'px');
                    dove.style.setProperty('--rotation', rotation + 'deg');
                    
                    this.effectOverlay.appendChild(dove);
                    
                    setTimeout(() => {
                        if (dove.parentNode) {
                            dove.remove();
                        }
                    }, 3000);
                }, i * 200 + 300); // くす玉が割れた後、少しずつハトが出る
            }
        }, 1000);
    }
}

// ==========================================
// 3. 統合方法
// ==========================================

/*
■ 統合手順:

1. CSS追加:
   - 上記の ACHIEVEMENT_EFFECTS_CSS を既存のCSSファイルに追加

2. JavaScript初期化:
   - アプリ起動時に AchievementEffects インスタンスを作成
   const achievementEffects = new AchievementEffects();

3. 既存のエフェクト呼び出し部分を置き換え:
   
   【Before】
   triggerConfettiEffect();
   
   【After】
   achievementEffects.triggerRandomEffect();

4. 特定のエフェクトを呼び出したい場合:
   achievementEffects.triggerConfetti();        // 紙吹雪
   achievementEffects.triggerDivineLight();     // 神々しい光
   achievementEffects.triggerDoves();           // ハトの飛翔
   achievementEffects.triggerThumbsUp();        // Good!の指
   achievementEffects.triggerStarBurst();       // 星の爆発
   achievementEffects.triggerKusudama();        // くす玉割り

■ 現在のコード修正箇所:
   - index-supabase.js 内の達成時エフェクト呼び出し部分
   - 基本設定でのエフェクト有効/無効制御部分
   - CSS ファイル（index-supabase.html内のstyle要素）

■ 設定追加の提案:
   基本設定に「エフェクト種類」の選択肢を追加:
   - すべてランダム（デフォルト）
   - 紙吹雪のみ
   - 神々しい光のみ
   - ハトの飛翔のみ
   - Good!の指のみ
   - 星の爆発のみ
   - くす玉割りのみ
*/

// ==========================================
// 4. 使用例
// ==========================================

// インスタンス作成例
// const achievementEffects = new AchievementEffects();

// ランダムエフェクト実行例
// achievementEffects.triggerRandomEffect();

// 設定に応じたエフェクト実行例
// function executeAchievementEffect(effectType = 'random') {
//     switch(effectType) {
//         case 'confetti': achievementEffects.triggerConfetti(); break;
//         case 'divine': achievementEffects.triggerDivineLight(); break;
//         case 'doves': achievementEffects.triggerDoves(); break;
//         case 'thumbs': achievementEffects.triggerThumbsUp(); break;
//         case 'stars': achievementEffects.triggerStarBurst(); break;
//         case 'kusudama': achievementEffects.triggerKusudama(); break;
//         case 'random':
//         default:
//             achievementEffects.triggerRandomEffect();
//             break;
//     }
// }

export { AchievementEffects, ACHIEVEMENT_EFFECTS_CSS };