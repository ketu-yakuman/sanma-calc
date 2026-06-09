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
      let pts = 0;
      pts += (countryGroupPoints[country] || 0);
      pts += (countryKnockoutPoints[country] || 0);

      // ボーナス
      if (bonuses.topScorer === country) pts += POINTS.topScorer;
      if (bonuses.mvp === country) pts += POINTS.mvp;
      if (knockoutResults.champion === country) pts += POINTS.championOwner;

      breakdown[country] = pts;
      total += pts;
    });

    return { ...p, total, breakdown };
  }).sort((a, b) => b.total - a.total);
}
