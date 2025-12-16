import { NextRequest, NextResponse } from "next/server";
import { createGraphQLClient } from "@bigcommerce/translations-graphql-client";
import { getSessionFromContext } from "@/lib/auth";

const BRANDS_PAGE_SIZE = 50;

async function fetchAllBrandTranslations(
  graphqlClient: any,
  channelId: number,
  locale: string
) {
  const allEdges: any[] = [];
  let cursor: string | undefined;

  while (true) {
    const result = await graphqlClient.getBrandTranslations({
      channelId,
      locale,
      first: BRANDS_PAGE_SIZE,
      after: cursor,
    });

    const edges = result.edges || [];
    allEdges.push(...edges);

    const pageInfo = result.pageInfo;
    if (pageInfo?.hasNextPage && pageInfo.endCursor) {
      cursor = pageInfo.endCursor;
    } else {
      break;
    }
  }

  return allEdges;
}

// GET - Fetch brands with translations
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const context = searchParams.get("context");
    const channelId = searchParams.get("channelId");
    const locale = searchParams.get("locale");

    if (!channelId || !locale) {
      return NextResponse.json(
        { error: "channelId and locale are required" },
        { status: 400 }
      );
    }

    if (!context) {
      return NextResponse.json(
        { error: "Context is required" },
        { status: 400 }
      );
    }

    // Get session from context
    const { accessToken, storeHash } = await getSessionFromContext(context);

    // Create GraphQL client
    const graphqlClient = createGraphQLClient(accessToken, storeHash);

    console.log('[Brands GET] Fetching paginated brand translations');
    const edges = await fetchAllBrandTranslations(
      graphqlClient,
      Number(channelId),
      locale
    );

    console.log('[Brands GET] Total edges fetched:', edges.length);

    // Transform data
    // Note: Brand translations API returns resourceId (e.g. "bc/store/brand/123")
    // and fields array with fieldName, original, and translation
    const brands = edges.map((edge: any) => {
      const brandId = edge.node.resourceId?.split("/").pop() || "0";
      const nameField = edge.node.fields?.find((f: any) => f.fieldName === "name");
      
      return {
        id: parseInt(brandId, 10),
        name: nameField?.original || "",
        translation: nameField?.translation || "",
      };
    });

    console.log('[Brands GET] Returning brands:', brands.length);
    return NextResponse.json(brands);
  } catch (error: any) {
    console.error("[Brands GET] Error fetching brands:", error);
    console.error("[Brands GET] Error details:", {
      message: error.message,
      stack: error.stack,
      response: error.response,
      status: error.status,
      errors: error.errors,
    });
    
    // Log the full error object
    if (error.errors && Array.isArray(error.errors)) {
      console.error("[Brands GET] GraphQL Errors:", JSON.stringify(error.errors, null, 2));
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to fetch brands" },
      { status: 500 }
    );
  }
}

// PUT - Update brand translation
export async function PUT(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const context = searchParams.get("context");
    const body = await request.json();

    const { brandId, channelId, locale, translation } = body;

    if (!brandId || !channelId || !locale) {
      return NextResponse.json(
        { error: "brandId, channelId, and locale are required" },
        { status: 400 }
      );
    }

    if (!context) {
      return NextResponse.json(
        { error: "Context is required" },
        { status: 400 }
      );
    }

    // Get session from context
    const { accessToken, storeHash } = await getSessionFromContext(context);

    // Create GraphQL client
    const graphqlClient = createGraphQLClient(accessToken, storeHash);

    // Update brand translation
    const fields = [];
    if (translation) {
      fields.push({
        fieldName: "name",
        value: translation,
      });
    }

    if (fields.length > 0) {
      await graphqlClient.updateBrandTranslations({
        channelId: Number(channelId),
        locale,
        brands: [
          {
            brandId: Number(brandId),
            fields,
          },
        ],
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating brand translation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update translation" },
      { status: 500 }
    );
  }
}

