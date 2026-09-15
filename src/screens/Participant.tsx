import { useCallback, useEffect, useState } from 'react';
import { ResultsView } from '../components/ResultsView';
import {
  Button,
  DemoBanner,
  Disclaimer,
  FlightBoard,
  Header,
  Loading,
  Notice,
} from '../components/ui';
import { backend } from '../lib/backend';
import { DEMO_NOTICE, IS_DEMO } from '../lib/config';
import { readJson, removeLocal, writeJson } from '../lib/storage';
import {
  AppError,
  type Pass,
  type PublicResults,
  type PublicSession,
  type SubmitResult,
} from '../lib/types';
import { useSession } from '../lib/useSession';
import { EntryScreen } from './Entry';
import { PurchaseScreen } from './Purchase';

const KEY_SUFFIX = IS_DEMO ? 'demo' : 'live';
const PASS_KEY = `dolmeng.pass.${KEY_SUFFIX}.v1`;
const RECEIPT_KEY = `dolmeng.receipt.${KEY_SUFFIX}.v1`;

export function ParticipantApp() {
  const { session, error, loading, reload } = useSession();
  const [pass, setPass] = useState<Pass | null>(() =>
    readJson<Pass | null>(PASS_KEY, null),
  );
  const [receipt, setReceipt] = useState<SubmitResult | null>(() =>
    readJson<SubmitResult | null>(RECEIPT_KEY, null),
  );

  const savePass = useCallback((p: Pass) => {
    writeJson(PASS_KEY, p);
    setPass(p);
  }, []);

  const saveReceipt = useCallback((r: SubmitResult) => {
    writeJson(RECEIPT_KEY, r);
    setReceipt(r);
  }, []);

  const clearAll = useCallback(() => {
    removeLocal(PASS_KEY);
    removeLocal(RECEIPT_KEY);
    setPass(null);
    setReceipt(null);
  }, []);

  return (
    <div className="page">
      <Header phase={session?.phase}>
        {session && (
          <FlightBoard live={session.phase === 'open'}>
            {phaseBoardText(session.phase)}
          </FlightBoard>
        )}
      </Header>

      <DemoBanner notice={DEMO_NOTICE} />

      <main className="main">
        <div className={`wrap stack ${session?.phase === 'revealed' ? 'wrap-result' : ''}`}>
          {error && (
            <Notice kind="error">
              {error}{' '}
              <button
                type="button"
                className="btn btn-inline btn-quiet"
                onClick={() => void reload()}
                style={{ marginLeft: 6 }}
              >
                다시 시도
              </button>
            </Notice>
          )}

          {loading && !session ? (
            <Loading />
          ) : !session ? (
            <Notice kind="error">
              수업 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.
            </Notice>
          ) : (
            <Body
              session={session}
              pass={pass}
              receipt={receipt}
              onPass={savePass}
              onReceipt={saveReceipt}
              onReset={clearAll}
            />
          )}
        </div>
      </main>

      <Disclaimer />
    </div>
  );
}

function phaseBoardText(phase: PublicSession['phase']): string {
  switch (phase) {
    case 'waiting':
      return '탑승 수속 준비 중 · 곧 판매를 시작합니다';
    case 'open':
      return '지금 구매할 수 있어요';
    case 'closed':
      return '판매 마감 · 결과 집계 중';
    case 'revealed':
      return '판매 결과 발표';
  }
}

function Body({
  session,
  pass,
  receipt,
  onPass,
  onReceipt,
  onReset,
}: {
  session: PublicSession;
  pass: Pass | null;
  receipt: SubmitResult | null;
  onPass: (p: Pass) => void;
  onReceipt: (r: SubmitResult) => void;
  onReset: () => void;
}) {
  // 결과가 공개되면 참여 여부와 상관없이 결과 화면으로 전환된다
  if (session.phase === 'revealed') {
    return <ResultsScreen session={session} receipt={receipt} onReset={onReset} />;
  }

  if (!pass) {
    return (
      <>
        <EntryScreen onPass={onPass} />
        {session.phase === 'closed' && (
          <Notice kind="warn">
            구매가 마감되었습니다. 곧 결과를 공개합니다.
          </Notice>
        )}
      </>
    );
  }

  if (receipt) {
    return <TicketScreen session={session} receipt={receipt} onReset={onReset} />;
  }

  if (session.phase === 'waiting') {
    return <WaitingScreen pass={pass} />;
  }

  if (session.phase === 'closed') {
    return (
      <div className="card center-text">
        <h2>구매가 마감되었습니다.</h2>
        <p className="lead" style={{ marginBottom: 0 }}>
          곧 결과를 공개합니다. 화면을 그대로 두고 기다려 주세요.
        </p>
      </div>
    );
  }

  return (
    <PurchaseScreen
      session={session}
      pass={pass}
      onDone={onReceipt}
      onPassInvalid={onReset}
    />
  );
}

