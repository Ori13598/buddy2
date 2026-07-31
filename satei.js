/* ============================================================
   kantei.js  –  不動産査定 wizard フォーム
   Requires: nar_footer.js loaded before this（i18n.js は任意）
   ============================================================ */

const IS_LOCAL_TEST = ["localhost", "127.0.0.1"].includes(location.hostname);
const API_URL_KANTEI = IS_LOCAL_TEST
    ? "http://127.0.0.1:5000/api/kantei"   // ローカルで kantei_backend.py を動かしている場合
    : "https://buddy-59k2.onrender.com/api/kantei";
const ADDR_API_BASE = "https://geolonia.github.io/japanese-addresses/api";

// ボット対策: ページ読み込み時刻。送信までの経過時間が短すぎる場合はボットとみなす
const PAGE_LOAD_TS = Date.now();
const MIN_SUBMIT_MS = 2000;

// 対応する都道府県のみ（全国ではない）
const PREF_ORDER = ["大阪府", "東京都", "愛知県", "福岡県", "沖縄県"];

// 対応都道府県は市区町村を全件対応する（愛知県のみ名古屋市内の区に限定）。
// 一覧はページ読み込み時に geolonia の全国データ（ADDR_API_BASE/ja.json）から動的に構築する。
// value / label には市区町村の正式名称をそのまま使用する。
let AREA_CITIES = {};
let areaCitiesReady = false;

// 通信に失敗した場合のフォールバック（最低限のエリアのみ）
const FALLBACK_AREA_CITIES = {
    "大阪府": [
        { value: "大阪市天王寺区", label: "大阪市天王寺区" },
        { value: "大阪市生野区", label: "大阪市生野区" },
        { value: "大阪市北区", label: "大阪市北区" },
        { value: "大阪市浪速区", label: "大阪市浪速区" },
        { value: "大阪市中央区", label: "大阪市中央区" },
        { value: "大阪市福島区", label: "大阪市福島区" },
    ],
    "東京都": [
        { value: "千代田区", label: "千代田区" },
        { value: "中央区", label: "中央区" },
        { value: "港区", label: "港区" },
        { value: "渋谷区", label: "渋谷区" },
        { value: "新宿区", label: "新宿区" },
        { value: "目黒区", label: "目黒区" },
    ],
    "愛知県": [
        { value: "名古屋市中村区", label: "名古屋市中村区" },
        { value: "名古屋市中区", label: "名古屋市中区" },
        { value: "名古屋市東区", label: "名古屋市東区" },
        { value: "名古屋市千種区", label: "名古屋市千種区" },
        { value: "名古屋市昭和区", label: "名古屋市昭和区" },
        { value: "名古屋市瑞穂区", label: "名古屋市瑞穂区" },
    ],
    "福岡県": [
        { value: "福岡市中央区", label: "福岡市中央区" },
        { value: "福岡市博多区", label: "福岡市博多区" },
        { value: "福岡市早良区", label: "福岡市早良区" },
    ],
    "沖縄県": [
        { value: "那覇市", label: "那覇市" },
        { value: "中頭郡北谷町", label: "中頭郡北谷町" },
        { value: "国頭郡恩納村", label: "国頭郡恩納村" },
        { value: "中頭郡読谷村", label: "中頭郡読谷村" },
        { value: "宮古島市", label: "宮古島市" },
        { value: "石垣市", label: "石垣市" },
    ],
};

// geolonia の全国市区町村一覧（{都道府県名: [市区町村名, ...]}）から
// 対応都道府県（PREF_ORDER）分のみを抽出して AREA_CITIES を構築する。
// 愛知県は「名古屋市」で始まる区のみに絞り込む（名古屋市以外の市町村は対象外）。
async function loadAreaCities() {
    try {
        const res = await fetch(`${ADDR_API_BASE}/ja.json`);
        if (!res.ok) throw new Error('area list fetch failed');
        const data = await res.json();
        const built = {};
        PREF_ORDER.forEach(pref => {
            let cities = data[pref] || [];
            if (pref === "愛知県") {
                cities = cities.filter(c => c.startsWith("名古屋市"));
            }
            built[pref] = cities.length
                ? cities.map(c => ({ value: c, label: c }))
                : (FALLBACK_AREA_CITIES[pref] || []);
        });
        AREA_CITIES = built;
    } catch {
        AREA_CITIES = FALLBACK_AREA_CITIES;
    } finally {
        areaCitiesReady = true;
    }
}

