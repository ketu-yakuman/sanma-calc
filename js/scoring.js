// ===== 得点計算ロジック =====

const POINTS = {
  // グループリーグ
  group_win: 3,
  group_draw: 1,
  group_loss: 0,
  // 決勝トーナメント
  round_of_32: 3,
  round_of_16: 5,
  quarter_finals: 8,
  semi_finals: 12,
  final: 15,
  champion: 25,
  third_place: 10,
  // ボーナス
  topScorer: 10,
  mvp: 10,
  championOwner: 10
};

// FIFAランキング（50位以下の国は得点2倍）
const FIFA_RANKINGS_SCORE = {
  "アルゼンチン": 1, "スペイン": 2, "フランス": 3, "イングランド": 4,
  "ポルトガル": 5, "ブラジル": 6, "モロッコ": 7, "オランダ": 8,
  "ベルギー": 9, "ドイツ": 10, "クロアチア": 11, "コロンビア": 13,
  "メキシコ": 14, "セネガル": 15, "アメリカ": 16, "ウルグアイ": 17,
  "日本": 18, "スイス": 19, "イラン": 20, "トルコ": 22,
  "オーストリア": 23, "エクアドル": 24, "韓国": 25, "オーストラリア": 27,
  "アルジェリア": 28, "エジプト": 29, "カナダ": 30, "ノルウェー": 31,
  "コートジボワール": 33, "パナマ": 34, "スウェーデン": 38, "チェコ": 39,
  "パラグアイ": 40, "スコットランド": 43, "コンゴDR": 45, "チュニジア": 46,
  "ウズベキスタン": 50, "カタール": 55, "イラク": 56, "南アフリカ": 60,
  "サウジアラビア": 61, "ヨルダン": 63, "ボスニア・ヘルツェゴビナ": 64,
  "カーボベルデ": 68, "ガーナ": 73, "ハイチ": 81, "キュラソー": 83,
  "ニュージーランド": 85
};

// 50位以下（グレー）の国は得点2倍
function getMultiplier(country) {
  const rank = FIFA_RANKINGS_SCORE[country];
  if (!rank || rank >= 50) return 2;
  return 1;
}

// 試合の勝者を判定（90分→延長→PKの順）
function getMatchWinner(m) {
  if (!m || !m.played || m.homeScore === null || m.awayScore === null) return '';
  if (m.homeScore > m.awayScore) return m.home;
  if (m.awayScore > m.homeScore) return m.away;
  if (m.penalties) return m.penalties.home > m.penalties.away ? m.home : m.away;
  return '';
}

// knockoutMatches（試合結果）から各ラウンドの進出国を自動算出し、
// knockoutResults（手動入力）とマージする。
// 自動算出を優先し、手動入力は自動算出できない箇所の補完として使う。
function deriveKnockoutResults(data) {
  const km = data.knockoutMatches || [];
  const manual = data.knockoutResults || {};
  const byRound = {};
  ['round_of_32','round_of_16','quarter_finals','semi_finals','final'].forEach(r => byRound[r] = []);
  km.forEach(m => { if (byRound[m.round]) byRound[m.round].push(m); });

  // ベスト32は手動入力（knockoutResults.round_of_32）をそのまま正とする
  const r32 = (manual.round_of_32 || []).filter(Boolean);

  // R32試合の勝者からR16進出国を自動算出
  const r32Winners = byRound['round_of_32']
    .map(m => getMatchWinner(m))
    .filter(Boolean);

  // R16進出国 = 自動算出された勝者 + 手動入力されている分（重複除去）
  const manualR16 = (manual.round_of_16 || []).filter(Boolean);
  const r16 = [...new Set([...r32Winners, ...manualR16])];

  // R16試合の勝者からQF進出国を自動算出
  const r16Winners = byRound['round_of_16']
    .map(m => getMatchWinner(m))
    .filter(Boolean);
  const manualQF = (manual.quarter_finals || []).filter(Boolean);
  const qf = [...new Set([...r16Winners, ...manualQF])];

  // QF試合の勝者からSF進出国を自動算出
  const qfWinners = byRound['quarter_finals']
    .map(m => getMatchWinner(m))
    .filter(Boolean);
  const manualSF = (manual.semi_finals || []).filter(Boolean);
  const sf = [...new Set([...qfWinners, ...manualSF])];

  // SF試合の勝者から決勝進出国を自動算出
  const sfWinners = byRound['semi_finals']
    .map(m => getMatchWinner(m))
    .filter(Boolean);
  const manualFinal = (manual.final || []).filter(Boolean);
  const final = [...new Set([...sfWinners, ...manualFinal])];

  // 決勝の勝者 = 優勝国（手動入力があればそちらを優先）
  const finalWinner = getMatchWinner(byRound['final'][0]);
  const champion = manual.champion || finalWinner || '';

  // 3位決定戦の勝者
  const thirdMatch = (data.knockoutMatches || []).find(m => m.round === 'third_place');
  const thirdWinner = thirdMatch ? getMatchWinner(thirdMatch) : '';
  const third_place = manual.third_place || thirdWinner || '';

  return {
    round_of_32: r32,
    round_of_16: r16,
    quarter_finals: qf,
    semi_finals: sf,
    final: final,
    champion: champion,
    third_place: third_place
  };
}

