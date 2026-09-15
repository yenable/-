import { useState } from 'react';
import { backend } from '../lib/backend';
import { AppError, type Pass } from '../lib/types';
import { browserKey } from '../lib/storage';
import { IS_DEMO } from '../lib/config';
import { Button, Notice } from '../components/ui';

type Role = 'student' | 'parent' | null;

export function EntryScreen({ onPass }: { onPass: (pass: Pass) => void }) {
  const [role, setRole] = useState<Role>(null);

  if (role === 'student') {
    return <StudentEntry onPass={onPass} onBack={() => setRole(null)} />;
  }
  if (role === 'parent') {
    return <ParentEntry onPass={onPass} onBack={() => setRole(null)} />;
  }

  return (
    <div className="stack">
      <div className="card">
        <h2>어서 오세요! 어떤 고객님인가요?</h2>
        <p className="lead">
          입장한 뒤에는 여행 상품 발표가 끝나기를 기다렸다가 구매할 수 있어요.
        </p>
        <div className="stack">
          <Button variant="primary" onClick={() => setRole('student')}>
            🎒 학생으로 입장
          </Button>
          <Button onClick={() => setRole('parent')}>👨‍👩‍👧 학부모로 입장</Button>
        </div>
      </div>
      <Notice kind="info">
        학생 고객님께는 여행권 1장, 학부모 고객님께는 여행권 2장이 제공됩니다.
      </Notice>
    </div>
  );
}

function StudentEntry({
  onPass,
  onBack,
}: {
  onPass: (pass: Pass) => void;
  onBack: () => void;
}) {
  const [no, setNo] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const parsed = Number(no.trim());
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError('번호를 숫자로 적어 주세요.');
      return;
    }
    if (!name.trim()) {
      setError('이름을 적어 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const pass = await backend().issueStudentPass(parsed, name.trim());
      onPass(pass);
    } catch (err) {
      setError(
        err instanceof AppError
          ? err.message
          : '잠시 문제가 생겼어요. 다시 한 번 눌러 주세요.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>학생 고객 입장</h2>
      <p className="lead">우리 반 명단의 번호와 이름을 그대로 적어 주세요.</p>

      {error && <Notice kind="error">{error}</Notice>}

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="student-no">번호</label>
        <input
          id="student-no"
          className="input"
          value={no}
          onChange={(e) => setNo(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="next"
          maxLength={2}
          placeholder="예) 7"
          aria-invalid={Boolean(error) || undefined}
        />
      </div>

      <div className="field">
        <label htmlFor="student-name">이름</label>
        <input
          id="student-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={20}
          placeholder="예) 홍길동"
          aria-invalid={Boolean(error) || undefined}
        />
        <span className="hint">띄어쓰기는 달라도 괜찮아요.</span>
      </div>

      {IS_DEMO && (
        <Notice kind="warn">
          체험용 명단: {backend().demoRosterHint?.()}
        </Notice>
      )}

      <div className="btn-row" style={{ marginTop: 14 }}>
        <Button variant="quiet" onClick={onBack}>
          뒤로
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          입장하기
        </Button>
      </div>
    </form>
  );
}

function ParentEntry({
  onPass,
  onBack,
}: {
  onPass: (pass: Pass) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!code.trim()) {
      setError('참여 코드를 적어 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const pass = await backend().issueParentPass(
        code.trim(),
        browserKey('parent'),
      );
      onPass(pass);
    } catch (err) {
      setError(
        err instanceof AppError
          ? err.message
          : '잠시 문제가 생겼어요. 다시 한 번 눌러 주세요.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>학부모 고객 입장</h2>
      <p className="lead">
        화면에 안내된 참여 코드를 입력해 주세요. 이름·연락처는 받지 않습니다.
      </p>

      <Notice kind="info">
        학부모 고객님께는 서로 다른 여행 상품을 고를 수 있는 여행권 2장이
        제공됩니다.
      </Notice>

      {error && <Notice kind="error">{error}</Notice>}

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="parent-code">참여 코드</label>
        <input
          id="parent-code"
          className="input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          enterKeyHint="done"
          maxLength={24}
          placeholder="예) TRAVEL"
          aria-invalid={Boolean(error) || undefined}
        />
        <span className="hint">대문자·소문자, 띄어쓰기는 구분하지 않아요.</span>
      </div>

      {IS_DEMO && (
        <Notice kind="warn">
          체험용 참여 코드: {backend().demoParentCodeHint?.()}
        </Notice>
      )}

      <div className="btn-row" style={{ marginTop: 14 }}>
        <Button variant="quiet" onClick={onBack}>
          뒤로
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          입장하기
        </Button>
      </div>
    </form>
  );
}
