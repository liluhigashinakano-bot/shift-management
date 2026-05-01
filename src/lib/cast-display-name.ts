/** シフト表の出勤タグなどに出す短い表示名（DBの name は「あい」、画面は「体入あい」） */
export function castSuffixForShiftBadge(cast: {
  name: string;
  isTrialGuest?: boolean | null;
}): string {
  return cast.isTrialGuest ? `体入${cast.name}` : cast.name;
}