// 指定した国の得点内訳を計算する（グループリーグの勝敗・決勝T進出・ボーナス等）
function getCountryBreakdown(data, country) {
  const { matches, bonuses } = data;
  const knockoutResults = deriveKnockoutResults(data);
  const multiplier = getMultiplier(country);

  const items = []; // { label, points, multiplied } の配列

  // グループリーグの各試合結果
  let groupWinCount = 0, groupDrawCount = 0, groupLossCount = 0;
  matches.forEach(match => {
    if (!match.played || match.homeScore === null || match.awayScore === null) return;
    const { home, away, homeScore, awayScore } = match;
    if (home !== country && away !== country) return;

    if (homeScore === awayScore) {
      groupDrawCount++;
    } else if ((home === country && homeScore > awayScore) || (away === country && awayScore > homeScore)) {
      groupWinCount++;
    } else {
      groupLossCount++;
    }
  });
  if (groupWinCount > 0) items.push({ label: `勝ち点 ×${groupWinCount}`, points: POINTS.group_win * groupWinCount, multiplied: true });
  if (groupDrawCount > 0) items.push({ label: `引き分け ×${groupDrawCount}`, points: POINTS.group_draw * groupDrawCount, multiplied: true });
  if (groupLossCount > 0) items.push({ label: `敗戦 ×${groupLossCount}`, points: 0, multiplied: true });

  // 決勝トーナメント各ラウンド進出
  const roundLabels = {
    round_of_32: 'ベスト32進出',
    round_of_16: 'ベスト16進出',
    quarter_finals: 'ベスト8進出',
    semi_finals: 'ベスト4進出',
    final: '決勝進出',
  };
  ['round_of_32', 'round_of_16', 'quarter_finals', 'semi_finals', 'final'].forEach(round => {
    if ((knockoutResults[round] || []).includes(country)) {
      items.push({ label: roundLabels[round], points: POINTS[round], multiplied: true });
    }
  });
  if (knockoutResults.champion === country) {
    items.push({ label: '優勝', points: POINTS.champion, multiplied: true });
  }

  // ボーナス（2倍補正なし）
  if (bonuses.topScorer === country) items.push({ label: '得点王ボーナス', points: POINTS.topScorer, multiplied: false });
  if (bonuses.mvp === country) items.push({ label: 'MVPボーナス', points: POINTS.mvp, multiplied: false });
  if (knockoutResults.champion === country) items.push({ label: '優勝国ボーナス', points: POINTS.championOwner, multiplied: false });
  if (knockoutResults.third_place === country) items.push({ label: '3位決定戦勝利ボーナス', points: POINTS.third_place, multiplied: false });

  // ペナルティ（2倍補正なし）
  if (bonuses.mostRed === country) items.push({ label: '最多レッドカード国ペナルティ', points: -10, multiplied: false });
  if (bonuses.mostConceded === country) items.push({ label: '最多失点国ペナルティ', points: -10, multiplied: false });

  // 合計計算（multiplied=trueの項目のみ2倍対象）
  const baseSum = items.filter(i => i.multiplied).reduce((s, i) => s + i.points, 0);
  const bonusSum = items.filter(i => !i.multiplied).reduce((s, i) => s + i.points, 0);
  const total = baseSum * multiplier + bonusSum;

  return { items, multiplier, baseSum, bonusSum, total };
}

function calcScores(data) {
  const { participants, matches, bonuses } = data;
  // knockoutMatchesの試合結果から自動算出した進出国情報を使う
  const knockoutResults = deriveKnockoutResults(data);

  // 国ごとのグループリーグ得点を集計
  const countryGroupPoints = {};
  matches.forEach(match => {
    if (!match.played) return;
    const { home, away, homeScore, awayScore } = match;
    if (homeScore === null || awayScore === null) return;

    if (homeScore > awayScore) {
      countryGroupPoints[home] = (countryGroupPoints[home] || 0) + POINTS.group_win;
      countryGroupPoints[away] = (countryGroupPoints[away] || 0) + POINTS.group_loss;
    } else if (homeScore === awayScore) {
      countryGroupPoints[home] = (countryGroupPoints[home] || 0) + POINTS.group_draw;
      countryGroupPoints[away] = (countryGroupPoints[away] || 0) + POINTS.group_draw;
    } else {
      countryGroupPoints[home] = (countryGroupPoints[home] || 0) + POINTS.group_loss;
      countryGroupPoints[away] = (countryGroupPoints[away] || 0) + POINTS.group_win;
    }
  });

  // 決勝トーナメント各ラウンドの進出国ポイント
  const countryKnockoutPoints = {};
  const rounds = ['round_of_32', 'round_of_16', 'quarter_finals', 'semi_finals', 'final'];
  rounds.forEach(round => {
    (knockoutResults[round] || []).filter(t => t).forEach(team => {
      countryKnockoutPoints[team] = (countryKnockoutPoints[team] || 0) + POINTS[round];
    });
  });
  if (knockoutResults.champion) {
    const champ = knockoutResults.champion;
    countryKnockoutPoints[champ] = (countryKnockoutPoints[champ] || 0) + POINTS.champion;
  }

  // 参加者ごとのスコア計算
  return participants.map(p => {
    let total = 0;
    let breakdown = {};

    p.countries.forEach(country => {
      const multiplier = getMultiplier(country);
      let pts = 0;
      pts += (countryGroupPoints[country] || 0);
      pts += (countryKnockoutPoints[country] || 0);

      // ボーナス・ペナルティ（2倍補正の対象外）
      const bonus =
        (bonuses.topScorer === country ? POINTS.topScorer : 0) +
        (bonuses.mvp === country ? POINTS.mvp : 0) +
        (knockoutResults.champion === country ? POINTS.championOwner : 0) +
        (knockoutResults.third_place === country ? POINTS.third_place : 0);

      const penalty =
        (bonuses.mostRed === country ? 10 : 0) +
        (bonuses.mostConceded === country ? 10 : 0);

      pts = pts * multiplier + bonus - penalty;

      breakdown[country] = pts;
      total += pts;
    });

    return { ...p, total, breakdown };
  }).sort((a, b) => b.total - a.total);
}
