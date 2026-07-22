import { PageLoadMotion } from "@/components/ui/PageLoadMotion";

export default function ChatLeaderboardLoading() {
  return (
    <PageLoadMotion
      titleWidth="w-56"
      rows={8}
      label="Loading chat leaderboard"
    />
  );
}
