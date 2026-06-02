/* 그로잉영어 — AI·알림·백업 설정 리디자인
   window.GrowingSettings({ variant }) */
(function () {
const { useState } = React;
const Icon = window.GDIcon;

const MEMORY_MAX = 3000;
const DEFAULT_MEMORY = `- 아이비는 그로잉영어 원장님을 돕는 학원 운영 비서다.
- 사용자를 직접 부를 때는 "지선쌤"이라고 부른다.
- 답변은 짧고 실무적으로 한다.
- 학부모 안내문은 따뜻하고 정중하게 작성한다.
- 미납 안내는 압박하지 않고 확인 요청 형태로 작성한다.
- 출결/수납/상담/진도 데이터는 반드시 DB 조회 결과를 기준으로 답한다.
- 모르는 내용은 추측하지 않는다.`;

const TEMPLATE_META = [
  { key: 'checkIn', label: '등원 완료', tokens: ['{학생명}', '{시간}'], def: '{학생명} {시간} 등원완료' },
  { key: 'checkOut', label: '하원 완료', tokens: ['{학생명}', '{시간}'], def: '{학생명} {시간} 하원완료' },
  { key: 'homeworkIncomplete', label: '숙제 미흡', tokens: ['{학생명}'], def: '{학생명} 숙제미흡' },
  { key: 'makeup', label: '보강 안내', tokens: ['{학생명}', '{날짜}', '{시간}'], def: '{학생명} {날짜} {시간} 보강' },
  { key: 'test', label: '평가 결과', tokens: ['{학생명}', '{평가명}', '{점수}'], def: '{학생명} {평가명} {점수}' },
];
const DEFAULTS = Object.fromEntries(TEMPLATE_META.map(t => [t.key, t.def]));

const SAMPLE_NOTES = [
  { id: 'n1', scope: 'academy', category: '말투', content: '미납 안내는 압박하지 않고 확인 요청 형태로 작성한다.' },
  { id: 'n2', scope: 'academy', category: '운영', content: '금요일 Grammar 중등반은 18:30 시작, 지각이 잦아 사전 리마인드 권장.' },
  { id: 'n3', scope: 'student', studentName: '박지민', category: '학습', content: '리딩 레벨 상향 검토 중 — 5월 상담 반영.' },
  { id: 'n4', scope: 'student', studentName: '한지후', category: '출결', content: '차량 시간 조정으로 등원 부담 완화하기로 함.' },
];

function GrowingSettings({ variant = 'desktop' }) {
  const mobile = variant === 'mobile';
  const D = window.GROWING_DATA;
  const kioskPin = '1234';

  const [memory, setMemory] = useState(DEFAULT_MEMORY);
  const [tpls, setTpls] = useState(DEFAULTS);
  const [notes, setNotes] = useState(SAMPLE_NOTES);
  const [pin, setPin] = useState('');
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const resetTpl = (k) => setTpls(p => ({ ...p, [k]: DEFAULTS[k] }));

  return (
    <div className={`gd-root ${mobile ? 'gd-mobile' : ''}`}>
      <div className="set-intro">
        <span className="set-intro-ic">🌱</span>
        <p>데이터는 로그인 계정 기준으로 클라우드에 저장됩니다. 중요한 변경 전에는 백업 파일을 먼저 받아두세요.</p>
      </div>

      {/* 백업 / 복원 */}
      <div className="set-grid2">
        <section className="gd-card set-tile">
          <div className="set-tile-ic ok"><Icon name="save" size={20} /></div>
          <h3 className="set-tile-t">데이터 백업 (내보내기)</h3>
          <p className="set-tile-d">학생·반·출결·수납·상담 데이터를 파일로 저장합니다.</p>
          <button className="pay-btn primary set-w" onClick={() => flash('백업 파일(.json)을 내려받았어요')}>백업 파일 다운로드 (.json)</button>
        </section>
        <section className="gd-card set-tile">
          <div className="set-tile-ic info"><Icon name="login" size={20} /></div>
          <h3 className="set-tile-t">데이터 복원 (가져오기)</h3>
          <p className="set-tile-d">백업 파일(.json)로 복원합니다. <b>기존 데이터가 대체됩니다.</b></p>
          <button className="pay-btn ghost set-w" onClick={() => flash('복원할 백업 파일을 선택하세요')}>백업 파일 업로드</button>
        </section>
      </div>

      {/* CSV */}
      <section className="gd-card">
        <h3 className="set-h"><Icon name="save" size={17} /> CSV 내보내기 <span className="set-h-sub">엑셀 호환</span></h3>
        <div className="set-csv">
          {['학생 목록', '출결 기록', '수납 내역'].map(l => (
            <button key={l} className="pay-btn ghost" onClick={() => flash(`${l} CSV를 내려받았어요`)}><Icon name="save" size={14} /> {l}</button>
          ))}
        </div>
      </section>

      {/* 키오스크 PIN */}
      <section className="gd-card set-accent-warn">
        <h3 className="set-h"><Icon name="search" size={17} /> 키오스크 복귀 PIN</h3>
        <p className="set-p">자율출결 키오스크에서 관리자 화면으로 돌아올 때 쓰는 비밀번호예요. 기본값(1234)에서 변경을 권장합니다. <b>현재: {'•'.repeat(kioskPin.length)} ({kioskPin.length}자리)</b></p>
        <div className="set-pin">
          <input type="password" inputMode="numeric" className="msg-select set-pin-in" placeholder="새 PIN (4~8자리 숫자)" value={pin} onChange={e => setPin(e.target.value)} />
          <button className="pay-btn primary" onClick={() => { if (/^\d{4,8}$/.test(pin)) { flash('키오스크 PIN을 변경했어요'); setPin(''); } else flash('PIN은 4~8자리 숫자로 입력해 주세요'); }}>PIN 변경</button>
        </div>
      </section>

      {/* 아이비 기억 */}
      <section className="gd-card set-accent">
        <h3 className="set-h">🧠 아이비 기억 설정</h3>
        <p className="set-p">아이비가 참고할 <b>말투·운영 기준·안내 스타일</b>을 입력하세요. 학생 데이터가 아니라, 답변·안내문 작성 시 따를 원칙만 적어두면 됩니다.</p>
        <textarea className="set-memo" maxLength={MEMORY_MAX} value={memory} onChange={e => setMemory(e.target.value)} />
        <div className="set-memo-foot">
          <span className={memory.length >= MEMORY_MAX ? 'over' : ''}>{memory.length.toLocaleString()} / {MEMORY_MAX.toLocaleString()}자</span>
          <button className="pay-btn primary" onClick={() => flash('아이비 기억을 저장했어요')}>기억 저장</button>
        </div>
      </section>

      {/* 자가학습 메모 */}
      <section className="gd-card">
        <h3 className="set-h">📓 아이비가 스스로 학습한 메모</h3>
        <p className="set-p"><b>학원(academy)</b> 노트는 매 답변에 반영되고, <b>학생별</b> 노트는 해당 학생 질문 시 불러옵니다. 잘못된 내용은 삭제하세요.</p>
        <div className="set-notes">
          {notes.length === 0 ? <p className="st-empty-line">🌱 아직 학습한 메모가 없습니다.</p> :
            notes.map(n => (
              <div className="set-note" key={n.id}>
                <span className={`set-note-scope ${n.scope}`}>{n.scope === 'academy' ? '학원' : (n.studentName || '학생')}</span>
                <div className="set-note-body"><span className="set-note-cat">[{n.category}]</span> {n.content}</div>
                <button className="cl-del" title="삭제" onClick={() => { setNotes(p => p.filter(x => x.id !== n.id)); flash('메모를 삭제했어요'); }}><Icon name="trash" size={14} /></button>
              </div>
            ))}
        </div>
      </section>

      {/* 알림 템플릿 */}
      <section className="gd-card set-accent-warn">
        <h3 className="set-h"><Icon name="msg" size={17} /> 알림 메시지 템플릿</h3>
        <p className="set-p">출결·알림장에서 쓰는 학부모 문구를 직접 수정하세요. <b>{'{학생명} {시간} {날짜} {평가명} {점수}'}</b> 토큰은 전송 시 실제 값으로 치환됩니다.</p>
        <div className="set-tpls">
          {TEMPLATE_META.map(t => (
            <div className="set-tpl" key={t.key}>
              <div className="set-tpl-head">
                <label>{t.label} <em>사용 가능: {t.tokens.join(', ')}</em></label>
                <button className="set-tpl-reset" disabled={tpls[t.key] === DEFAULTS[t.key]} onClick={() => resetTpl(t.key)}><Icon name="refresh" size={11} /> 기본값</button>
              </div>
              <input className="msg-select" value={tpls[t.key]} onChange={e => setTpls(p => ({ ...p, [t.key]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div className="set-tpl-save"><button className="pay-btn primary" onClick={() => flash('알림 템플릿을 저장했어요')}>템플릿 저장</button></div>
      </section>

      {/* 위험 영역 */}
      <section className="gd-card set-danger">
        <h3 className="set-h danger"><Icon name="alert" size={17} /> 위험 영역 (초기화)</h3>
        <div className="set-danger-row">
          <p>이 계정의 모든 학원 데이터(학생/반/출결/수납/상담)를 한 번에 비웁니다. <b>영구 삭제되므로 꼭 백업을 먼저 받으세요.</b></p>
          <button className="set-danger-btn" onClick={() => flash('초기화는 백업 후 진행하세요 (프로토타입)')}>전체 데이터 삭제</button>
        </div>
      </section>

      {toast && <div className="gd-toast"><Icon name="check" size={15} /> {toast}</div>}
    </div>
  );
}

window.GrowingSettings = GrowingSettings;
})();