const TYPE_TITLES = {
    sokochi: "底地について教えてください",
    akiya: "空き家・空き地について教えてください",
    mansion: "一棟マンションについて教えてください"
};

let currentStep = 0;
let lastActiveStep = 0;
const STEP_COUNT = 5;
let selectedType = null;

/* ──────────────────────────────────────────────
   HELPER: validation UI
────────────────────────────────────────────── */
function showError(id, msg) {
    const el = document.getElementById(id);
    if (el) { if (msg) el.textContent = msg; el.classList.add('visible'); }
}
function clearError(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('visible');
}
function setInvalid(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('input-error');
    // shakeアニメーションを毎回リトリガーする（一度削除→reflow→再追加）
    el.classList.remove('shake-anim');
    void el.offsetWidth;
    el.classList.add('shake-anim');
}
function clearInvalid(id) { document.getElementById(id)?.classList.remove('input-error'); }

function validatePhone(raw, phoneId, errorId) {
    if (!raw) { clearError(errorId); clearInvalid(phoneId); return true; } // 空欄は許容（別途どちらか必須チェック）
    if (raw.startsWith('+')) {
        const digits = raw.slice(1);
        if (!/^\d+$/.test(digits) || digits.length < 8 || digits.length > 15) {
            showError(errorId, '正しい電話番号を入力してください'); setInvalid(phoneId); return false;
        }
    } else if (raw.startsWith('0')) {
        if (raw.length < 10 || raw.length > 11) {
            showError(errorId, '正しい電話番号を入力してください'); setInvalid(phoneId); return false;
        }
    } else {
        showError(errorId, '正しい電話番号を入力してください'); setInvalid(phoneId); return false;
    }
    clearError(errorId); clearInvalid(phoneId); return true;
}
function validateEmail(val, emailId, errorId) {
    if (!val) { clearError(errorId); clearInvalid(emailId); return true; } // 空欄は許容
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        showError(errorId, '正しいメールアドレスを入力してください'); setInvalid(emailId); return false;
    }
    clearError(errorId); clearInvalid(emailId); return true;
}

function isBotSubmission(hpId) {
    const hpVal = document.getElementById(hpId)?.value || '';
    const elapsed = Date.now() - PAGE_LOAD_TS;
    return !!hpVal || elapsed < MIN_SUBMIT_MS;
}
function fakeSuccessAndHide(formId, successId) {
    document.getElementById(formId).style.display = 'none';
    document.getElementById(successId).classList.add('visible');
}

/* ──────────────────────────────────────────────
   住所プルダウン（都道府県→市区町村→町名）
   データ元: geolonia/japanese-addresses（無料・公開JSON）
────────────────────────────────────────────── */
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 対応都道府県（PREF_ORDER）から k-pref のプルダウンを組み立てる
function populatePrefSelect() {
    const prefSelect = document.getElementById('k-pref');
    prefSelect.innerHTML = '<option value="">選択してください</option>' +
        PREF_ORDER.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
}

// 選択された都道府県に対応する市区町村のみを k-city に表示する
function populateCitySelect(prefName) {
    const citySelect = document.getElementById('k-city');
    const cities = AREA_CITIES[prefName] || [];
    citySelect.innerHTML = '<option value="">選択してください</option>' +
        cities.map(c => `<option value="${escapeHtml(c.value)}">${escapeHtml(c.label)}</option>`).join('');
    citySelect.disabled = false;
}

