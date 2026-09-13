export function CoreDetail({ figure }: { figure: string }) {
  return (
    <figure className="book-detail-figure">
      <svg
        viewBox="0 0 620 310"
        role="img"
        aria-label="コアの継ぎ目の断面。並ぶ状態と、乗り上げて段差を生む状態を比較し、前縁のコアを薄くする位置を示す概念図。"
      >
        <text x="25" y="28">
          継ぎ目を横から見る
        </text>
        <text x="25" y="61" className="detail-small">
          端が並ぶ
        </text>
        <path d="M25 112H275" stroke="#42544a" strokeWidth="6" />
        <path d="M25 105H144V85H25ZM149 105H275V85H149Z" fill="#d5b98a" stroke="#8b7750" />
        <path d="M145 74V42" stroke="#55734f" />
        <text x="156" y="54" className="detail-small">
          継ぎ目
        </text>
        <text x="335" y="61" className="detail-small">
          片方が乗り上げる
        </text>
        <path d="M335 112H590" stroke="#42544a" strokeWidth="6" />
        <path d="M335 105H480V85H335ZM455 82H590V62H455Z" fill="#d5b98a" stroke="#8b7750" />
        <path d="M455 119V140H481V119" fill="none" stroke="#ad6f33" />
        <text x="421" y="165" className="detail-small">
          重なりで段差ができる
        </text>
        <path d="M25 186H590" stroke="#c4cbb9" />
        <text x="25" y="216">
          前縁の重ね代を見る
        </text>
        <path d="M40 273H580" stroke="#42544a" strokeWidth="6" />
        <path d="M95 266L245 244H575V266Z" fill="#d5b98a" stroke="#8b7750" />
        <path d="M65 264L245 237H575" fill="none" stroke="#42544a" strokeWidth="5" />
        <path d="M96 244L61 232" stroke="#58774e" />
        <text x="30" y="300" className="detail-small">
          端へ向かってコアを薄くする位置関係
        </text>
      </svg>
      <figcaption>
        {figure}　
        継ぎ目と前縁の概念図。上の比較は2025年10月22日の重なりの失敗を読み解く補助です。隙間の許容値・テーパーの長さや角度を示す製作図ではありません。
      </figcaption>
    </figure>
  );
}
