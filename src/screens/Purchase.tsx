import { useMemo, useState } from 'react';
import { ProductCard } from '../components/ProductCard';
import { Button, Modal, Notice } from '../components/ui';
import { backend } from '../lib/backend';
import { useSlowFlag } from '../lib/useSession';
import {
  AppError,
  type Pass,
  type Product,
  type PublicSession,
  type SubmitResult,
} from '../lib/types';
import {
  REVIEW_MAX_CHARS,
  checkChoices,
  checkReview,
  parentSelectionHint,
  reviewCharCount,
} from '../lib/validation';

export function PurchaseScreen({
  session,
  pass,
  onDone,
  onPassInvalid,
}: {
  session: PublicSession;
  pass: Pass;
  onDone: (receipt: SubmitResult) => void;
  onPassInvalid: () => void;
}) {
  const isParent = pass.participantType === 'parent';
  const maxPicks = isParent ? 2 : 1;

  const [picked, setPicked] = useState<string[]>([]);
  const [review, setReview] = useState('');
  const [touchedReview, setTouchedReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const slow = useSlowFlag(busy);

  const products = session.products;
  const pickedProducts = useMemo(
    () =>
      picked
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p)),
    [picked, products],
  );

  const reviewCheck = checkReview(review);
  const choiceCheck = checkChoices(pass.participantType, picked);
  const canSubmit = reviewCheck.ok && choiceCheck.ok && !busy;

  function toggle(id: string) {
    setError(null);
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= maxPicks) {
        if (isParent) {
          setError(
            '여행권은 2장이에요. 바꾸고 싶다면 고른 상품을 먼저 취소해 주세요.',
          );
          return prev;
        }
        // 학생은 하나만 고를 수 있으므로 선택을 바꿔 준다
        return [id];
      }
      return [...prev, id];
    });
  }

  async function doSubmit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const receipt = await backend().submitPurchase(
        pass.token,
        picked,
        reviewCheck.value,
      );
      setConfirming(false);
      onDone(receipt);
    } catch (err) {
      setConfirming(false);
      if (err instanceof AppError) {
        setError(err.message);
        if (err.code === 'invalid_pass') onPassInvalid();
      } else {
        setError('제출하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <h2>{isParent ? '학부모 고객님, 어서 오세요!' : '어떤 여행을 떠나 볼까요?'}</h2>
        <p className="lead" style={{ marginBottom: 10 }}>
          {isParent
            ? '서로 다른 여행 상품 2개를 골라 주세요.'
            : '가장 사고 싶은 여행 상품 1개를 골라 주세요.'}
        </p>
        {isParent ? (
          <Notice kind="info">
            학부모 고객님께는 서로 다른 여행 상품을 고를 수 있는 여행권 2장이
            제공됩니다.
          </Notice>
        ) : (
          <Notice kind="info">
            학생 고객님께는 여행권 1장이 제공됩니다. 상품 1개를 골라 주세요.
          </Notice>
        )}
      </div>

      <div className="product-grid">
        {products.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            selected={picked.includes(p.id)}
            onToggle={toggle}
            disabled={busy}
          />
        ))}
      </div>

      <div className="card">
        <div className="section-title">기대평 쓰기</div>
        <div className="field" style={{ marginBottom: 6 }}>
          <label htmlFor="review">
            {isParent
              ? '고른 두 상품에 대한 기대평을 한 개만 써 주세요.'
              : '고른 상품에 대한 기대평을 써 주세요.'}
          </label>
          <textarea
            id="review"
            className="textarea"
            value={review}
            onChange={(e) => setReview(e.target.value)}
            onBlur={() => setTouchedReview(true)}
            maxLength={REVIEW_MAX_CHARS + 20}
            placeholder={`예) 발표가 재미있어서 꼭 가 보고 싶어요!
예) 지형과 기후 설명이 이해하기 쉬웠어요!
예) 여행 코스가 알차고 흥미로웠어요!`}
            aria-invalid={touchedReview && !reviewCheck.ok ? true : undefined}
            aria-describedby="review-help"
          />
          <div
            className={`counter ${review.length > REVIEW_MAX_CHARS ? 'over' : ''}`}
            id="review-help"
          >
            {review.length} / {REVIEW_MAX_CHARS}자 (공백 빼고 2자 이상, 지금{' '}
            {reviewCharCount(review)}자)
          </div>
        </div>
        {touchedReview && !reviewCheck.ok && (
          <Notice kind="error">{reviewCheck.message}</Notice>
        )}
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <div className="sticky-bar">
        <div className="sticky-inner">
          <div className="selection-status">
            <span className="dots" aria-hidden="true">
              {Array.from({ length: maxPicks }, (_, i) => (
                <i key={i} className={i < picked.length ? 'on' : ''} />
              ))}
            </span>
            <span>
              {isParent
                ? parentSelectionHint(picked.length)
                : picked.length === 1
                  ? `${pickedProducts[0]?.groupNo}모둠 · ${pickedProducts[0]?.countryName} 선택함`
                  : '여행 상품 1개를 골라주세요'}
            </span>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setTouchedReview(true);
              if (!choiceCheck.ok) {
                setError(choiceCheck.message!);
                return;
              }
              if (!reviewCheck.ok) {
                setError(reviewCheck.message!);
                return;
              }
              setError(null);
              setConfirming(true);
            }}
            disabled={!canSubmit}
            loading={busy}
          >
            {busy ? '구매하는 중…' : '이 상품 구매하기'}
          </Button>
          {!canSubmit && !busy && (
            <p className="hint" style={{ margin: 0, fontSize: '0.8rem' }}>
              {!choiceCheck.ok
                ? choiceCheck.message
                : '기대평을 쓰면 구매 버튼이 켜져요.'}
            </p>
          )}
        </div>
      </div>

      {confirming && (
        <Modal
          title="이대로 구매할까요?"
          onClose={() => !busy && setConfirming(false)}
          actions={
            <>
              <Button
                variant="quiet"
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                다시 고를래요
              </Button>
              <Button variant="primary" onClick={doSubmit} loading={busy}>
                구매 확정
              </Button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>고른 여행 상품이에요.</p>
          <ul>
            {pickedProducts.map((p) => (
              <li key={p.id}>
                <b>
                  {p.groupNo}모둠 · {p.countryName}
                </b>
              </li>
            ))}
          </ul>
          <p style={{ marginBottom: 4 }}>내가 쓴 기대평</p>
          <p
            style={{
              background: '#f6f9fc',
              border: '1px solid #dfe5ec',
              borderRadius: 10,
              padding: '8px 10px',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {reviewCheck.value}
          </p>
          <p style={{ fontSize: '0.85rem', color: '#5a6b7d', marginBottom: 0 }}>
            구매를 확정하면 다시 고치거나 또 구매할 수 없어요.
          </p>
          {slow && (
            <Notice kind="info">조금 오래 걸리고 있어요. 잠시만요…</Notice>
          )}
        </Modal>
      )}
    </div>
  );
}
