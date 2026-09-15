import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ResultsView } from '../components/ResultsView';
import {
  Button,
  DemoBanner,
  Disclaimer,
  Header,
  Loading,
  Modal,
  Notice,
  PHASE_LABEL,
} from '../components/ui';
import { backend } from '../lib/backend';
import { DEMO_NOTICE, IS_DEMO } from '../lib/config';
import {
  SCOPE_LABEL,
  planReveal,
  rankProducts,
  scopeWidth,
} from '../lib/ranking';
import type { AdminIdentity } from '../lib/backend/types';
import {
  AppError,
  type AdminTally,
  type Phase,
  type PublicResults,
  type RevealScope,
} from '../lib/types';

const PHASES: Phase[] = ['waiting', 'open', 'closed', 'revealed'];
const SCOPES: RevealScope[] = ['top1', 'top2', 'top3', 'all'];
const RESET_PHRASE = '초기화';

export function AdminApp() {
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setIdentity(await backend().getAdminIdentity());
    } catch {
      setIdentity(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="page admin-body">
      <Header wide>
        <p className="header-tagline" style={{ marginTop: 8 }}>
          교사용 관리자 화면 · /admin
        </p>
      </Header>

      <DemoBanner notice={DEMO_NOTICE} />

      <main className="main">
        <div className="wrap wrap-wide stack">
          {checking ? (
            <Loading label="관리자 정보를 확인하는 중이에요…" />
          ) : identity ? (
            <Dashboard identity={identity} onSignOut={() => void refresh()} />
          ) : (
            <SignIn onSignedIn={() => void refresh()} />
          )}
        </div>
      </main>

      <Disclaimer />
    </div>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await backend().adminSignIn(email.trim(), password);
      onSignedIn();
    } catch (err) {
      setError(
        err instanceof AppError ? err.message : '로그인하지 못했습니다.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} style={{ maxWidth: 460, margin: '0 auto' }}>
      <h2>교사 로그인</h2>
      <p className="lead">
        {IS_DEMO
          ? 'demo mode입니다. 아무 이메일이나 넣고 로그인하면 관리자 화면을 체험할 수 있어요.'
          : 'Supabase에 등록된 교사 계정으로 로그인해 주세요. 관리자 목록에 있는 계정만 들어올 수 있습니다.'}
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="admin-email">이메일</label>
        <input
          id="admin-email"
          className="input"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teacher@school.example"
          required={!IS_DEMO}
        />
      </div>
      <div className="field">
        <label htmlFor="admin-password">비밀번호</label>
        <input
          id="admin-password"
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={!IS_DEMO}
        />
      </div>
      <Button type="submit" variant="primary" loading={busy}>
        로그인
      </Button>
      {IS_DEMO && (
        <Button
          variant="quiet"
          style={{ marginTop: 8 }}
          onClick={async () => {
            await backend().adminSignIn('demo-teacher@example.com', '');
            onSignedIn();
          }}
        >
          데모 교사로 바로 로그인
        </Button>
      )}
    </form>
  );
}

function Dashboard({
  identity,
  onSignOut,
}: {
  identity: AdminIdentity;
  onSignOut: () => void;
}) {
  const [tally, setTally] = useState<AdminTally | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<RevealScope>('top1');
  const [preview, setPreview] = useState<PublicResults | null>(null);
  const [confirm, setConfirm] = useState<null | 'reveal' | 'reset' | Phase>(null);
  const [resetText, setResetText] = useState('');
  const [keepRoster, setKeepRoster] = useState(true);
  const alive = useRef(true);
  // 서버에 저장된 공개 범위가 "바뀌었을 때만" 화면 선택을 따라간다.
  // (2초 폴링이 교사가 방금 고른 범위를 되돌리지 않도록)
  const serverScope = useRef<RevealScope | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await backend().adminGetTally();
      if (!alive.current) return;
      setTally(t);
      setError(null);
      if (serverScope.current !== t.revealScope) {
        serverScope.current = t.revealScope;
        if (t.revealScope !== 'none') setScope(t.revealScope);
      }
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof AppError ? e.message : '현황을 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = setInterval(() => void load(), 2000);
    const stop = backend().subscribeSession(() => void load());
    return () => {
      alive.current = false;
      clearInterval(timer);
      stop();
    };
  }, [load]);

  const ranked = useMemo(
    () => (tally ? rankProducts(tally.products, tally.issuedTickets) : []),
    [tally],
  );
  const plan = useMemo(() => planReveal(ranked, scope), [ranked, scope]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof AppError ? e.message : '작업을 마치지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function openPreview(next: RevealScope) {
    setScope(next);
    setPreview(null);
    try {
      setPreview(await backend().adminPreviewResults(next));
    } catch (e) {
      setError(e instanceof AppError ? e.message : '미리보기를 만들지 못했습니다.');
    }
  }

  if (!tally) {
    return (
      <>
        {error && <Notice kind="error">{error}</Notice>}
        <Loading label="실시간 현황을 불러오는 중이에요…" />
      </>
    );
  }

  const phase = tally.phase;
  const maxSold = ranked.reduce((m, r) => Math.max(m, r.sold), 0);
  const zeroProducts = ranked.filter((r) => r.sold === 0);
  const narrowing =
    phase === 'revealed' && scopeWidth(scope) < scopeWidth(tally.revealScope);

  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}

      {/* ---------- 상태 조작 ---------- */}
      <section className="card">
        <div className="section-title">수업 진행 상태</div>
        <div className="phase-steps" style={{ marginBottom: 12 }}>
          {PHASES.map((p, i) => (
            <span
              key={p}
              className={`phase-step ${p === phase ? 'current' : ''} ${
                PHASES.indexOf(phase) > i ? 'done' : ''
              }`}
            >
              {i + 1}. {PHASE_LABEL[p]}
            </span>
          ))}
        </div>

        <div className="btn-row">
          <Button
            variant="primary"
            disabled={phase !== 'waiting' || busy}
            onClick={() => void run(() => backend().adminSetPhase('open'))}
          >
            ① 구매 시작
          </Button>
          <Button
            disabled={phase !== 'open' || busy}
            onClick={() => void run(() => backend().adminSetPhase('closed'))}
          >
            ② 구매 끝
          </Button>
          <Button
            disabled={phase !== 'closed' || busy}
            onClick={() => {
              void openPreview(scope);
              document
                .getElementById('reveal-section')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            ③ 결과 공개 준비
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => setConfirm('reset')}>
            리허설 데이터 초기화
          </Button>
        </div>

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.88rem' }}>
            예외 조작 (이전 단계로 되돌리기)
          </summary>
          <div className="btn-row" style={{ marginTop: 10 }}>
            {PHASES.filter((p) => PHASES.indexOf(p) < PHASES.indexOf(phase)).map(
              (p) => (
                <Button
                  key={p}
                  variant="quiet"
                  disabled={busy}
                  onClick={() => setConfirm(p)}
                >
                  {PHASE_LABEL[p]}(으)로 되돌리기
                </Button>
              ),
            )}
            {PHASES.indexOf(phase) === 0 && (
              <p className="rank-meta" style={{ margin: 0 }}>
                되돌릴 이전 단계가 없습니다.
              </p>
            )}
          </div>
        </details>

        <p className="rank-meta" style={{ marginTop: 10 }}>
          로그인: {identity.email}{' '}
          <button
            className="btn btn-inline btn-quiet"
            type="button"
            onClick={async () => {
              await backend().adminSignOut();
              onSignOut();
            }}
          >
            로그아웃
          </button>
        </p>
      </section>

      {/* ---------- 실시간 현황 ---------- */}
      <section className="card">
        <div className="section-title">실시간 판매 현황</div>
        <div className="teacher-only">
          <span aria-hidden="true">🔒</span>
          이 현황은 교사에게만 보이며 참여자 화면에는 아직 공개되지 않습니다.
        </div>

        <div className="stat-grid" style={{ marginTop: 12 }}>
          <div className="stat">
            <div className="k">참여 완료 학생</div>
            <div className="v">
              {tally.studentParticipants}
              <small> / {tally.studentCapacity}명</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">참여 완료 학부모</div>
            <div className="v">
              {tally.parentParticipants}
              <small> 명</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">총 참여자</div>
            <div className="v">
              {tally.totalParticipants}
              <small> 명</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">발행된 전체 여행권</div>
            <div className="v">
              {tally.issuedTickets}
              <small> 장</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">학생표 총합</div>
            <div className="v">
              {tally.studentTickets}
              <small> 장</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">학부모표 총합</div>
            <div className="v">
              {tally.parentTickets}
              <small> 장</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">현재 상태</div>
            <div className="v" style={{ fontSize: '1.1rem' }}>
              {PHASE_LABEL[phase]}
            </div>
          </div>
          <div className="stat">
            <div className="k">최근 집계 시각</div>
            <div className="v" style={{ fontSize: '1.1rem' }}>
              {new Date(tally.countedAt).toLocaleTimeString('ko-KR')}
            </div>
          </div>
        </div>

        <div className="admin-bars" style={{ marginTop: 16 }}>
          {ranked.map((r) => (
            <div className="admin-bar-row" key={r.productId}>
              <span>
                <b>{r.groupNo}모둠</b>
                <br />
                <span className="rank-meta">{r.countryName}</span>
              </span>
              <span
                className="admin-bar-track"
                role="img"
                aria-label={`${r.countryName} ${r.sold}장`}
              >
                <span
                  className="admin-bar-fill"
                  style={{
                    width: `${maxSold > 0 ? Math.max(4, (r.sold / maxSold) * 100) : 4}%`,
                    background: r.themeColor,
                  }}
                >
                  {r.sold > 0 ? r.sold : ''}
                </span>
              </span>
              <span style={{ textAlign: 'right' }}>
                <b>
                  {r.tied ? '공동 ' : ''}
                  {r.rank}위
                </b>
                <br />
                <span className="rank-meta">{r.sharePercent}%</span>
              </span>
            </div>
          ))}
        </div>

        <div className="table-scroll" style={{ marginTop: 16 }}>
          <table className="admin-table">
            <caption className="visually-hidden">상품별 판매 현황</caption>
            <thead>
              <tr>
                <th>순위</th>
                <th>모둠 · 국가</th>
                <th className="num">판매 여행권</th>
                <th className="num">학생표</th>
                <th className="num">학부모표</th>
                <th className="num">비율</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.productId}>
                  <td>
                    {r.tied ? '공동 ' : ''}
                    {r.rank}위
                  </td>
                  <td>
                    {r.groupNo}모둠 · {r.countryName}
                  </td>
                  <td className="num">{r.sold}</td>
                  <td className="num">{r.studentSold}</td>
                  <td className="num">{r.parentSold}</td>
                  <td className="num">{r.sharePercent}%</td>
                  <td>
                    {r.sold === 0 ? (
                      <span className="badge badge-warn">확인 필요</span>
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {zeroProducts.length > 0 && (
          <p className="rank-meta" style={{ marginTop: 10 }}>
            아직 여행권이 배정되지 않은 상품:{' '}
            {zeroProducts.map((z) => `${z.groupNo}모둠`).join(', ')} · 공개 범위를
            정할 때 참고하세요.
          </p>
        )}

        <Notice kind="info">
          개별 학생의 선택 내역은 교사에게도 보이지 않습니다. 번호·이름과 구매
          상품은 연결해서 저장하지 않습니다.
        </Notice>
      </section>

      {/* ---------- 결과 공개 ---------- */}
      <section className="card" id="reveal-section">
        <div className="section-title">결과 공개 범위</div>
        {phase === 'waiting' || phase === 'open' ? (
          <Notice kind="info">
            먼저 <b>구매 끝</b>을 눌러 마감한 뒤 공개 범위를 정할 수 있어요.
          </Notice>
        ) : null}

        <div className="scope-options" style={{ marginTop: 10 }}>
          {SCOPES.map((s) => {
            const p = planReveal(ranked, s);
            return (
              <button
                key={s}
                type="button"
                className={`scope-option ${scope === s ? 'is-active' : ''}`}
                onClick={() => void openPreview(s)}
                aria-pressed={scope === s}
              >
                <span className="radio" aria-hidden="true" />
                <span>
                  <span className="t">{SCOPE_LABEL[s]}</span>
                  <br />
                  <span className="d">
                    공개 {p.revealed.length}개 · 숨김 {p.hiddenCount}개
                    {p.extraByTie > 0 && ` · 동점으로 ${p.extraByTie}개 추가 공개`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {plan.extraByTie > 0 && (
          <Notice kind="warn">
            동점 때문에 설정한 숫자보다 {plan.extraByTie}개 상품이 더 공개됩니다.
          </Notice>
        )}
        {plan.empty && (
          <Notice kind="warn">
            아직 집계된 여행권이 없습니다. 공개해도 순위 대신 안내 문구가
            보입니다.
          </Notice>
        )}

        <div className="btn-row" style={{ marginTop: 12 }}>
          <Button
            variant="ghost"
            onClick={() => void openPreview(scope)}
            disabled={busy}
          >
            학생 화면 미리보기 새로 고침
          </Button>
          <Button
            variant="primary"
            disabled={busy || phase === 'waiting' || phase === 'open'}
            onClick={() => setConfirm('reveal')}
          >
            {phase === 'revealed' ? '공개 범위 바꾸기' : '이 범위로 결과 공개'}
          </Button>
        </div>

        {phase === 'revealed' && (
          <p className="rank-meta" style={{ marginTop: 8 }}>
            지금 공개 중인 범위: <b>{SCOPE_LABEL[tally.revealScope]}</b>
          </p>
        )}

        {preview && (
          <div className="preview-frame" style={{ marginTop: 14 }}>
            <div className="preview-label">
              <span aria-hidden="true">👁</span> 학생·학부모 화면 미리보기 (
              {SCOPE_LABEL[scope]})
            </div>
            <ResultsView results={preview} preview />
          </div>
        )}
      </section>

      {IS_DEMO && (
        <section className="card">
          <div className="section-title">DEMO 데이터 만들기</div>
          <p className="lead">
            리허설용 가상 구매 데이터를 만들어 공개 범위·동점 처리를 미리
            연습할 수 있어요. (demo mode에서만 보입니다)
          </p>
          <div className="btn-row">
            <Button
              variant="quiet"
              onClick={() => void run(() => backend().demoSeed!('normal'))}
            >
              보통 결과
            </Button>
            <Button
              variant="quiet"
              onClick={() => void run(() => backend().demoSeed!('tie-first'))}
            >
              공동 1위
            </Button>
            <Button
              variant="quiet"
              onClick={() => void run(() => backend().demoSeed!('tie-boundary'))}
            >
              경계 동점(TOP 2)
            </Button>
            <Button
              variant="quiet"
              onClick={() => void run(() => backend().demoSeed!('with-zero'))}
            >
              0장 상품 포함
            </Button>
            <Button
              variant="quiet"
              onClick={() => void run(() => backend().demoSeed!('clear'))}
            >
              구매 데이터 비우기
            </Button>
          </div>
        </section>
      )}

      {/* ---------- 확인 창 ---------- */}
      {confirm === 'reveal' && (
        <Modal
          title={phase === 'revealed' ? '공개 범위를 바꿀까요?' : '이 범위로 결과를 공개할까요?'}
          onClose={() => setConfirm(null)}
          actions={
            <>
              <Button variant="quiet" onClick={() => setConfirm(null)}>
                취소
              </Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={() => {
                  setConfirm(null);
                  void run(async () => {
                    if (phase !== 'revealed') {
                      await backend().adminSetPhase('revealed');
                    }
                    await backend().adminSetRevealScope(scope);
                  });
                }}
              >
                공개하기
              </Button>
            </>
          }
        >
          <ul>
            <li>
              선택한 공개 범위: <b>{SCOPE_LABEL[scope]}</b>
            </li>
            <li>
              공개될 상품 {plan.revealed.length}개
              {plan.revealed.length > 0 && (
                <>
                  :{' '}
                  {plan.revealed
                    .map((r) => `${r.rank}위 ${r.groupNo}모둠 ${r.countryName}`)
                    .join(', ')}
                </>
              )}
            </li>
            <li>숨겨질 상품 {plan.hiddenCount}개</li>
            <li>
              동점으로 추가 공개되는 상품:{' '}
              {plan.extraByTie > 0 ? `${plan.extraByTie}개` : '없음'}
            </li>
            <li>
              공개될 기대평: {preview ? `${preview.reviews.length}개` : '미리보기를 먼저 열어 주세요'}{' '}
              (학부모 기대평은 고른 두 상품이 모두 공개될 때만 보입니다)
            </li>
          </ul>
          {narrowing && (
            <Notice kind="warn">
              이미 공개한 범위보다 좁아집니다. 학생 화면에서 보이던 상품이
              사라질 수 있어요.
            </Notice>
          )}
          {plan.empty && (
            <Notice kind="warn">
              집계된 여행권이 없어 "아직 집계된 여행권이 없습니다." 문구가
              보입니다.
            </Notice>
          )}
        </Modal>
      )}

      {confirm === 'reset' && (
        <Modal
          title="리허설 데이터를 초기화할까요?"
          onClose={() => {
            setConfirm(null);
            setResetText('');
          }}
          actions={
            <>
              <Button
                variant="quiet"
                onClick={() => {
                  setConfirm(null);
                  setResetText('');
                }}
              >
                취소
              </Button>
              <Button
                variant="danger"
                disabled={resetText.trim() !== RESET_PHRASE}
                loading={busy}
                onClick={() => {
                  setConfirm(null);
                  setResetText('');
                  void run(() => backend().adminReset(keepRoster));
                }}
              >
                초기화 실행
              </Button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>지워지는 것</p>
          <ul>
            <li>구매(투표) 기록 {tally.totalParticipants}건과 기대평 전체</li>
            <li>발급된 참여권과 사용 여부</li>
            <li>수업 상태는 "구매 시작 전"으로 되돌아갑니다</li>
          </ul>
          <label
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              margin: '10px 0',
            }}
          >
            <input
              type="checkbox"
              checked={keepRoster}
              onChange={(e) => setKeepRoster(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            학생 명단은 그대로 두기 (권장)
          </label>
          <div className="field">
            <label htmlFor="reset-confirm">
              계속하려면 <b>{RESET_PHRASE}</b> 를 입력하세요
            </label>
            <input
              id="reset-confirm"
              className="input"
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              autoComplete="off"
            />
          </div>
        </Modal>
      )}

      {confirm && PHASES.includes(confirm as Phase) && (
        <Modal
          title="이전 단계로 되돌릴까요?"
          onClose={() => setConfirm(null)}
          actions={
            <>
              <Button variant="quiet" onClick={() => setConfirm(null)}>
                취소
              </Button>
              <Button
                variant="danger"
                loading={busy}
                onClick={() => {
                  const target = confirm as Phase;
                  setConfirm(null);
                  void run(() => backend().adminSetPhase(target));
                }}
              >
                되돌리기
              </Button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            <b>{PHASE_LABEL[confirm as Phase]}</b> 단계로 되돌립니다. 이미 공개된
            결과가 참여자 화면에서 사라지거나, 다시 구매가 가능해질 수 있어요.
          </p>
          <p style={{ marginBottom: 0 }}>구매 기록은 지워지지 않습니다.</p>
        </Modal>
      )}
    </>
  );
}
