// 共通ユーティリティ関数

/**
 * カタカナ・文字の正規化関数（全角半角統一、ひらがなカタカナ統一）
 * @param {string} text - 正規化する文字列
 * @returns {string} 正規化された文字列
 */
export function normalizeText(text) {
    if (!text) return '';

    return text
        .toLowerCase() // 英字を小文字に統一
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
            // 全角英数字を半角に変換
            return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
        })
        .replace(/[ァ-ヶ]/g, function(s) {
            // 全角カタカナを半角カタカナに変換
            const map = {
                'ァ': 'ｱ', 'ア': 'ｱ', 'ィ': 'ｲ', 'イ': 'ｲ', 'ゥ': 'ｳ', 'ウ': 'ｳ', 'ェ': 'ｴ', 'エ': 'ｴ', 'ォ': 'ｵ', 'オ': 'ｵ',
                'カ': 'ｶ', 'ガ': 'ｶﾞ', 'キ': 'ｷ', 'ギ': 'ｷﾞ', 'ク': 'ｸ', 'グ': 'ｸﾞ', 'ケ': 'ｹ', 'ゲ': 'ｹﾞ', 'コ': 'ｺ', 'ゴ': 'ｺﾞ',
                'サ': 'ｻ', 'ザ': 'ｻﾞ', 'シ': 'ｼ', 'ジ': 'ｼﾞ', 'ス': 'ｽ', 'ズ': 'ｽﾞ', 'セ': 'ｾ', 'ゼ': 'ｾﾞ', 'ソ': 'ｿ', 'ゾ': 'ｿﾞ',
                'タ': 'ﾀ', 'ダ': 'ﾀﾞ', 'チ': 'ﾁ', 'ヂ': 'ﾁﾞ', 'ッ': 'ｯ', 'ツ': 'ﾂ', 'ヅ': 'ﾂﾞ', 'テ': 'ﾃ', 'デ': 'ﾃﾞ', 'ト': 'ﾄ', 'ド': 'ﾄﾞ',
                'ナ': 'ﾅ', 'ニ': 'ﾆ', 'ヌ': 'ﾇ', 'ネ': 'ﾈ', 'ノ': 'ﾉ',
                'ハ': 'ﾊ', 'バ': 'ﾊﾞ', 'パ': 'ﾊﾟ', 'ヒ': 'ﾋ', 'ビ': 'ﾋﾞ', 'ピ': 'ﾋﾟ', 'フ': 'ﾌ', 'ブ': 'ﾌﾞ', 'プ': 'ﾌﾟ', 'ヘ': 'ﾍ', 'ベ': 'ﾍﾞ', 'ペ': 'ﾍﾟ', 'ホ': 'ﾎ', 'ボ': 'ﾎﾞ', 'ポ': 'ﾎﾟ',
                'マ': 'ﾏ', 'ミ': 'ﾐ', 'ム': 'ﾑ', 'メ': 'ﾒ', 'モ': 'ﾓ',
                'ャ': 'ｬ', 'ヤ': 'ﾔ', 'ュ': 'ｭ', 'ユ': 'ﾕ', 'ョ': 'ｮ', 'ヨ': 'ﾖ',
                'ラ': 'ﾗ', 'リ': 'ﾘ', 'ル': 'ﾙ', 'レ': 'ﾚ', 'ロ': 'ﾛ',
                'ワ': 'ﾜ', 'ヲ': 'ｦ', 'ン': 'ﾝ',
                'ー': 'ｰ', '・': '･'
            };
            return map[s] || s;
        })
        .replace(/[ひ-ゖー]/g, function(s) {
            // ひらがなを半角カタカナに直接変換（より確実な方法）
            const hiraganaToHankakuKatakana = {
                'あ': 'ｱ', 'い': 'ｲ', 'う': 'ｳ', 'え': 'ｴ', 'お': 'ｵ',
                'か': 'ｶ', 'が': 'ｶﾞ', 'き': 'ｷ', 'ぎ': 'ｷﾞ', 'く': 'ｸ', 'ぐ': 'ｸﾞ', 'け': 'ｹ', 'げ': 'ｹﾞ', 'こ': 'ｺ', 'ご': 'ｺﾞ',
                'さ': 'ｻ', 'ざ': 'ｻﾞ', 'し': 'ｼ', 'じ': 'ｼﾞ', 'す': 'ｽ', 'ず': 'ｽﾞ', 'せ': 'ｾ', 'ぜ': 'ｾﾞ', 'そ': 'ｿ', 'ぞ': 'ｿﾞ',
                'た': 'ﾀ', 'だ': 'ﾀﾞ', 'ち': 'ﾁ', 'ぢ': 'ﾁﾞ', 'っ': 'ｯ', 'つ': 'ﾂ', 'づ': 'ﾂﾞ', 'て': 'ﾃ', 'で': 'ﾃﾞ', 'と': 'ﾄ', 'ど': 'ﾄﾞ',
                'な': 'ﾅ', 'に': 'ﾆ', 'ぬ': 'ﾇ', 'ね': 'ﾈ', 'の': 'ﾉ',
                'は': 'ﾊ', 'ば': 'ﾊﾞ', 'ぱ': 'ﾊﾟ', 'ひ': 'ﾋ', 'び': 'ﾋﾞ', 'ぴ': 'ﾋﾟ', 'ふ': 'ﾌ', 'ぶ': 'ﾌﾞ', 'ぷ': 'ﾌﾟ', 'へ': 'ﾍ', 'べ': 'ﾍﾞ', 'ぺ': 'ﾍﾟ', 'ほ': 'ﾎ', 'ぼ': 'ﾎﾞ', 'ぽ': 'ﾎﾟ',
                'ま': 'ﾏ', 'み': 'ﾐ', 'む': 'ﾑ', 'め': 'ﾒ', 'も': 'ﾓ',
                'ゃ': 'ｬ', 'や': 'ﾔ', 'ゅ': 'ｭ', 'ゆ': 'ﾕ', 'ょ': 'ｮ', 'よ': 'ﾖ',
                'ら': 'ﾗ', 'り': 'ﾘ', 'る': 'ﾙ', 'れ': 'ﾚ', 'ろ': 'ﾛ',
                'ゎ': 'ﾜ', 'わ': 'ﾜ', 'ゐ': 'ｲ', 'ゑ': 'ｴ', 'を': 'ｦ', 'ん': 'ﾝ',
                'ー': 'ｰ'
            };
            return hiraganaToHankakuKatakana[s] || s;
        });
}

