import { apiError, parseQuery } from "@/lib/api-helpers";
import { ChatLeaderboardQuerySchema } from "@/lib/schemas";
import { queryChatLeaderboard } from "@/lib/server/chatAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = parseQuery(ChatLeaderboardQuerySchema, url.searchParams);
    if (!parsed.ok) return parsed.response;

    const data = queryChatLeaderboard(parsed.data.category);
    return Response.json(data);
  } catch (err) {
    console.error("[api/chat/leaderboard GET]", err);
    return apiError("INTERNAL_ERROR", 500, "Unexpected error");
  }
}
