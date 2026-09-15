import { useMemo } from 'react';
import { SCOPE_LABEL } from '../lib/ranking';
import type { PublicResults } from '../lib/types';
import { Notice, Tag } from './ui';

const CONFETTI_COLORS = ['#ffb43a', '#2f6fb5', '#0e7a6b', '#b5335a', '#7a5cd0'];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        left: `${(i * 6.3 + 3) % 97}%`,
        delay: `${(i % 8) * 0.13}s`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [],
  );
  return (
    <span className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: p.left,
            background: p.color,
            animationDelay: p.delay,
          }}
        />
      ))}
    </span>
  );
}

export function ResultsView({
  results,
  preview = false,
}: {
  results: PublicResults;
  preview?: boolean;
}) {
  const { revealed, reviews } = results;
  const maxSold = revealed.reduce((m, r) => Math.max(m, r.sold), 0);
  const winners = revealed.filter((r) => r.rank === 1);

  if (results.empty || revealed.length === 0) {
    return (
      <div className="stack">
        <div className="card center-text">
          <h2>아직 집계된 여행권이 없습니다.</h2>
          <p className="lead" style={{ marginBottom: 0 }}>
            구매된 여행권이 없어 순위를 만들지 않았어요.
          </p>
        </div>
        <p className="closing-line">
          멋진 여행 상품을 준비한 다섯 여행사 모두에게 큰 박수를 보냅니다!
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="result-hero">
        {!preview && <Confetti />}
        <h2>오늘 가장 사랑받은 여행 상품</h2>
        {winners.map((w) => (
          <p className="winner" key={w.productId}>
            {w.groupNo}모둠 · {w.countryName}
          </p>
        ))}
        <p className="sub">
          {winners.length > 1 && '공동 1위 · '}
          판매된 여행권 {winners[0]?.sold ?? 0}장 · 전체 발행 여행권 중{' '}
          {winners[0]?.sharePercent ?? 0}%
        </p>
        <p style={{ marginTop: 12, marginBottom: 0 }}>
          <span className="stamp stamp-lg">SOLD OUT · 전석 매진</span>
        </p>
      </section>

      <div className="card">
        <div className="section-title">판매 결과 ({SCOPE_LABEL[results.revealScope]})</div>
        <div className={`rank-list ${revealed.length === 1 ? 'single' : ''}`}>
          {revealed.map((r) => (
            <article
              key={r.productId}
              className={`rank-card ${r.rank === 1 ? 'is-top' : ''}`}
            >
              <div className="rank-head">
                <span className="rank-no">
                  {r.tied ? '공동 ' : ''}
                  {r.rank}위
                </span>
                <div>
                  <p className="rank-country">
                    {r.groupNo}모둠 · {r.countryName}
                  </p>
                  <span className="rank-meta">
                    판매된 여행권 {r.sold}장 · 전체 {r.sharePercent}%
                  </span>
                </div>
              </div>
              <div
                className="bar-track"
                role="img"
                aria-label={`${r.countryName} 판매된 여행권 ${r.sold}장, 전체의 ${r.sharePercent}퍼센트`}
              >
                <div
                  className="bar-fill"
                  style={{
                    width: `${maxSold > 0 ? Math.max(3, (r.sold / maxSold) * 100) : 3}%`,
                    background: r.themeColor,
                  }}
                />
              </div>
              <div className="bar-legend">
                <span>여행권 {r.sold}장</span>
                <span>{r.sharePercent}%</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-title">고객 기대평</div>
        {reviews.length === 0 ? (
          <Notice kind="info">
            공개 범위 안에서 보여 드릴 수 있는 기대평이 아직 없어요.
          </Notice>
        ) : (
          <div className="review-list">
            {reviews.map((r) => (
              <div
                key={r.id}
                className={`review ${r.participantType === 'parent' ? 'parent' : ''}`}
              >
                <div className="tag-row">
                  <span className="badge badge-soft">
                    {r.participantType === 'parent' ? '학부모 고객' : '학생 고객'}
                  </span>
                  {r.countryTags.map((t) => (
                    <Tag key={`${r.id}-${t.groupNo}`}>
                      {t.groupNo}모둠 · {t.countryName}
                    </Tag>
                  ))}
                </div>
                {/* 기대평은 반드시 일반 텍스트로만 렌더링한다 */}
                <p>{r.review}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">오늘의 특가전 기록</div>
        <div className="stat-grid">
          <div className="stat">
            <div className="k">전체 참여 고객</div>
            <div className="v">
              {results.totalParticipants}
              <small> 명</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">학생 고객</div>
            <div className="v">
              {results.studentParticipants}
              <small> 명</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">학부모 고객</div>
            <div className="v">
              {results.parentParticipants}
              <small> 명</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">발행된 여행권</div>
            <div className="v">
              {results.issuedTickets}
              <small> 장</small>
            </div>
          </div>
        </div>
        {results.hiddenCount > 0 && (
          <p className="rank-meta" style={{ marginTop: 10 }}>
            이번에는 {results.hiddenCount}개 상품의 결과를 공개하지 않았어요.
          </p>
        )}
      </div>

      <p className="closing-line">
        멋진 여행 상품을 준비한 다섯 여행사 모두에게 큰 박수를 보냅니다!
      </p>
    </div>
  );
}
