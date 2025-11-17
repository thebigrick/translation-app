import { NextRequest, NextResponse } from "next/server";
import { createGraphQLClient } from "@bigcommerce/translations-graphql-client";
import { getSessionFromContext } from "@/lib/auth";

const CATEGORIES_PAGE_SIZE = 50;

async function fetchAllCategoryTranslations(
  graphqlClient: any,
  channelId: number,
  locale: string
) {
  const allEdges: any[] = [];
  let cursor: string | undefined;

  while (true) {
    const result = await graphqlClient.getCategoryTranslations({
      channelId,
      locale,
      first: CATEGORIES_PAGE_SIZE,
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

// GET - Fetch categories with translations
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

    console.log('[Categories GET] Fetching paginated category translations');
    const edges = await fetchAllCategoryTranslations(
      graphqlClient,
      Number(channelId),
      locale
    );

    console.log('[Categories GET] Total edges fetched:', edges.length);

    // Transform data
    // Note: Category translations API returns resourceId (e.g. "bc/store/category/123")
    // and fields array with fieldName, original, and translation
    const categories = edges.map((edge: any) => {
      const categoryId = edge.node.resourceId?.split("/").pop() || "0";
      const nameField = edge.node.fields?.find((f: any) => f.fieldName === "name");
      
      return {
        id: parseInt(categoryId, 10),
        name: nameField?.original || "",
        translation: nameField?.translation || "",
      };
    });

    console.log('[Categories GET] Returning categories:', categories.length);
    return NextResponse.json(categories);
  } catch (error: any) {
    console.error("[Categories GET] Error fetching categories:", error);
    console.error("[Categories GET] Error details:", {
      message: error.message,
      stack: error.stack,
      response: error.response,
      status: error.status,
      errors: error.errors,
    });
    
    // Log the full error object
    if (error.errors && Array.isArray(error.errors)) {
      console.error("[Categories GET] GraphQL Errors:", JSON.stringify(error.errors, null, 2));
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

// PUT - Update category translation
export async function PUT(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const context = searchParams.get("context");
    const body = await request.json();

    const { categoryId, channelId, locale, translation } = body;

    if (!categoryId || !channelId || !locale) {
      return NextResponse.json(
        { error: "categoryId, channelId, and locale are required" },
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

    // Update category translation
    const fields = [];
    if (translation) {
      fields.push({
        fieldName: "name",
        value: translation,
      });
    }

    if (fields.length > 0) {
      await graphqlClient.updateCategoryTranslations({
        channelId: Number(channelId),
        locale,
        categories: [
          {
            categoryId: Number(categoryId),
            fields,
          },
        ],
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating category translation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update translation" },
      { status: 500 }
    );
  }
}

