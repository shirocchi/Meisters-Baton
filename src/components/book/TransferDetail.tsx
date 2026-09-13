export function TransferDetail({ figure, photoFigure }: { figure: string; photoFigure: string }) {
  return (
    <figure className="book-detail-figure">
      <svg
        viewBox="0 0 620 335"
        role="img"
        aria-label="搬送中のクロスを横から見る概念図。Aは支えるフィルム、Bは濡れたクロス。型へ接するのはクロスの面。フィルムを挟んだまま積層する図ではありません。"
      >
        <text x="25" y="32">
          搬送中：支えるものと、積層するもの
        </text>
        <rect x="60" y="72" width="285" height="12" rx="3" fill="#69867d" />
        <path d="M60 69H345" stroke="#283e35" strokeWidth="8" />
        <path d="M180 66V47H370" fill="none" stroke="#415942" />
        <text x="380" y="52">
          B　濡れたクロス
        </text>
        <path d="M180 84V110H370" fill="none" stroke="#415942" />
        <text x="380" y="117">
          A　支持フィルム
        </text>
        <text x="25" y="158" className="detail-small">
          Aで形を支える。AとBを見分けてから、移す動作を分担する。
        </text>
        <path d="M25 181H595" stroke="#bcc8b3" />
        <text x="25" y="211">
          型へ置くとき：型とクロスを接触させる
        </text>
        <path d="M70 240Q195 314 320 240" fill="none" stroke="#b3bda3" strokeWidth="18" />
        <path d="M70 229Q195 303 320 229" fill="none" stroke="#283e35" strokeWidth="6" />
        <path d="M248 273H373" stroke="#415942" />
        <text x="380" y="278">
          Bと型の接触面
        </text>
        <text x="25" y="325" className="detail-small">
          フィルムは製品の層に含めない。外す順序は担当者と確認する。
        </text>
      </svg>
      <figcaption>
        {figure}　面の区別を練習するための概念図。下の{photoFigure}
        で支えている面を探し、乾いた代用品でAとBを指して説明します。この図の上下は説明上の向きです。実際に剥がし始める位置・向きは記録写真だけでは特定できないため、図から決めず作業者と確認します。
      </figcaption>
    </figure>
  );
}