function WaitingScreen({ pass }: { pass: Pass }) {
  return (
    <div className="stack">
      <div className="card center-text">
        <p style={{ fontSize: '2.2rem', margin: 0 }} aria-hidden="true">
          🛫
        </p>
        <h2>여행 상품 발표를 모두 들은 뒤 구매가 시작됩니다.</h2>
        <p className="lead" style={{ marginBottom: 0 }}>
          {pass.displayName ? `${pass.displayName} 고객님, ` : ''}입장이
          끝났어요. 구매가 시작되면 이 화면이 저절로 바뀌어요.
        </p>
      </div>
      <Notice kind="info">
        새로고침하지 않아도 괜찮아요. 화면을 그대로 두고 기다려 주세요.
      </Notice>
    </div>
  );
}

function TicketScreen({
  session,
  receipt,
  onReset,
}: {
  session: PublicSession;
  receipt: SubmitResult;
  onReset: () => void;
}) {
  const picked = receipt.productIds
    .map((id) => session.products.find((p) => p.id === id))
    .filter(Boolean);

  return (
    <div className="stack">
      <div className="ticket">
        <div className="ticket-top">
          <span className="ticket-title">BOARDING PASS · 탑승권</span>
          <span className="badge badge-ok">구매 완료</span>
        </div>
        <div className="ticket-body">
          <div className="ticket-row">
            <span className="k">고객 구분</span>
            <span className="v">
              {receipt.participantType === 'parent' ? '학부모 고객' : '학생 고객'}
            </span>
          </div>
          {picked.map((p) => (
            <div className="ticket-row" key={p!.id}>
              <span className="k">여행지</span>
              <span className="v">
                {p!.groupNo}모둠 · {p!.countryName}
              </span>
            </div>
          ))}
          <div className="ticket-row">
            <span className="k">여행권</span>
            <span className="v">{receipt.productIds.length}장</span>
          </div>
          <div className="ticket-row">
            <span className="k">기대평</span>
            <span className="v" style={{ fontWeight: 600 }}>
              {receipt.review}
            </span>
          </div>
          <div style={{ textAlign: 'center', paddingTop: 4 }}>
            <span className="stamp">구매 확정</span>
          </div>
        </div>
        <div className="perforation" />
        <div className="barcode" aria-hidden="true" />
      </div>

      <Notice kind="ok">
        구매가 완료되었어요. 다시 고치거나 또 구매할 수는 없어요.
      </Notice>

      {session.phase !== 'revealed' && (
        <div className="card center-text">
          <p style={{ margin: 0 }}>
            {session.phase === 'closed'
              ? '구매가 마감되었습니다. 곧 결과를 공개합니다.'
              : '다른 친구들이 구매를 마칠 때까지 기다려 주세요.'}
          </p>
          <p className="rank-meta" style={{ margin: '6px 0 0' }}>
            결과가 공개되면 이 화면이 저절로 바뀌어요.
          </p>
        </div>
      )}

      {IS_DEMO && (
        <Button variant="quiet" onClick={onReset}>
          (DEMO) 이 브라우저의 체험 기록 지우고 처음부터
        </Button>
      )}
    </div>
  );
}

function ResultsScreen({
  session,
  receipt,
  onReset,
}: {
  session: PublicSession;
  receipt: SubmitResult | null;
  onReset: () => void;
}) {
  const [results, setResults] = useState<PublicResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await backend().getPublicResults();
        if (alive) {
          setResults(r);
          setError(null);
        }
      } catch (e) {
        if (alive) {
          setError(
            e instanceof AppError ? e.message : '결과를 불러오지 못했어요.',
          );
        }
      }
    };
    void load();

    return () => {
      alive = false;
    };
  }, [session.revealScope, session.phase]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!results) return <Loading label="판매 결과를 불러오는 중이에요…" />;

  return (
    <div className="stack">
      <ResultsView results={results} />
      {receipt && (
        <div className="card">
          <div className="section-title">내 구매 내역</div>
          <p style={{ margin: 0 }}>
            {receipt.productIds.length}장의 여행권으로 구매를 마쳤어요. 고마워요!
          </p>
        </div>
      )}
      {IS_DEMO && (
        <Button variant="quiet" onClick={onReset}>
          (DEMO) 이 브라우저의 체험 기록 지우고 처음부터
        </Button>
      )}
    </div>
  );
}
