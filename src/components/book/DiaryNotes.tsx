import { diarySourceUrl, type DiaryNote } from '../../domain/bookDiaryNotes';
export function DiaryNotes({ notes }: { notes: DiaryNote[] }) {
  return (
    <section className="book-diary" aria-label="ペラ日記からの付箋">
      <h2>
        ペラ日記からの付箋 <small>{notes.length}件</small>
      </h2>
      <p className="book-diary-intro">
        製作中の失敗や気づきを、確認事項として整理しました。現行手順としては未確認です。付箋を開くと、日記の出来事と確認点を読めます。
      </p>
      <div className="book-diary-grid">
        {notes.map((note) => (
          <details className="book-diary-card" key={note.id}>
            <summary>
              <span className="book-diary-tag">{note.tag}</span>
              <strong>{note.title}</strong>
            </summary>
            <div className="book-diary-body">
              <p className="book-diary-label">日記の出来事</p>
              <p>{note.observation}</p>
              <p className="book-diary-label">作業前・作業後の確認（編集メモ）</p>
              <p>{note.action}</p>
              <p className="book-diary-source">
                作業日：{note.date}
                <br />
                投稿日：{note.postedAt} · ペラ日記
              </p>
              <a href={diarySourceUrl(note)} target="_blank" rel="noreferrer">
                Discordの原文を見る
              </a>
            </div>
          </details>
        ))}
      </div>
      <p className="book-diary-access">
        原文リンクの閲覧には、元のDiscordサーバーへの参加権限が必要です。
      </p>
    </section>
  );
}