function switchToManualTown(forceOn) {
    const townSelect = document.getElementById('k-town');
    const manualInput = document.getElementById('k-town-manual');
    const toggleBtn = document.getElementById('k-town-manual-toggle');
    if (forceOn) {
        townSelect.style.display = 'none';
        manualInput.style.display = '';
        toggleBtn.textContent = 'プルダウンから選び直す';
    } else {
        townSelect.style.display = '';
        manualInput.style.display = 'none';
        toggleBtn.textContent = '見つからない場合は直接入力';
    }
}

async function populateTowns(prefName, cityName) {
    const townSelect = document.getElementById('k-town');
    townSelect.disabled = true;
    townSelect.innerHTML = '<option value="">読み込み中...</option>';
    try {
        const url = `${ADDR_API_BASE}/ja/${encodeURIComponent(prefName)}/${encodeURIComponent(cityName)}.json`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('town fetch failed');
        const data = await res.json();
        const towns = [...new Set(data.map(d => d.town).filter(Boolean))];
        if (towns.length === 0) throw new Error('empty town list');
        townSelect.innerHTML = '<option value="">選択してください</option>' +
            towns.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
        townSelect.disabled = false;
        switchToManualTown(false);
        return towns;
    } catch {
        townSelect.innerHTML = '<option value="">町名を自動取得できませんでした</option>';
        townSelect.disabled = true;
        switchToManualTown(true);
        return [];
    }
}

function getTownValue() {
    const manualInput = document.getElementById('k-town-manual');
    const townSelect = document.getElementById('k-town');
    if (manualInput.style.display !== 'none') return manualInput.value.trim();
    return townSelect.value;
}

// 現在表示されている町名フィールドのidを返す（プルダウン or 直接入力のどちらか）
function getTownFieldId() {
    const manualInput = document.getElementById('k-town-manual');
    return manualInput.style.display !== 'none' ? 'k-town-manual' : 'k-town';
}

