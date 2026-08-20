export interface ProfileCompletenessInput {
  totpEnabled: boolean;
  profile: {
    bio: string | null;
    industry: string | null;
    location: string | null;
    avatarUrl: string | null;
  } | null;
}

const CHECKS: Array<{
  key: string;
  check: (input: ProfileCompletenessInput) => boolean;
}> = [
  { key: "bio", check: (i) => !!i.profile?.bio },
  { key: "industry", check: (i) => !!i.profile?.industry },
  { key: "location", check: (i) => !!i.profile?.location },
  { key: "avatarUrl", check: (i) => !!i.profile?.avatarUrl },
  { key: "totpEnabled", check: (i) => i.totpEnabled },
];

export function computeProfileCompleteness(input: ProfileCompletenessInput): {
  percent: number;
  missing: string[];
} {
  const missing = CHECKS.filter((c) => !c.check(input)).map((c) => c.key);
  const percent = Math.round(
    ((CHECKS.length - missing.length) / CHECKS.length) * 100,
  );
  return { percent, missing };
}
