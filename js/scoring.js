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

function calcScores(data) {
  const { participants, matches, knockoutResults, bonuses } = data;

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
    (knockoutResults[round] || []).forEach(team => {
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
        (knockoutResults.champion === country ? POINTS.championOwner : 0);

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
