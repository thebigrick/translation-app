import { type NextRequest } from "next/server";
import { getSessionFromContext } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const context = searchParams.get("context") ?? "";

  try {
    const { storeHash } = await getSessionFromContext(context);

    return Response.json({ storeHash });
  } catch (error: any) {
    const { message, response } = error;

    return new Response(
      message || "Unable to determine the store hash for this session",
      {
        status: response?.status || 500,
      }
    );
  }
}


