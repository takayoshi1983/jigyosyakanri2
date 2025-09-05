document.addEventListener('DOMContentLoaded', () => {
    const godLightBtn = document.getElementById('god-light-btn');
    const goodPopupBtn = document.getElementById('good-popup-btn');

    // 「神々しい光」エフェクトを再生
    godLightBtn.addEventListener('click', () => {
        playGodLightEffect();
    });

    // 「"Good" ポップアップ」エフェクトを再生
    goodPopupBtn.addEventListener('click', () => {
        playGoodPopupEffect();
    });

    function playGodLightEffect() {
        // 既存のエフェクト要素があれば削除
        const existingEffect = document.querySelector('.god-light-overlay');
        if (existingEffect) {
            existingEffect.remove();
        }

        const effect = document.createElement('div');
        effect.classList.add('god-light-overlay');
        document.body.appendChild(effect);

        // アニメーション終了後に要素を削除
        effect.addEventListener('animationend', () => {
            effect.remove();
        });
    }

    function playGoodPopupEffect() {
        const existingEffect = document.querySelector('.good-popup-text');
        if (existingEffect) {
            existingEffect.remove();
        }

        const effect = document.createElement('div');
        effect.classList.add('good-popup-text');
        effect.textContent = 'Good!';
        document.body.appendChild(effect);

        effect.addEventListener('animationend', () => {
            effect.remove();
        });
    }
});