/**
 * 日付のフォーマット関数
 * @param {Date|string} date - フォーマットする日付
 * @param {string} format - フォーマット形式 ('YYYY-MM-DD', 'YYYY/MM/DD', 'MM/DD')
 * @returns {string} フォーマットされた日付文字列
 */
export function formatDate(date, format = 'YYYY-MM-DD') {
    if (!date) return '';

    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    switch (format) {
        case 'YYYY/MM/DD':
            return `${year}/${month}/${day}`;
        case 'MM/DD':
            return `${month}/${day}`;
        case 'YYYY-MM-DD':
        default:
            return `${year}-${month}-${day}`;
    }
}

/**
 * 数値のフォーマット関数（カンマ区切り）
 * @param {number} num - フォーマットする数値
 * @returns {string} カンマ区切りの数値文字列
 */
export function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return num.toLocaleString();
}

/**
 * トースト重複防止クラス
 */
class ToastThrottler {
    constructor() {
        this.recentToasts = new Map(); // メッセージ -> 最後の表示時刻
        this.throttleTime = 2000; // 2秒間は同じメッセージを表示しない
    }

    /**
     * トーストを表示（重複チェック付き）
     * @param {string} message - 表示メッセージ
     * @param {string} type - トーストタイプ
     * @param {number} duration - 表示時間
     * @returns {boolean} 実際に表示されたかどうか
     */
    showToast(message, type = 'info', duration) {
        const now = Date.now();
        const key = `${message}-${type}`;

        // 同じメッセージが最近表示されていないかチェック
        const lastShown = this.recentToasts.get(key);
        if (lastShown && (now - lastShown) < this.throttleTime) {
            return false; // 表示を抑制
        }

        // 実際にトーストを表示
        if (window.showToast) {
            window.showToast(message, type, duration);
        }

        // 表示記録を更新
        this.recentToasts.set(key, now);

        // 古い記録をクリーンアップ（メモリリーク防止）
        this.cleanupOldRecords(now);

        return true; // 表示された
    }

    /**
     * 古い記録をクリーンアップ
     * @param {number} now - 現在時刻
     */
    cleanupOldRecords(now) {
        for (const [key, time] of this.recentToasts.entries()) {
            if (now - time > this.throttleTime * 2) {
                this.recentToasts.delete(key);
            }
        }
    }

    /**
     * 検索用の特別なトースト（さらに短い間隔で制御）
     * @param {string} message - 表示メッセージ
     * @param {string} type - トーストタイプ
     * @returns {boolean} 実際に表示されたかどうか
     */
    showSearchToast(message, type = 'info') {
        const now = Date.now();
        const key = `search-${message}-${type}`;

        // 検索用は500ms間隔で制御（より厳しく）
        const lastShown = this.recentToasts.get(key);
        if (lastShown && (now - lastShown) < 500) {
            return false;
        }

        if (window.showToast) {
            window.showToast(message, type, 1000); // 短い表示時間
        }

        this.recentToasts.set(key, now);
        return true;
    }
}

// グローバルインスタンス作成
export const toastThrottler = new ToastThrottler();