document.addEventListener('DOMContentLoaded', () => {
    const prefSelect = document.getElementById('k-pref');

    // 市区町村データの取得が終わるまで都道府県プルダウンを一時的に無効化
    prefSelect.disabled = true;
    prefSelect.innerHTML = '<option value="">読み込み中...</option>';
    const areaCitiesPromise = loadAreaCities().then(() => {
        populatePrefSelect();
        prefSelect.disabled = false;
    });

    prefSelect.addEventListener('change', () => {
        clearError('k-pref-error'); clearInvalid('k-pref');
        const citySelect = document.getElementById('k-city');
        const townSelect = document.getElementById('k-town');
        if (!prefSelect.value) {
            citySelect.disabled = true; citySelect.innerHTML = '<option value="">先に都道府県を選択</option>';
            townSelect.disabled = true; townSelect.innerHTML = '<option value="">先に市区町村を選択</option>';
            return;
        }
        populateCitySelect(prefSelect.value);
        townSelect.disabled = true; townSelect.innerHTML = '<option value="">先に市区町村を選択</option>';
    });

    document.getElementById('k-city').addEventListener('change', async (e) => {
        clearError('k-city-error'); clearInvalid('k-city');
        if (!e.target.value) return;
        await populateTowns(prefSelect.value, e.target.value);
    });

    document.getElementById('k-town').addEventListener('change', () => {
        clearError('k-town-error'); clearInvalid('k-town');
    });

    document.getElementById('k-town-manual-toggle').addEventListener('click', () => {
        const manualInput = document.getElementById('k-town-manual');
        const isManualNow = manualInput.style.display !== 'none';
        switchToManualTown(!isManualNow);
        clearError('k-town-error'); clearInvalid('k-town'); clearInvalid('k-town-manual');
    });

    document.getElementById('k-town-manual').addEventListener('input', () => {
        clearError('k-town-error'); clearInvalid('k-town-manual');
    });

    // 郵便番号フォーマット
    const postcodeInput = document.getElementById('k-postcode');
    postcodeInput.addEventListener('input', (e) => {
        let v = e.target.value.replace(/[^\d]/g, '');
        if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3, 7);
        e.target.value = v;
    });

    // 郵便番号クイック検索 → 対応エリア内であれば都道府県/市区町村/町名を自動選択
    document.getElementById('k-postcode-btn').addEventListener('click', async () => {
        const btn = document.getElementById('k-postcode-btn');
        const raw = postcodeInput.value.replace(/[^\d]/g, '');
        if (raw.length !== 7) { showError('k-postcode-error', '郵便番号（7桁）を入力してください'); return; }
        clearError('k-postcode-error');
        btn.disabled = true;
        btn.querySelector('span').textContent = '検索中...';
        try {
            if (!areaCitiesReady) await areaCitiesPromise;
            const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${raw}`);
            const data = await res.json();
            if (data.status !== 200 || !data.results) throw new Error('not found');
            const r = data.results[0];

            // 対応エリア一覧の中に一致する都道府県・市区町村があるかチェック
            const cities = AREA_CITIES[r.address1] || [];
            const match = cities.find(c => c.value === r.address2);
            if (!match) {
                showError('k-postcode-error', '恐れ入りますが、この住所は対応エリア外の可能性があります。下記からお選びいただくか、お電話にてご相談ください');
                return;
            }

            prefSelect.value = r.address1;
            clearError('k-pref-error'); clearInvalid('k-pref');
            populateCitySelect(r.address1);

            const citySelect = document.getElementById('k-city');
            citySelect.value = match.value;
            clearError('k-city-error'); clearInvalid('k-city');
            const towns = await populateTowns(r.address1, match.value);
            if (towns.includes(r.address3)) {
                document.getElementById('k-town').value = r.address3;
                clearError('k-town-error'); clearInvalid('k-town');
            } else {
                switchToManualTown(true);
                document.getElementById('k-town-manual').value = r.address3;
                clearError('k-town-error'); clearInvalid('k-town-manual');
            }
        } catch {
            showError('k-postcode-error', '自動入力できませんでした。下記からご選択ください');
        } finally {
            btn.disabled = false;
            btn.querySelector('span').textContent = '住所検索';
        }
    });

    /* ── 物件種別カード ── */
    document.querySelectorAll('.type-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.type-card').forEach(c => c.classList.remove('is-selected', 'card-pop'));
            card.classList.add('is-selected');
            void card.offsetWidth; // reflow でポップアニメーションを毎回再生させる
            card.classList.add('card-pop');
            selectedType = card.dataset.type;
            clearError('type-error');
            document.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('is-active'));
            document.getElementById('detail-' + selectedType).classList.add('is-active');
            document.getElementById('step2-title').textContent = TYPE_TITLES[selectedType];
        });
    });

    /* ── ボタン類のリップルエフェクト（次へ・戻る・送信・住所検索・種別カード） ── */
    attachRippleEffect('.wizard-btn, .postcode-btn, .type-card');

    /* ── 電話番号フォーマット ── */
    document.getElementById('k-phone').addEventListener('input', (e) => {
        let v = e.target.value.replace(/[^\d\-+]/g, '');
        v = v[0] === '+' ? '+' + v.slice(1).replace(/\+/g, '') : v.replace(/\+/g, '');
        e.target.value = v;
    });

    /* ── ファイル添付 ── */
    initFileUpload('k-upload-area', 'k-files', 'k-file-list');

    /* ── ブラー時バリデーション ── */
    document.getElementById('k-name').addEventListener('blur', () => {
        const v = document.getElementById('k-name').value.trim();
        if (!v) { showError('k-name-error', 'お名前を入力してください'); setInvalid('k-name'); }
        else { clearError('k-name-error'); clearInvalid('k-name'); }
    });
    document.getElementById('k-phone').addEventListener('blur', () => {
        validatePhone(document.getElementById('k-phone').value.replace(/[^\d+]/g, ''), 'k-phone', 'k-phone-error');
    });
    document.getElementById('k-email').addEventListener('blur', () => {
        validateEmail(document.getElementById('k-email').value.trim(), 'k-email', 'k-email-error');
    });

    initWizard();
});

/* ──────────────────────────────────────────────
   リップルエフェクト（クリックした位置から円が広がる演出）
────────────────────────────────────────────── */
function attachRippleEffect(selector) {
    document.querySelectorAll(selector).forEach(el => {
        el.addEventListener('click', function (e) {
            if (this.disabled) return;
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const ripple = document.createElement('span');
            ripple.className = 'ripple-effect';
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
            ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
            this.appendChild(ripple);
            ripple.addEventListener('animationend', () => ripple.remove());
        });
    });
}

/* ──────────────────────────────────────────────
   ファイルアップロード（QA と共通ロジック）
────────────────────────────────────────────── */
function initFileUpload(areaId, inputId, listId) {
    const area = document.getElementById(areaId);
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!area || !input || !list) return;
    let files = [];

    function renderList() {
        list.innerHTML = '';
        files.forEach((f, i) => {
            const item = document.createElement('div');
            item.className = 'file-upload-item';
            item.innerHTML = `<span>📄 ${f.name} <span style="color:var(--color-text-muted)">(${(f.size / 1024).toFixed(0)}KB)</span></span>
        <button type="button" aria-label="remove">✕</button>`;
            item.querySelector('button').addEventListener('click', () => { files.splice(i, 1); renderList(); });
            list.appendChild(item);
        });
    }
    area.addEventListener('click', () => input.click());
    area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
    area.addEventListener('drop', e => {
        e.preventDefault(); area.classList.remove('drag-over');
        [...e.dataTransfer.files].forEach(f => files.push(f));
        renderList();
    });
    input.addEventListener('change', () => {
        [...input.files].forEach(f => files.push(f));
        renderList();
        input.value = '';
    });
    area._getFiles = () => files;
}

/* ──────────────────────────────────────────────
   ウィザード制御
────────────────────────────────────────────── */
function initWizard() {
    document.getElementById('k-next').addEventListener('click', () => {
        if (!validateStep(currentStep)) return;
        currentStep++;
        if (currentStep === STEP_COUNT - 1) renderConfirmSummary();
        goToStep(currentStep);
    });
    document.getElementById('k-back').addEventListener('click', () => {
        if (currentStep === 0) return;
        currentStep--;
        goToStep(currentStep);
    });
    document.getElementById('kantei-form-el').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            if (currentStep < STEP_COUNT - 1) document.getElementById('k-next').click();
        }
    });
    document.getElementById('kantei-form-el').addEventListener('submit', onSubmit);
    goToStep(0);
}

function goToStep(n) {
    const direction = n >= lastActiveStep ? 'slide-forward' : 'slide-back';
    lastActiveStep = n;

    document.querySelectorAll('.wizard-step').forEach(s => {
        const isActive = Number(s.dataset.step) === n;
        s.classList.toggle('is-active', isActive);
        s.classList.remove('slide-forward', 'slide-back');
        if (isActive) {
            void s.offsetWidth; // アニメーションを毎回リトリガー
            s.classList.add(direction);
        }
    });
    document.querySelectorAll('.progress-step').forEach(p => {
        const i = Number(p.dataset.stepIndex);
        const wasActive = p.classList.contains('is-active');
        p.classList.toggle('is-active', i === n);
        p.classList.toggle('is-done', i < n);
        if (i === n && !wasActive) {
            const dot = p.querySelector('.progress-dot');
            dot.classList.remove('dot-pulse');
            void dot.offsetWidth;
            dot.classList.add('dot-pulse');
        }
    });
    document.getElementById('k-back').style.visibility = n === 0 ? 'hidden' : 'visible';
    const isLast = n === STEP_COUNT - 1;
    document.getElementById('k-next').style.display = isLast ? 'none' : '';
    document.getElementById('k-submit').style.display = isLast ? '' : 'none';
    document.querySelector('.wizard-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateStep(n) {
    if (n === 0) {
        if (!selectedType) { showError('type-error'); return false; }
        clearError('type-error');
        return true;
    }
    if (n === 1) {
        let valid = true;
        if (!document.getElementById('k-pref').value) { showError('k-pref-error'); setInvalid('k-pref'); valid = false; }
        else clearInvalid('k-pref');
        if (!document.getElementById('k-city').value) { showError('k-city-error'); setInvalid('k-city'); valid = false; }
        else clearInvalid('k-city');
        if (!getTownValue()) { showError('k-town-error'); setInvalid(getTownFieldId()); valid = false; }
        else { clearError('k-town-error'); clearInvalid('k-town'); clearInvalid('k-town-manual'); }
        if (!document.getElementById('k-chiban').value) { showError('k-chiban-error'); setInvalid('k-chiban'); valid = false; }
        else clearInvalid('k-chiban');
        if (!valid) document.querySelector('[data-step="1"] .input-error, [data-step="1"] .form-error.visible')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return valid;
    }
    if (n === 2) {
        return true; // 物件詳細はすべて任意
    }
    if (n === 3) {
        let valid = true;
        const name = document.getElementById('k-name').value.trim();
        if (!name) { showError('k-name-error', 'お名前を入力してください'); setInvalid('k-name'); valid = false; }
        else { clearError('k-name-error'); clearInvalid('k-name'); }

        const phoneRaw = document.getElementById('k-phone').value.replace(/[^\d+]/g, '');
        if (!validatePhone(phoneRaw, 'k-phone', 'k-phone-error')) valid = false;

        const emailVal = document.getElementById('k-email').value.trim();
        if (!validateEmail(emailVal, 'k-email', 'k-email-error')) valid = false;

        if (!phoneRaw && !emailVal) {
            showError('k-contact-error');
            setInvalid('k-phone'); setInvalid('k-email');
            valid = false;
        } else {
            clearError('k-contact-error');
        }
        if (!valid) document.querySelector('[data-step="3"] .input-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return valid;
    }
    return true;
}

function typeDetailSummary() {
    if (selectedType === 'sokochi') {
        return [
            ['契約形態', document.getElementById('sokochi-contract').selectedOptions[0]?.text],
            ['現在の地代（目安）', document.getElementById('sokochi-rent').value.trim() || '未記入'],
        ];
    }
    if (selectedType === 'akiya') {
        return [
            ['種別', document.getElementById('akiya-type').selectedOptions[0]?.text],
            ['築年数（目安）', document.getElementById('akiya-age').selectedOptions[0]?.text],
            ['土地面積（目安）', document.getElementById('akiya-area').value.trim() || '未記入'],
            ['相続財産か', document.getElementById('akiya-inherited').selectedOptions[0]?.text],
        ];
    }
    if (selectedType === 'mansion') {
        return [
            ['総戸数', document.getElementById('mansion-units').value.trim() || '未記入'],
            ['入居率（目安）', document.getElementById('mansion-occupancy').selectedOptions[0]?.text],
            ['年間家賃収入（目安）', document.getElementById('mansion-income').value.trim() || '未記入'],
        ];
    }
    return [];
}

function renderConfirmSummary() {
    const typeLabels = { sokochi: '底地', akiya: '空き家・空き地', mansion: '一棟マンション' };
    const town = getTownValue();
    const rows = [
        [0, '物件種別', typeLabels[selectedType] || '-'],
        [1, '所在地', `${document.getElementById('k-pref').value} ${document.getElementById('k-city').value} ${town}`],
        [1, '地番・号', document.getElementById('k-chiban').value.trim() || '未記入（後ほど確認）'],
        ...typeDetailSummary().map(([label, val]) => [2, label, val || '-']),
        [2, 'メッセージ', document.getElementById('k-message').value.trim() || '未記入'],
        [3, 'お名前', document.getElementById('k-name').value.trim()],
        [3, '電話番号', document.getElementById('k-phone').value.trim() || '未記入'],
        [3, 'メールアドレス', document.getElementById('k-email').value.trim() || '未記入'],
        [3, 'ご住所', document.getElementById('k-address').value.trim() || '未記入'],
    ];
    const list = document.getElementById('k-confirm-list');
    list.innerHTML = rows.map(([step, label, val]) => `
    <div class="confirm-item">
      <div class="confirm-item-main">
        <div class="confirm-item-label">${escapeHtml(label)}</div>
        <div class="confirm-item-value">${escapeHtml(val)}</div>
      </div>
      <button type="button" class="confirm-edit-link" data-goto="${step}">修正</button>
    </div>
  `).join('');
    list.querySelectorAll('.confirm-edit-link').forEach(btn => {
        btn.addEventListener('click', () => { currentStep = Number(btn.dataset.goto); goToStep(currentStep); });
    });
}

/* ──────────────────────────────────────────────
   送信
────────────────────────────────────────────── */
async function onSubmit(e) {
    e.preventDefault();
    if (isBotSubmission('k-hp')) { fakeSuccessAndHide('kantei-form-el', 'k-formSuccess'); return; }

    const btn = document.getElementById('k-submit');
    const sendErr = document.getElementById('k-sendError');
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.querySelector('span').innerHTML = '<i class="btn-spinner"></i>送信中...';
    sendErr.classList.remove('visible');

    const formData = new FormData();
    formData.append('property_type', selectedType || '');
    formData.append('pref', document.getElementById('k-pref').value);
    formData.append('city', document.getElementById('k-city').value);
    formData.append('town', getTownValue());
    formData.append('chiban', document.getElementById('k-chiban').value.trim());
    formData.append('message', document.getElementById('k-message').value.trim());
    formData.append('name', document.getElementById('k-name').value.trim());
    formData.append('phone', document.getElementById('k-phone').value.trim());
    formData.append('email', document.getElementById('k-email').value.trim());
    formData.append('address', document.getElementById('k-address').value.trim());
    formData.append('hp', document.getElementById('k-hp').value);
    formData.append('ts', String(PAGE_LOAD_TS));

    if (selectedType === 'sokochi') {
        formData.append('sokochi_contract', document.getElementById('sokochi-contract').value);
        formData.append('sokochi_rent', document.getElementById('sokochi-rent').value.trim());
    } else if (selectedType === 'akiya') {
        formData.append('akiya_type', document.getElementById('akiya-type').value);
        formData.append('akiya_age', document.getElementById('akiya-age').value);
        formData.append('akiya_area', document.getElementById('akiya-area').value.trim());
        formData.append('akiya_inherited', document.getElementById('akiya-inherited').value);
    } else if (selectedType === 'mansion') {
        formData.append('mansion_units', document.getElementById('mansion-units').value.trim());
        formData.append('mansion_occupancy', document.getElementById('mansion-occupancy').value);
        formData.append('mansion_income', document.getElementById('mansion-income').value.trim());
    }

    const files = document.getElementById('k-upload-area')._getFiles();
    files.forEach(f => formData.append('files', f));

    try {
        const res = await fetch(API_URL_KANTEI, { method: 'POST', body: formData });
        const data = await res.json();
        if (res.ok && data.success) {
            if (typeof gtag === 'function') {
                gtag('event', 'generate_lead', { form_type: 'kantei', form_name: 'kantei-form-el' });
            }
            document.getElementById('kantei-form-el').style.display = 'none';
            document.getElementById('k-formSuccess').classList.add('visible');
        } else {
            sendErr.textContent = data.error || '送信に失敗しました。時間をおいて再度お試しください';
            sendErr.classList.add('visible');
            btn.disabled = false;
            btn.classList.remove('is-loading');
            btn.querySelector('span').textContent = '送信する';
        }
    } catch {
        sendErr.textContent = '通信エラーが発生しました。時間をおいて再度お試しください';
        sendErr.classList.add('visible');
        btn.disabled = false;
        btn.classList.remove('is-loading');
        btn.querySelector('span').textContent = '送信する';
    }
}