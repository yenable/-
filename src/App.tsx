import { useEffect, useState } from 'react';
import { AdminApp } from './screens/Admin';
import { ParticipantApp } from './screens/Participant';

/** 아주 가벼운 경로 분기 (/admin 과 참여자용 화면) */
function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export default function App() {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onPop = () => setPath(currentPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return path === '/admin' ? <AdminApp /> : <ParticipantApp />;
}
