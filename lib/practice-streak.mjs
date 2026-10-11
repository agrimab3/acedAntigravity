/** Calendar-day practice streaks in UTC, based on completed sessions. */
export function getPracticeStreaks(completedAt, today = new Date()) {
  const days = [...new Set(completedAt.filter(Boolean).map(value => new Date(value).toISOString().slice(0, 10)))].sort().reverse();
  if (!days.length) return {current:0,best:0};
  const dayNumber = value => Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);
  let best=0,run=0,previous=null;
  for (const day of days) {const n=dayNumber(day);run=previous!==null&&previous-n===1?run+1:1;best=Math.max(best,run);previous=n;}
  const todayN=dayNumber(today.toISOString().slice(0,10));
  const first=dayNumber(days[0]);let current=0;
  if (todayN-first<=1 && todayN-first>=0) {let last=first;for(const day of days){const n=dayNumber(day);if(last-n>1)break;current++;last=n;}}
  return {current,best};
}
